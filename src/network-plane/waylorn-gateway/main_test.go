package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestSpoolRetainsOutageAndDrainsAfterAcknowledgement(t *testing.T) {
	dir := t.TempDir()
	item := observation{SchemaVersion: 1, RequestID: "7e1de57c-80e7-4a9f-887c-040b0672a7fb",
		SiteID: "site", AssetID: "asset", Source: "site-agent/modbus-tcp",
		ObservedUtc: time.Now().UTC(), ExpectedIntervalMs: 1000,
		Values: []sample{{SignalKey: "modbus.holding.10", Value: 42}}}
	if err := enqueue(dir, item); err != nil {
		t.Fatal(err)
	}
	accepted := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/protocol/openid-connect/token":
			json.NewEncoder(w).Encode(map[string]any{"access_token": "test-token", "expires_in": 60})
		case "/api/v1/observations":
			if r.Header.Get("Authorization") != "Bearer test-token" {
				t.Error("missing workload token")
			}
			if !accepted {
				w.WriteHeader(http.StatusServiceUnavailable)
				return
			}
			w.WriteHeader(http.StatusAccepted)
		default:
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	cfg := config{spool: dir, apiURL: server.URL, issuer: server.URL, clientID: "agent", secret: "secret"}
	auth := &tokenProvider{client: server.Client(), cfg: cfg}
	if err := drain(context.Background(), cfg, server.Client(), auth); err == nil {
		t.Fatal("outage was treated as an acknowledgement")
	}
	files, err := os.ReadDir(dir)
	if err != nil || len(files) != 1 {
		t.Fatalf("observation not retained: %v, %v", files, err)
	}
	accepted = true
	if err := drain(context.Background(), cfg, server.Client(), auth); err != nil {
		t.Fatal(err)
	}
	files, err = os.ReadDir(dir)
	if err != nil || len(files) != 0 {
		t.Fatalf("acknowledged observation remained: %v, %v", files, err)
	}
}

func TestObservationRateLimitPausesReplayWithoutDroppingBatch(t *testing.T) {
	dir := t.TempDir()
	item := observation{SchemaVersion: 1, RequestID: "7e1de57c-80e7-4a9f-887c-040b0672a7fb",
		SiteID: "site", AssetID: "asset", Source: "site-agent/modbus-tcp",
		ObservedUtc: time.Now().UTC(), ExpectedIntervalMs: 1000,
		Values: []sample{{SignalKey: "modbus.holding.10", Value: 42}}}
	if err := enqueue(dir, item); err != nil {
		t.Fatal(err)
	}
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Retry-After", "2")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()
	cfg := config{spool: dir, apiURL: server.URL}
	auth := &tokenProvider{token: "test-token", expires: time.Now().Add(time.Minute)}
	if err := drain(context.Background(), cfg, server.Client(), auth); err == nil {
		t.Fatal("rate-limited observation appeared acknowledged")
	}
	if err := drain(context.Background(), cfg, server.Client(), auth); err != nil {
		t.Fatal(err)
	}
	if requests != 1 || time.Until(auth.observationRetryAfter) < time.Second {
		t.Fatal("replay did not honor the API backoff")
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("rate-limited observation was lost: %v, %v", entries, err)
	}
}

func TestCancelledCycleRetainsUnacknowledgedObservation(t *testing.T) {
	dir := t.TempDir()
	item := observation{SchemaVersion: 1, RequestID: "7e1de57c-80e7-4a9f-887c-040b0672a7fb",
		SiteID: "site", AssetID: "asset", Source: "site-agent/modbus-tcp",
		ObservedUtc: time.Now().UTC(), ExpectedIntervalMs: 1000,
		Values: []sample{{SignalKey: "modbus.holding.10", Value: 42}}}
	if err := enqueue(dir, item); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("cancelled request reached the API")
	}))
	defer server.Close()
	cfg := config{spool: dir, apiURL: server.URL, reader: "/missing-ot-observe"}
	auth := &tokenProvider{token: "test-token", expires: time.Now().Add(time.Minute)}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := runCycle(ctx, cfg, server.Client(), auth); !errors.Is(err, context.Canceled) {
		t.Fatalf("cycle did not stop on cancellation: %v", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("unacknowledged observation was lost: %v, %v", entries, err)
	}
}

