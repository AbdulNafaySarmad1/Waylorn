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
