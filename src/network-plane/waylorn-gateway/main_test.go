package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
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
