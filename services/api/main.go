package main

import (
	"log"

	"aperture/api/config"
	"aperture/api/db"
	"aperture/api/handlers"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func main() {
	cfg := config.Load()

	if err := db.Init(); err != nil {
		log.Fatalf("database init failed: %v", err)
	}
	defer db.Close()

	app := fiber.New()
	app.Use(cors.New(cors.Config{
		AllowOrigins: "http://localhost:3000",
		AllowHeaders: "Origin, Content-Type, Accept",
	}))

	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "version": cfg.Version})
	})

	// Experiments
	app.Get("/experiments", handlers.ListExperiments)
	app.Post("/experiments", handlers.CreateExperiment)
	app.Get("/experiments/:key/variants", handlers.GetVariants)
	app.Get("/experiments/:key/config", handlers.GetExperimentConfig)
	app.Get("/experiments/:key/assign", handlers.GetAssignUser)
	app.Post("/experiments/:key/assign", handlers.AssignUser)
	app.Post("/experiments/:key/expose", handlers.ExposeUser)
	app.Post("/experiments/:key/start", handlers.StartExperiment)
	app.Post("/experiments/:key/pause", handlers.PauseExperiment)
	app.Post("/experiments/:key/rollout", handlers.RolloutExperiment)

	// Metrics
	app.Get("/metrics", handlers.ListMetrics)
	app.Post("/metrics", handlers.CreateMetric)
	app.Post("/experiments/:key/metrics", handlers.LinkMetric)

	// Events
	app.Post("/events/track", handlers.TrackEvent)
	app.Post("/events/batch", handlers.TrackEventsBatch)

	// Results
	app.Get("/results/:key", handlers.GetResults)

	log.Printf("Aperture API v%s listening on :%s", cfg.Version, cfg.Port)
	log.Fatal(app.Listen(":" + cfg.Port))
}
