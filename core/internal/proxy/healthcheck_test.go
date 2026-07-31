package proxy

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/alpkeskin/rota/core/internal/database"
	"github.com/alpkeskin/rota/core/internal/models"
	"github.com/alpkeskin/rota/core/internal/repository"
	"github.com/alpkeskin/rota/core/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
)

// newExpiredTLSServer starts an HTTPS server whose certificate has already
// expired — simulating a proxy intercepting TLS with a stale certificate.
// (It is also self-signed, so strict mode rejects it with "unknown authority"
// rather than "expired" — the rejection is what matters.)
func newExpiredTLSServer(t *testing.T) *httptest.Server {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "expired-proxy"},
		NotBefore:    time.Now().Add(-48 * time.Hour),
		NotAfter:     time.Now().Add(-24 * time.Hour),
		KeyUsage:     x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &priv.PublicKey, priv)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}
	ts := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	ts.TLS = &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: priv}}}
	ts.StartTLS()
	t.Cleanup(ts.Close)
	return ts
}

// newTunnelProxy starts a minimal HTTP CONNECT proxy that tunnels bytes to the
// requested host, so the health check's TLS handshake happens end-to-end
// against the target server.
func newTunnelProxy(t *testing.T) string {
	t.Helper()
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodConnect {
			http.Error(w, "CONNECT only", http.StatusBadRequest)
			return
		}
		target, err := net.Dial("tcp", r.Host)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		hj, ok := w.(http.Hijacker)
		if !ok {
			target.Close()
			http.Error(w, "hijacking unsupported", http.StatusInternalServerError)
			return
		}
		client, _, err := hj.Hijack()
		if err != nil {
			target.Close()
			return
		}
		if _, err := client.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
			target.Close()
			client.Close()
			return
		}
		go func() { io.Copy(target, client); target.Close(); client.Close() }()
		go func() { io.Copy(client, target); target.Close(); client.Close() }()
	}))
	t.Cleanup(proxy.Close)
	return strings.TrimPrefix(proxy.URL, "http://")
}

func TestHealthCheckStrictTLS(t *testing.T) {
	ts := newExpiredTLSServer(t)
	proxyAddr := newTunnelProxy(t)

	// Stats writes go to a pool that can't connect; the check result itself
	// does not depend on them (the writes fail fast and are best-effort).
	pool, err := pgxpool.New(context.Background(), "postgres://dead:dead@127.0.0.1:1/dead")
	if err != nil {
		t.Fatalf("create pool: %v", err)
	}
	defer pool.Close()

	h := &HealthChecker{
		tracker: NewUsageTracker(repository.NewProxyRepository(&database.DB{Pool: pool})),
		logger:  logger.New("error"),
	}

	tests := []struct {
		name    string
		strict  bool
		want    string
		wantErr string
	}{
		{name: "loose accepts expired certificate", strict: false, want: "active"},
		{name: "strict rejects expired certificate", strict: true, want: "failed", wantErr: "TLS/SSL error"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h.setSettings(&models.HealthCheckSettings{
				Timeout:   5,
				Workers:   1,
				URL:       ts.URL,
				Status:    http.StatusOK,
				StrictTLS: tc.strict,
			})

			result, err := h.CheckProxy(context.Background(), &models.Proxy{
				ID:       1,
				Address:  proxyAddr,
				Protocol: "http",
			})
			if err != nil {
				t.Fatalf("CheckProxy: %v", err)
			}
			if result.Status != tc.want {
				t.Fatalf("status = %q, want %q (error: %v)", result.Status, tc.want, result.Error)
			}
			if tc.wantErr != "" {
				if result.Error == nil || !strings.Contains(*result.Error, tc.wantErr) {
					t.Fatalf("error = %q, want it to contain %q", *result.Error, tc.wantErr)
				}
			}
		})
	}
}
