package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/oceanplexian/lwts/server/internal/auth"
	boardhandler "github.com/oceanplexian/lwts/server/internal/board"
	cardhandler "github.com/oceanplexian/lwts/server/internal/card"
	commenthandler "github.com/oceanplexian/lwts/server/internal/comment"
	"github.com/oceanplexian/lwts/server/internal/config"
	"github.com/oceanplexian/lwts/server/internal/db"
	discordnotifier "github.com/oceanplexian/lwts/server/internal/discord"
	"github.com/oceanplexian/lwts/server/internal/embed"
	"github.com/oceanplexian/lwts/server/internal/middleware"
	"github.com/oceanplexian/lwts/server/internal/repo"
	settingshandler "github.com/oceanplexian/lwts/server/internal/settings"
	"github.com/oceanplexian/lwts/server/internal/spa"
	"github.com/oceanplexian/lwts/server/internal/sse"
	webhookhandler "github.com/oceanplexian/lwts/server/internal/webhook"
	workspacehandler "github.com/oceanplexian/lwts/server/internal/workspace"
	"github.com/oceanplexian/lwts/server/migrations"
)

var version = "dev"
var commit = "unknown"
var buildDate = "unknown"

func main() {
	if len(os.Args) > 1 {
		if handled, err := runCLI(os.Args[1]); handled {
			if err != nil {
				fmt.Fprintf(os.Stderr, "%v\n", err)
				os.Exit(1)
			}
			return
		}
	}

	if err := runServer(); err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
}

// runCLI dispatches a CLI subcommand. handled is false for unknown commands so
// main falls through to the server.
func runCLI(name string) (handled bool, err error) {
	switch name {
	case "migrate":
		return true, runMigrate()
	case "seed":
		return true, runSeed()
	case "reset-password":
		return true, runResetPassword()
	case "users":
		return true, runUsers()
	case "user-create":
		return true, runUserCreate()
	case "user-delete":
		return true, runUserDelete()
	case "boards":
		return true, runBoards()
	case "board-create":
		return true, runBoardCreate()
	case "board-delete":
		return true, runBoardDelete()
	case "cards":
		return true, runCards()
	case "card-show":
		return true, runCardShow()
	case "card-delete":
		return true, runCardDelete()
	case "reseed":
		return true, runReseed()
	case "seed-test":
		return true, runSeedTest()
	case "stats":
		return true, runStats()
	case "backup":
		return true, runBackup()
	case "restore":
		return true, runRestore()
	case "api-key":
		return true, runAPIKey()
	case "help", "--help", "-h":
		printUsage()
		return true, nil
	}
	return false, nil
}