func TestRawObservationsRequireLoopbackApi(t *testing.T) {
	for name, value := range map[string]string{
		"WAYLORN_OT_READER":          t.TempDir() + "/ot-observe",
		"WAYLORN_MODBUS_ADDRESS":     "127.0.0.1:1502",
		"WAYLORN_MODBUS_KIND":        "holding",
		"WAYLORN_SITE_ID":            "site",
		"WAYLORN_ASSET_ID":           "asset",
		"WAYLORN_API_URL":            "https://example.com",
		"WAYLORN_OIDC_ISSUER":        "https://id.example.com",
		"WAYLORN_OIDC_CLIENT_ID":     "agent",
		"WAYLORN_OIDC_CLIENT_SECRET": "test-secret",
		"WAYLORN_SPOOL_DIR":          t.TempDir(),
		"WAYLORN_MODBUS_UNIT":        "1",
		"WAYLORN_MODBUS_START":       "10",
		"WAYLORN_MODBUS_COUNT":       "1",
		"WAYLORN_POLL_INTERVAL_MS":   "1000",
	} {
		t.Setenv(name, value)
	}
	if _, err := loadConfig(); err == nil {
		t.Fatal("remote raw telemetry destination was accepted")
	}
	t.Setenv("WAYLORN_API_URL", "https://127.0.0.1:18081")
	if _, err := loadConfig(); err != nil {
		t.Fatalf("loopback site API was rejected: %v", err)
	}
}

func TestHeartbeatReportsLocalSpoolDepth(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(dir+"/pending.json", []byte(`{}`), 0600); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/site-agents/heartbeat" || r.Header.Get("Authorization") != "Bearer test-token" {
			t.Error("heartbeat route or authorization was wrong")
		}
		var body struct {
			SchemaVersion int    `json:"schemaVersion"`
			SiteID        string `json:"siteId"`
			IntervalMs    int    `json:"intervalMs"`
			Requested     int    `json:"requestedIntervalMs"`
			SpoolDepth    int    `json:"spoolDepth"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body.SchemaVersion != 1 || body.SiteID != "test-site" || body.IntervalMs != 2000 ||
			body.Requested != 1000 || body.SpoolDepth != 1 {
			t.Errorf("unexpected heartbeat: %+v", body)
		}
		w.WriteHeader(http.StatusAccepted)
		w.Write([]byte(`{"pollIntervalMs":3000}`))
	}))
	defer server.Close()
	cfg := config{spool: dir, apiURL: server.URL, siteID: "test-site", intervalMs: 2000, requestedMs: 1000}
	auth := &tokenProvider{token: "test-token", expires: time.Now().Add(time.Minute)}
	assigned, err := sendHeartbeat(context.Background(), cfg, server.Client(), auth)
	if err != nil || assigned != 3000 {
		t.Fatalf("assignment %d, error %v", assigned, err)
	}
}

func TestSiteBudgetCanOnlySlowPolling(t *testing.T) {
	cfg := config{intervalMs: 2000, requestedMs: 1000}
	for assigned, want := range map[int]int{
		0:       2000, // no assignment received: keep the current pace
		500:     2000, // faster than the locally approved interval: refused
		1000:    1000, // budget freed: back to the approved interval
		4000:    4000,
		3600001: 2000, // out of bounds: refused
	} {
		if got := nextInterval(cfg, assigned); got != want {
			t.Errorf("assigned %d: got %d, want %d", assigned, got, want)
		}
	}
}

func TestHeartbeatContinuesWhenDeviceReadFails(t *testing.T) {
	called := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/site-agents/heartbeat" {
			t.Errorf("unexpected route: %s", r.URL.Path)
		}
		called = true
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	cfg := config{spool: t.TempDir(), apiURL: server.URL, siteID: "test-site",
		intervalMs: 1000, reader: "/missing-ot-observe"}
	auth := &tokenProvider{token: "test-token", expires: time.Now().Add(time.Minute)}
	if _, err := runCycle(context.Background(), cfg, server.Client(), auth); err == nil {
		t.Fatal("failed device read was hidden")
	}
	if !called {
		t.Fatal("gateway did not report its own connectivity after a failed device read")
	}
}

func TestReplayIsBoundedAndHeartbeatSentOnce(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fixture uses a POSIX shell script")
	}
	dir := t.TempDir()
	for i := 0; i < maxReplayPerDrain*2+10; i++ {
		if err := os.WriteFile(filepath.Join(dir, fmt.Sprintf("%04d.json", i)), []byte(`{}`), 0600); err != nil {
			t.Fatal(err)
		}
	}
	reader := filepath.Join(t.TempDir(), "reader")
	if err := os.WriteFile(reader, []byte("#!/bin/sh\nprintf '{\"schemaVersion\":1,\"values\":[42]}'\n"), 0700); err != nil {
		t.Fatal(err)
	}
	observations, heartbeats := 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/observations":
			observations++
			w.WriteHeader(http.StatusAccepted)
		case "/api/v1/site-agents/heartbeat":
			heartbeats++
			w.WriteHeader(http.StatusAccepted)
		default:
			t.Errorf("unexpected route: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	cfg := config{spool: dir, apiURL: server.URL, siteID: "site", assetID: "asset",
		reader: reader, endpoint: "127.0.0.1:1502", kind: "holding", count: 1, intervalMs: 1000}
	auth := &tokenProvider{token: "test-token", expires: time.Now().Add(time.Minute)}
	if _, err := runCycle(context.Background(), cfg, server.Client(), auth); err != nil {
		t.Fatal(err)
	}
	if observations != maxReplayPerDrain*2 || heartbeats != 1 {
		t.Fatalf("unbounded replay or duplicate heartbeat: observations=%d heartbeats=%d", observations, heartbeats)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 11 {
		t.Fatalf("queued observations were lost: %d files, %v", len(entries), err)
	}
}

func TestReplaySkipsSymlink(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation may require a Windows privilege")
	}
	dir := t.TempDir()
	outside := filepath.Join(t.TempDir(), "private.json")
	if err := os.WriteFile(outside, []byte(`{"private":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "0001.json")); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("symlinked content was sent")
	}))
	defer server.Close()
	cfg := config{spool: dir, apiURL: server.URL}
	auth := &tokenProvider{token: "test-token", expires: time.Now().Add(time.Minute)}
	if err := drain(context.Background(), cfg, server.Client(), auth); err != nil {
		t.Fatal(err)
	}
}

