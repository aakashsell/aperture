package main

import (
	"aperture/api/auth"
	"aperture/api/config"
	"aperture/api/db"
	"aperture/api/handlers"
	"errors"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"log"
	"os"
	"strings"
	"time"
)

func main() {
	cfg := config.Load()
	auth.Init(cfg)
	if err := db.Init(); err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	app := fiber.New(fiber.Config{BodyLimit: 1024 * 1024, ReadTimeout: 10 * time.Second, WriteTimeout: 30 * time.Second, ErrorHandler: func(c *fiber.Ctx, err error) error {
		code, message := 500, "An internal error occurred"
		var e *fiber.Error
		if errors.As(err, &e) {
			code, message = e.Code, e.Message
		} else {
			log.Printf("request failed: %v", err)
		}
		return c.Status(code).JSON(fiber.Map{"error": message})
	}})
	app.Use(recover.New())
	app.Use(func(c *fiber.Ctx) error {
		if c.Method() == "POST" && !strings.HasPrefix(c.Get("Content-Type"), "application/json") {
			return fiber.NewError(415, "Use application/json")
		}
		return c.Next()
	})
	// Publishable SDK keys carry no management permissions; cross-origin ingestion is supported.
	app.Use(cors.New(cors.Config{AllowOrigins: "*", AllowHeaders: "Origin, Content-Type, Accept, X-API-Key, Authorization, X-Aperture-Project"}))
	app.Get("/health", func(c *fiber.Ctx) error {
		if err := db.Health(c.Context()); err != nil {
			return fiber.NewError(503, "Database unavailable")
		}
		return c.JSON(fiber.Map{"status": "ok", "version": cfg.Version})
	})
	authLimiter := limiter.New(limiter.Config{Max: 20, Expiration: time.Minute})
	app.Post("/auth/register", authLimiter, handlers.Register)
	app.Post("/auth/login", authLimiter, handlers.Login)
	app.Post("/auth/logout", handlers.Logout)
	app.Use(auth.Middleware())
	app.Get("/experiments/:key/assign", handlers.GetAssignUser)
	app.Post("/experiments/:key/assign", handlers.AssignUser)
	app.Post("/experiments/:key/expose", handlers.ExposeUser)
	app.Post("/events/track", handlers.TrackEvent)
	app.Post("/events/batch", handlers.TrackEventsBatch)
	app.Post("/gates/:key/evaluate", handlers.EvaluateGate)
	app.Post("/gates/:key/expose", handlers.ExposeGate)
	app.Post("/gates/:key/health", handlers.ReportGateHealth)
	app.Post("/crashes/ingest", handlers.ReportCrash)
	app.Use(auth.Dashboard)
	app.Get("/auth/session", handlers.Session)
	app.Get("/auth/workspaces", handlers.Workspaces)
	app.Post("/auth/workspaces", handlers.CreateWorkspace)
	app.Get("/gates", handlers.ListGates)
	app.Get("/channels", handlers.ListChannels)
	app.Post("/channels", handlers.CreateChannel)
	app.Post("/channels/:key/fill", handlers.UpdateChannelFill)
	app.Post("/channels/:key/members", handlers.ReplaceChannelMembers)
	app.Post("/gates", handlers.CreateGate)
	app.Get("/gates/:key", handlers.GateDetail)
	app.Post("/debug/allocation/evaluate", handlers.ExplainAllocation)
	app.Post("/gates/:key/overrides/inspect", handlers.InspectGateOverride)
	app.Post("/gates/:key/overrides", handlers.SetGateOverride)
	app.Post("/gates/:key/overrides/remove", handlers.RemoveGateOverride)
	app.Post("/crashes/query", handlers.ListCrashes)
	app.Post("/gates/:key/rollout", handlers.UpdateGateRollout)
	app.Post("/gates/:key/disable", handlers.DisableGate)
	app.Post("/gates/:key/archive", handlers.ArchiveGate)
	app.Delete("/gates/:key", handlers.DeleteGate)
	app.Get("/experiments", handlers.ListExperiments)
	app.Post("/experiments", handlers.CreateExperiment)
	app.Get("/experiments/:key/variants", handlers.GetVariants)
	app.Post("/experiments/:key/start", handlers.StartExperiment)
	app.Post("/experiments/:key/pause", handlers.PauseExperiment)
	app.Post("/experiments/:key/rollout", handlers.RolloutExperiment)
	app.Post("/experiments/:key/archive", handlers.ArchiveExperiment)
	app.Delete("/experiments/:key", handlers.DeleteExperiment)
	app.Get("/metrics", handlers.ListMetrics)
	app.Post("/metrics", handlers.CreateMetric)
	app.Post("/experiments/:key/metrics", handlers.LinkMetric)
	app.Get("/results/:key", handlers.GetResults)
	app.Get("/diagnostics", handlers.Diagnostics)
	log.Printf("Aperture %s listening on %s (environment: %s)", cfg.Version, cfg.Port, os.Getenv("APP_ENV"))
	log.Fatal(app.Listen(":" + cfg.Port))
}