func runServer() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	// Set up slog
	var handler slog.Handler
	level := parseLogLevel(cfg.LogLevel)
	opts := &slog.HandlerOptions{Level: level}
	if cfg.LogFormat == "json" {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}
	logger := slog.New(handler)
	slog.SetDefault(logger)

	// Create router
	mux := http.NewServeMux()

	// Health endpoints
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":    "ok",
			"version":   version,
			"commit":    commit,
			"buildDate": buildDate,
		})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		// TODO: check DB connectivity once datasource is wired
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})
	// Header plugin manifest — advertised to the frontend so the plugin
	// loader can <script>-load each entry. Public (no auth): the header
	// plugin must render before login. See config.HeaderPlugins.
	mux.HandleFunc("GET /api/v1/plugins", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		plugins := cfg.HeaderPlugins
		if plugins == nil {
			plugins = []string{}
		}
		_ = json.NewEncoder(w).Encode(map[string][]string{"headerPlugins": plugins})
	})

	// Plugin static files served from LWTS_PLUGINS_DIR (same-origin, so
	// plugin scripts/CSS/SVGs avoid CORS). Disabled (404) when unset.
	if cfg.PluginsDir != "" {
		if _, err := os.Stat(cfg.PluginsDir); err == nil {
			pluginsFS := http.StripPrefix("/plugins/", http.FileServer(http.Dir(cfg.PluginsDir)))
			mux.Handle("GET /plugins/", pluginsFS)
		} else {
			logger.Warn("LWTS_PLUGINS_DIR set but not accessible; /plugins/ disabled", "dir", cfg.PluginsDir, "error", err)
		}
	}

	// Database
	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()
	// Auto-setup tables in standard mode.
	if err := db.Migrate(ctx, ds, migrations.FS); err != nil {
		return fmt.Errorf("database setup failed: %w", err)
	}

	// Optional: provision pgvector schema if available. Never fatal — semantic
	// search is opt-in and the app must keep running on SQLite or on Postgres
	// without the extension.
	pgvectorReady := false
	ready, err := embed.EnsureSchema(ctx, ds, cfg.EmbeddingDim)
	switch {
	case err != nil:
		logger.Warn("pgvector schema setup failed; semantic search will be unavailable", "error", err)
	case ready:
		logger.Info("pgvector detected; semantic search schema ready", "dim", cfg.EmbeddingDim)
		pgvectorReady = true
	case ds.DBType() == "postgres":
		logger.Info("pgvector extension not installed; semantic search will be unavailable until enabled")
	}

	embedClient := embed.NewClient(cfg.EmbeddingAPIURL, cfg.EmbeddingAPIKey, cfg.EmbeddingModel)
	embedSvc := embed.NewService(ds, embedClient, logger)
	if embedSvc != nil {
		logger.Info("embedding endpoint configured", "url", cfg.EmbeddingAPIURL, "model", embedSvc.Model())
	}

	// SSE hub + event store (persisted log for Last-Event-ID replay).
	sseHub := sse.NewHub()
	eventStore := sse.NewDBEventStore(ds)
	sseHub.SetStore(eventStore)
	go sseHub.Run()

	// Retention sweep for the persisted event log. Skip when retention is 0.
	if cfg.BoardEventsRetention > 0 {
		go runBoardEventsRetention(ctx, eventStore, cfg.BoardEventsRetention, logger)
	}

	// Repositories
	userRepo := repo.NewUserRepository(ds)
	workspaceRepo := repo.NewWorkspaceRepository(ds)
	boardRepo := repo.NewBoardRepository(ds)
	cardRepo := repo.NewCardRepository(ds)
	commentRepo := repo.NewCommentRepository(ds)
	cardImageRepo := repo.NewCardImageRepository(ds)

	// Auth
	userAdapter := auth.NewUserRepoAdapter(userRepo)
	tokenStore := auth.NewDBTokenStore(ds)
	authHandler := auth.NewHandler(userAdapter, tokenStore, cfg.JWTSecret, logger)
	authHandler.SetDatasource(ds)
	authHandler.RegisterRoutes(mux)

	// Auth middleware (JWT for browser, lwts_sk_ for API keys)
	authMW := auth.RequireAuth(cfg.JWTSecret, userAdapter, ds)
	memberMW := func(next http.Handler) http.Handler {
		return authMW(auth.RequireRole("member")(next))
	}

	discordN := discordnotifier.NewNotifier(ds, userRepo, logger)
	go discordN.Run()

	// Board routes
	bh := boardhandler.NewHandler(boardRepo, cardRepo, commentRepo, sseHub)
	bh.RegisterRoutes(mux, authMW)

	// Workspace-scoped routes (workspace -> board -> card).
	wsHandler := workspacehandler.NewHandler(workspaceRepo, boardRepo, cardRepo)
	wsHandler.RegisterRoutes(mux, authMW)

	// Card routes
	ch := cardhandler.NewHandler(cardRepo, boardRepo, commentRepo, sseHub)
	ch.SetDiscord(discordN)
	ch.SetImages(cardImageRepo)
	if embedSvc != nil {
		ch.SetEmbed(embedSvc)
	}
	ch.RegisterRoutes(mux, authMW, memberMW)

	// Comment routes
	cmh := commenthandler.NewHandler(commentRepo, cardRepo, sseHub)
	cmh.SetBoards(boardRepo)
	cmh.SetDiscord(discordN)
	cmh.RegisterRoutes(mux, authMW, memberMW)

	// Webhook routes
	whStore := webhookhandler.NewStore(ds)
	whDispatcher := webhookhandler.NewDispatcher(whStore, logger)
	go whDispatcher.Run()
	wh := webhookhandler.NewHandler(whStore, whDispatcher)
	wh.RegisterRoutes(mux)

	// Search
	sh := boardhandler.NewSearchHandler(ds)
	sh.SetEmbed(embedSvc, pgvectorReady)
	sh.RegisterRoutes(mux, authMW)

	// Users list
	mux.Handle("GET /api/v1/users", authMW(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		users, err := userRepo.List(r.Context())
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "internal server error"})
			return
		}
		if users == nil {
			users = []repo.User{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(users)
	})))

	// Seed function — creates demo board+cards for a user
	seedFunc := func(ctx context.Context, ownerID string) error {
		return repo.SeedDemo(ctx, ds, ownerID)
	}

	// Settings routes
	stg := settingshandler.NewHandler(ds, userRepo, boardRepo, cardRepo, commentRepo)
	stg.SetSeedFunc(settingshandler.SeedFunc(seedFunc))
	adminMW := func(next http.Handler) http.Handler {
		return authMW(auth.RequireRole("admin")(next))
	}
	stg.SetSemanticAvailability(settingshandler.SemanticSearchAvailability{
		Configured:    embedSvc.Configured(),
		PgvectorReady: pgvectorReady,
	})
	stg.RegisterRoutes(mux, authMW, adminMW)
	stg.RegisterDiscordRoutes(mux, adminMW)
	stg.SyncSessionLength(ctx)

	// Embedding status + backfill endpoints. Always registered; behavior
	// depends on what was wired above.
	embedHandler := embed.NewHandler(embedSvc, pgvectorReady, cfg.EmbeddingDim)
	embedHandler.RegisterRoutes(mux, authMW, adminMW)
	authHandler.SetRegistrationChecker(stg)
	authHandler.SetSeedFunc(auth.SeedFunc(seedFunc))

	// SSE / WebSocket routes.
	//   /stream    legacy SSE for the web UI (JWT-only, no replay). Untouched.
	//   /events    new SSE that accepts JWT or lwts_sk_ API key + Last-Event-ID replay.
	//   /ws        WebSocket variant of /events (same auth + replay, JSON envelope).
	//   /presence  list of connected users on a board.
	mux.HandleFunc("GET /api/v1/boards/{id}/stream", sse.StreamHandler(sseHub, cfg.JWTSecret))
	mux.HandleFunc("GET /api/v1/boards/{id}/events", sse.EventsHandler(sseHub, eventStore, cfg.JWTSecret, ds, userAdapter))
	mux.HandleFunc("GET /api/v1/boards/{id}/ws", sse.WebSocketHandler(sseHub, eventStore, cfg.JWTSecret, ds, userAdapter))
	mux.HandleFunc("GET /api/v1/boards/{id}/presence", sse.PresenceHandler(sseHub, cfg.JWTSecret))

	// Static files
	if cfg.DevMode {
		// Dev mode: no-cache headers, serves from web/ then web/public/ (mimics Vite
		// publicDir), and falls back to index.html for SPA routes (docs/ROUTES.md).
		webFS := http.FileServer(http.Dir("web"))
		publicFS := http.FileServer(http.Dir("web/public"))
		mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasSuffix(r.URL.Path, ".html") || strings.HasSuffix(r.URL.Path, ".css") || strings.HasSuffix(r.URL.Path, ".js") || r.URL.Path == "/" {
				w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			}
			if r.URL.Path == "/" {
				webFS.ServeHTTP(w, r)
				return
			}
			if _, err := os.Stat("web" + r.URL.Path); err == nil {
				webFS.ServeHTTP(w, r)
				return
			}
			if _, err := os.Stat("web/public" + r.URL.Path); err == nil {
				publicFS.ServeHTTP(w, r)
				return
			}
			if spa.ShouldServeIndex(r.Method, r.URL.Path) {
				w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
				http.ServeFile(w, r, "web/index.html")
				return
			}
			http.NotFound(w, r)
		}))
	} else {
		// Production: serve Vite build output from STATIC_DIR, SPA fallback to index.html.
		// index.html is pre-rendered once with the header-plugin <script defer> tags +
		// a FOUC guard injected into <head> (see renderIndexHTML), so plugins load
		// in parallel with the bundle and the default brand never flashes.
		indexHTML, indexErr := renderIndexHTML(cfg)
		if indexErr != nil {
			logger.Warn("header plugin: could not pre-render index.html; serving raw", "error", indexErr)
		}
		staticFS := http.Dir(cfg.StaticDir)
		fileServer := http.FileServer(staticFS)
		mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Serve the injected index.html for the root, /index.html, and SPA
			// fallback routes (non-file, non-API). Other static assets pass through.
			if r.URL.Path == "/" || r.URL.Path == "/index.html" {
				serveIndex(w, r, indexHTML, cfg.StaticDir)
				return
			}
			if _, err := os.Stat(cfg.StaticDir + r.URL.Path); os.IsNotExist(err) && spa.ShouldServeIndex(r.Method, r.URL.Path) {
				serveIndex(w, r, indexHTML, cfg.StaticDir)
				return
			}
			fileServer.ServeHTTP(w, r)
		}))
	}

	// Apply middleware chain
	var h http.Handler = mux
	if !cfg.DevMode {
		h = middleware.BodyLimit(cfg.MaxUploadSize)(h)
		h = middleware.RateLimit(100, 100)(h)
		h = middleware.CORS(cfg.CORSOrigins)(h)
		h = middleware.SecurityHeaders(h)
	}
	h = middleware.Recovery(logger)(h)
	h = middleware.Logger(logger)(h)
	h = middleware.RequestID(h)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      h,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	if cfg.TLSCert != "" && cfg.TLSKey != "" {
		srv.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}

	// Graceful shutdown
	done := make(chan os.Signal, 1)
	signal.Notify(done, syscall.SIGINT, syscall.SIGTERM)

	serveErr := make(chan error, 1)
	go func() {
		logger.Info("server starting", "port", cfg.Port, "version", version, "dev", cfg.DevMode)
		if srv.TLSConfig != nil {
			serveErr <- srv.ListenAndServeTLS(cfg.TLSCert, cfg.TLSKey)
			return
		}
		serveErr <- srv.ListenAndServe()
	}()

	select {
	case <-done:
	case err := <-serveErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("server failed: %w", err)
		}
	}
	logger.Info("shutting down")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("shutdown error", "error", err)
	}
	sseHub.Stop()
	discordN.Stop()
	logger.Info("server stopped")
	return nil
}

