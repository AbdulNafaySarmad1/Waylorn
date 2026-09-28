// waylorn-gateway polls one explicitly configured OT register range and forwards
// observations over an outbound-only connection. It cannot issue device writes.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"time"
)

type config struct {
	reader, endpoint, kind, siteID, assetID, apiURL, issuer, clientID, secret, spool string
	// intervalMs is the current budgeted interval; requestedMs is the locally approved floor.
	unit, start, count, intervalMs, requestedMs int
}

type registerResult struct {
	SchemaVersion int   `json:"schemaVersion"`
	Values        []int `json:"values"`
}

type sample struct {
	SignalKey string `json:"signalKey"`
	Value     int    `json:"value"`
}

type observation struct {
	SchemaVersion      int       `json:"schemaVersion"`
	RequestID          string    `json:"requestId"`
	SiteID             string    `json:"siteId"`
	AssetID            string    `json:"assetId"`
	Source             string    `json:"source"`
	ObservedUtc        time.Time `json:"observedUtc"`
	ExpectedIntervalMs int       `json:"expectedIntervalMs"`
	Values             []sample  `json:"values"`
}

const maxReplayPerDrain = 50
const maxSpoolFiles = 10000

func main() {
	cfg, err := loadConfig()
	if err != nil {
		log.Fatal(err)
	}
	client, err := newClient()
	if err != nil {
		log.Fatal(err)
	}
	if err := os.MkdirAll(cfg.spool, 0700); err != nil {
		log.Fatal(err)
	}
	auth := &tokenProvider{client: client, cfg: cfg}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if len(os.Args) == 2 && os.Args[1] == "--once" {
		if _, err := runCycle(ctx, cfg, client, auth); err != nil && ctx.Err() == nil {
			log.Fatal(err)
		}
		return
	}
	if len(os.Args) != 1 {
		log.Fatal("usage: waylorn-gateway [--once]")
	}
	ticker := time.NewTicker(time.Duration(cfg.intervalMs) * time.Millisecond)
	defer ticker.Stop()
	for {
		assigned, err := runCycle(ctx, cfg, client, auth)
		if err != nil && ctx.Err() == nil {
			log.Printf("observation cycle: %v", err)
		}
		if next := nextInterval(cfg, assigned); next != cfg.intervalMs {
			log.Printf("site polling budget: interval %d ms -> %d ms", cfg.intervalMs, next)
			cfg.intervalMs = next
			ticker.Reset(time.Duration(next) * time.Millisecond)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// nextInterval adopts the control plane's site budget assignment, but never polls faster than the
// locally approved interval. No assignment (unreachable API, older server) keeps the current pace.
func nextInterval(c config, assigned int) int {
	if assigned < c.requestedMs || assigned > 3600000 {
		return c.intervalMs
	}
	return assigned
}

func required(name string) string {
	return strings.TrimSpace(os.Getenv(name))
}

func loadConfig() (config, error) {
	c := config{
		reader: required("WAYLORN_OT_READER"), endpoint: required("WAYLORN_MODBUS_ADDRESS"),
		kind: required("WAYLORN_MODBUS_KIND"), siteID: required("WAYLORN_SITE_ID"),
		assetID: required("WAYLORN_ASSET_ID"), apiURL: strings.TrimRight(required("WAYLORN_API_URL"), "/"),
		issuer:   strings.TrimRight(required("WAYLORN_OIDC_ISSUER"), "/"),
		clientID: required("WAYLORN_OIDC_CLIENT_ID"), secret: required("WAYLORN_OIDC_CLIENT_SECRET"),
		spool: required("WAYLORN_SPOOL_DIR"),
	}
	for _, field := range []struct{ name, value string }{
		{"WAYLORN_OT_READER", c.reader}, {"WAYLORN_MODBUS_ADDRESS", c.endpoint},
		{"WAYLORN_MODBUS_KIND", c.kind}, {"WAYLORN_SITE_ID", c.siteID},
		{"WAYLORN_ASSET_ID", c.assetID}, {"WAYLORN_API_URL", c.apiURL},
		{"WAYLORN_OIDC_ISSUER", c.issuer}, {"WAYLORN_OIDC_CLIENT_ID", c.clientID},
		{"WAYLORN_OIDC_CLIENT_SECRET", c.secret}, {"WAYLORN_SPOOL_DIR", c.spool},
	} {
		if field.value == "" {
			return c, fmt.Errorf("%s is required", field.name)
		}
	}
	if !filepath.IsAbs(c.reader) || !filepath.IsAbs(c.spool) {
		return c, errors.New("reader and spool paths must be absolute")
	}
	var err error
	for _, field := range []struct {
		name   string
		target *int
	}{
		{"WAYLORN_MODBUS_UNIT", &c.unit}, {"WAYLORN_MODBUS_START", &c.start},
		{"WAYLORN_MODBUS_COUNT", &c.count}, {"WAYLORN_POLL_INTERVAL_MS", &c.intervalMs},
	} {
		*field.target, err = strconv.Atoi(required(field.name))
		if err != nil {
			return c, fmt.Errorf("%s must be an integer", field.name)
		}
	}
	host, _, err := net.SplitHostPort(c.endpoint)
	if err != nil || net.ParseIP(host) == nil {
		return c, errors.New("Modbus address must be a numeric IP and port")
	}
	if c.kind != "holding" && c.kind != "input" {
		return c, errors.New("Modbus kind must be holding or input")
	}
	if c.unit < 0 || c.unit > 255 || c.start < 0 || c.start > 65535 ||
		c.count < 1 || c.count > 125 || c.start+c.count > 65536 ||
		c.intervalMs < 250 || c.intervalMs > 3600000 {
		return c, errors.New("Modbus read range or polling interval is outside bounds")
	}
	c.requestedMs = c.intervalMs
	for _, raw := range []string{c.apiURL, c.issuer} {
		u, err := url.Parse(raw)
		if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return c, errors.New("API and issuer URLs must be absolute")
		}
		if u.Scheme != "https" {
			ip := net.ParseIP(u.Hostname())
			if u.Scheme != "http" || ip == nil || !ip.IsLoopback() ||
				os.Getenv("WAYLORN_ALLOW_HTTP_LOOPBACK") != "true" {
				return c, errors.New("API and issuer URLs require HTTPS outside explicit loopback development")
			}
		}
	}
	api, _ := url.Parse(c.apiURL)
	ip := net.ParseIP(api.Hostname())
	if ip == nil || !ip.IsLoopback() {
		return c, errors.New("raw observations may only be sent to a loopback site-local API")
	}
	return c, nil
}

func newClient() (*http.Client, error) {
	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12}
	certFile, keyFile := os.Getenv("WAYLORN_CLIENT_CERT_FILE"), os.Getenv("WAYLORN_CLIENT_KEY_FILE")
	if (certFile == "") != (keyFile == "") {
		return nil, errors.New("both client certificate and key are required")
	}
	if certFile != "" {
		pair, err := tls.LoadX509KeyPair(certFile, keyFile)
		if err != nil {
			return nil, err
		}
		tlsConfig.Certificates = []tls.Certificate{pair}
	}
	if caFile := os.Getenv("WAYLORN_CA_FILE"); caFile != "" {
		roots, err := x509.SystemCertPool()
		if err != nil {
			return nil, err
		}
		pem, err := os.ReadFile(caFile)
		if err != nil {
			return nil, err
		}
		if !roots.AppendCertsFromPEM(pem) {
			return nil, errors.New("CA file has no trusted certificates")
		}
		tlsConfig.RootCAs = roots
	}
	return &http.Client{Timeout: 15 * time.Second,
		Transport:     &http.Transport{TLSClientConfig: tlsConfig},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, nil
}

// runCycle returns the site budget interval from the heartbeat, or 0 when none was received.
func runCycle(ctx context.Context, c config, client *http.Client, auth *tokenProvider) (int, error) {
	pollErr := pollCycle(ctx, c, client, auth)
	assigned, heartbeatErr := sendHeartbeat(ctx, c, client, auth)
	return assigned, errors.Join(pollErr, heartbeatErr)
}

func pollCycle(ctx context.Context, c config, client *http.Client, auth *tokenProvider) error {
	// Drain old local data first. If the control plane is unavailable, continue one
	// bounded read and retain it on disk; no cloud service is needed for site I/O.
	firstErr := timedDrain(ctx, c, client, auth)
	active, rejected, err := spoolCounts(c.spool)
	if err != nil {
		return err
	}
	if active+rejected >= maxSpoolFiles {
		return errors.New("local observation spool is full; polling stopped")
	}
	result, err := observe(ctx, c)
	if err != nil {
		return err
	}
	if err := enqueue(c.spool, result); err != nil {
		return err
	}
	if firstErr != nil {
		return firstErr
	}
	return timedDrain(ctx, c, client, auth)
}

func timedDrain(ctx context.Context, c config, client *http.Client, auth *tokenProvider) error {
	replayCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return drain(replayCtx, c, client, auth)
}

func sendHeartbeat(ctx context.Context, c config, client *http.Client, auth *tokenProvider) (int, error) {
	active, rejected, err := spoolCounts(c.spool)
	if err != nil {
		return 0, err
	}
	token, err := auth.get(ctx)
	if err != nil {
		return 0, err
	}
	data, err := json.Marshal(map[string]any{
		"schemaVersion": 1, "siteId": c.siteID, "intervalMs": c.intervalMs,
		"requestedIntervalMs": c.requestedMs, "spoolDepth": active + rejected,
	})
	if err != nil {
		return 0, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.apiURL+"/api/v1/site-agents/heartbeat", bytes.NewReader(data))
	if err != nil {
		return 0, err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusAccepted {
		io.Copy(io.Discard, io.LimitReader(response.Body, 256))
		return 0, fmt.Errorf("site heartbeat API returned %d", response.StatusCode)
	}
	var reply struct {
		PollIntervalMs int `json:"pollIntervalMs"`
	}
	// A malformed or absent assignment is not a contact failure; the current pace is kept.
	_ = json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&reply)
	return reply.PollIntervalMs, nil
}

func observe(ctx context.Context, c config) (observation, error) {
	readCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	output, err := exec.CommandContext(readCtx, c.reader, c.endpoint, strconv.Itoa(c.unit), c.kind,
		strconv.Itoa(c.start), strconv.Itoa(c.count)).Output()
	if err != nil {
		return observation{}, fmt.Errorf("read-only OT process failed: %w", err)
	}
	if len(output) > 4096 {
		return observation{}, errors.New("OT result exceeds size limit")
	}
	var result registerResult
	if err := json.Unmarshal(output, &result); err != nil {
		return observation{}, err
	}
	if result.SchemaVersion != 1 || len(result.Values) != c.count {
		return observation{}, errors.New("OT result contract mismatch")
	}
	values := make([]sample, c.count)
	for i, value := range result.Values {
		if value < 0 || value > 65535 {
			return observation{}, errors.New("OT register value out of range")
		}
		values[i] = sample{SignalKey: fmt.Sprintf("modbus.%s.%d", c.kind, c.start+i), Value: value}
	}
	id, err := newUUID()
	if err != nil {
		return observation{}, err
	}
	return observation{SchemaVersion: 1, RequestID: id, SiteID: c.siteID, AssetID: c.assetID,
		Source: "site-agent/modbus-tcp", ObservedUtc: time.Now().UTC(),
		ExpectedIntervalMs: c.intervalMs, Values: values}, nil
}

func newUUID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}

func enqueue(dir string, value observation) error {
	active, rejected, err := spoolCounts(dir)
	if err != nil {
		return err
	}
	if active+rejected >= maxSpoolFiles {
		return errors.New("local observation spool is full; polling stopped")
	}
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, ".pending-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if err := file.Chmod(0600); err != nil {
		file.Close()
		return err
	}
	if _, err := file.Write(data); err != nil {
		file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	name := fmt.Sprintf("%020d-%s.json", time.Now().UnixNano(), value.RequestID)
	return os.Rename(file.Name(), filepath.Join(dir, name))
}

func spoolCounts(dir string) (active, rejected int, err error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, 0, err
	}
	for _, entry := range entries {
		if entry.Type().IsRegular() {
			active++
		}
	}
	rejectedDir := filepath.Join(dir, "rejected")
	info, err := os.Lstat(rejectedDir)
	if errors.Is(err, os.ErrNotExist) {
		return active, 0, nil
	}
	if err != nil {
		return 0, 0, err
	}
	if !info.IsDir() {
		return 0, 0, errors.New("rejected spool path must be a directory")
	}
	entries, err = os.ReadDir(rejectedDir)
	if err != nil {
		return 0, 0, err
	}
	for _, entry := range entries {
		if entry.Type().IsRegular() {
			rejected++
		}
	}
	return active, rejected, nil
}