func TestPermanentRejectionIsRetainedWithoutBlockingLaterReplay(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"0001.json", "0002.json"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(`{}`), 0600); err != nil {
			t.Fatal(err)
		}
	}
	requests, reportedDepth := 0, -1
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/observations":
			requests++
			if requests == 1 {
				w.WriteHeader(http.StatusConflict)
			} else {
				w.WriteHeader(http.StatusAccepted)
			}
		case "/api/v1/site-agents/heartbeat":
			var body struct {
				SpoolDepth int `json:"spoolDepth"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			reportedDepth = body.SpoolDepth
			w.WriteHeader(http.StatusAccepted)
		default:
			t.Errorf("unexpected route: %s", r.URL.Path)
		}
	}))
	defer server.Close()
	cfg := config{spool: dir, apiURL: server.URL}
	auth := &tokenProvider{token: "test-token", expires: time.Now().Add(time.Minute)}
	if err := drain(context.Background(), cfg, server.Client(), auth); err == nil {
		t.Fatal("permanent rejection was not reported")
	}
	if err := drain(context.Background(), cfg, server.Client(), auth); err != nil {
		t.Fatal(err)
	}
	if _, err := sendHeartbeat(context.Background(), cfg, server.Client(), auth); err != nil {
		t.Fatal(err)
	}
	active, rejected, err := spoolCounts(dir)
	if err != nil || active != 0 || rejected != 1 || reportedDepth != 1 || requests != 2 {
		t.Fatalf("unexpected spool state: active=%d rejected=%d depth=%d requests=%d error=%v",
			active, rejected, reportedDepth, requests, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "rejected", "0001.json")); err != nil {
		t.Fatal("rejected evidence was not retained:", err)
	}
}

func TestDeviceIdentityIsReportedAsDiscoveryClaim(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fixture uses a POSIX shell script")
	}
	reader := filepath.Join(t.TempDir(), "reader")
	script := "#!/bin/sh\n[ \"$1 $2 $3\" = 'identify 127.0.0.1:1502 7' ] || exit 3\n" +
		"printf '{\"schemaVersion\":1,\"vendorName\":\"Acme\",\"productCode\":\"PLC-42\",\"revision\":\"1.20\"}'\n"
	if err := os.WriteFile(reader, []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	var claim map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/discovery/claims" || r.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("unexpected claim request: %s", r.URL.Path)
		}
		json.NewDecoder(r.Body).Decode(&claim)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()
	cfg := config{apiURL: server.URL, siteID: "test-site", reader: reader, endpoint: "127.0.0.1:1502", unit: 7}
	auth := &tokenProvider{token: "test-token", expires: time.Now().Add(time.Minute)}
	if err := reportIdentity(context.Background(), cfg, server.Client(), auth); err != nil {
		t.Fatal(err)
	}
	if claim["vendorName"] != "Acme" || claim["productCode"] != "PLC-42" || claim["revision"] != "1.20" ||
		claim["endpoint"] != "127.0.0.1:1502" || claim["unitId"] != float64(7) || claim["siteId"] != "test-site" {
		t.Fatalf("unexpected claim: %v", claim)
	}

	// A reader result that could smuggle quotes or control characters is refused before any request.
	for _, vendor := range []string{`Ac\"me`, `Ac\u0007me`} {
		unsafe := filepath.Join(t.TempDir(), "identity.json")
		body := `{"schemaVersion":1,"vendorName":"` + vendor + `","productCode":"P","revision":"1"}`
		if err := os.WriteFile(unsafe, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(reader, []byte("#!/bin/sh\ncat '"+unsafe+"'\n"), 0700); err != nil {
			t.Fatal(err)
		}
		claim = nil
		if err := reportIdentity(context.Background(), cfg, server.Client(), auth); err == nil || claim != nil ||
			!strings.Contains(err.Error(), "contract mismatch") {
			t.Fatalf("unsafe identity %s: error %v, claim %v", vendor, err, claim)
		}
	}
}