// runBoardEventsRetention deletes board_events older than `retention` on a
// loop. Runs once at startup and then every retention/24 (min 1h, max 24h).
func runBoardEventsRetention(ctx context.Context, store *sse.DBEventStore, retention time.Duration, logger *slog.Logger) {
	interval := retention / 24
	if interval < time.Hour {
		interval = time.Hour
	}
	if interval > 24*time.Hour {
		interval = 24 * time.Hour
	}

	sweep := func() {
		cutoff := time.Now().Add(-retention)
		n, err := store.PurgeOlderThan(ctx, cutoff)
		if err != nil {
			logger.Warn("board_events retention sweep failed", "error", err)
			return
		}
		if n > 0 {
			logger.Info("board_events retention sweep", "deleted", n, "older_than", cutoff)
		}
	}

	sweep()
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			sweep()
		}
	}
}

func openDS(ctx context.Context) (db.Datasource, error) {
	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		dbURL = "postgres://lwts:lwts@localhost:5432/lwts?sslmode=disable"
	}
	ds, err := db.NewDatasource(ctx, dbURL)
	if err != nil {
		return nil, fmt.Errorf("db: %w", err)
	}
	return ds, nil
}

func runMigrate() error {
	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()
	if err := db.Migrate(ctx, ds, migrations.FS); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	fmt.Println("migrations applied")
	return nil
}

func runSeed() error {
	ctx := context.Background()
	ds, err := openDS(ctx)
	if err != nil {
		return err
	}
	defer ds.Close()
	// Run migrations first
	if err := db.Migrate(ctx, ds, migrations.FS); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}

	if err := repo.Seed(ctx, ds); err != nil {
		return fmt.Errorf("seed: %w", err)
	}
	fmt.Println("seed data applied")
	return nil
}

func parseLogLevel(s string) slog.Level {
	switch s {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