func drain(ctx context.Context, c config, client *http.Client, auth *tokenProvider) error {
	if time.Now().Before(auth.observationRetryAfter) {
		return nil
	}
	entries, err := os.ReadDir(c.spool)
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.Type().IsRegular() && strings.HasSuffix(entry.Name(), ".json") {
			names = append(names, entry.Name())
		}
	}
	slices.Sort(names)
	for _, name := range names[:min(len(names), maxReplayPerDrain)] {
		path := filepath.Join(c.spool, name)
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if len(data) > 64*1024 {
			return errors.New("spooled observation exceeds size limit")
		}
		token, err := auth.get(ctx)
		if err != nil {
			return err
		}
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiURL+"/api/v1/observations", bytes.NewReader(data))
		if err != nil {
			return err
		}
		request.Header.Set("Authorization", "Bearer "+token)
		request.Header.Set("Content-Type", "application/json")
		response, err := client.Do(request)
		if err != nil {
			return err
		}
		body, _ := io.ReadAll(io.LimitReader(response.Body, 256))
		response.Body.Close()
		if response.StatusCode == http.StatusTooManyRequests {
			seconds, err := strconv.Atoi(response.Header.Get("Retry-After"))
			if err != nil || seconds < 1 {
				seconds = 1
			}
			auth.observationRetryAfter = time.Now().Add(time.Duration(min(seconds, 60)) * time.Second)
			return errors.New("observation API rate limited replay")
		}
		if slices.Contains([]int{http.StatusBadRequest, http.StatusNotFound, http.StatusConflict,
			http.StatusRequestEntityTooLarge, http.StatusUnprocessableEntity}, response.StatusCode) {
			rejectedDir := filepath.Join(c.spool, "rejected")
			if err := os.Mkdir(rejectedDir, 0700); err != nil && !errors.Is(err, os.ErrExist) {
				return err
			}
			info, err := os.Lstat(rejectedDir)
			if err != nil || !info.IsDir() {
				return errors.New("rejected spool path must be a directory")
			}
			if err := os.Rename(path, filepath.Join(rejectedDir, name)); err != nil {
				return err
			}
			return fmt.Errorf("observation API permanently rejected %s with %d; file retained in rejected spool", name, response.StatusCode)
		}
		if response.StatusCode != http.StatusAccepted && response.StatusCode != http.StatusOK {
			return fmt.Errorf("observation API returned %d: %s", response.StatusCode, body)
		}
		if err := os.Remove(path); err != nil {
			return err
		}
	}
	return nil
}

type tokenProvider struct {
	client                *http.Client
	cfg                   config
	token                 string
	expires               time.Time
	observationRetryAfter time.Time
}

func (p *tokenProvider) get(ctx context.Context) (string, error) {
	if p.token != "" && time.Until(p.expires) > 30*time.Second {
		return p.token, nil
	}
	form := url.Values{"grant_type": {"client_credentials"}, "client_id": {p.cfg.clientID}, "client_secret": {p.cfg.secret}}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost,
		p.cfg.issuer+"/protocol/openid-connect/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := p.client.Do(request)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("workload token endpoint returned %d", response.StatusCode)
	}
	var token struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 16*1024)).Decode(&token); err != nil {
		return "", err
	}
	if token.AccessToken == "" || token.ExpiresIn < 1 {
		return "", errors.New("workload token response is invalid")
	}
	p.token, p.expires = token.AccessToken, time.Now().Add(time.Duration(token.ExpiresIn)*time.Second)
	return p.token, nil
}
