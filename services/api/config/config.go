package config

import (
	"os"
	"strconv"
)

// Config holds all API service configuration.
type Config struct {
	Port        string
	DatabaseURL string
	LogLevel    string
	Version     string
}

// Load reads configuration from environment.
func Load() *Config {
	return &Config{
		Port:        env("PORT", "8000"),
		DatabaseURL: env("DATABASE_URL", "postgresql://aperture:aperture@db:5432/aperture"),
		LogLevel:    env("LOG_LEVEL", "info"),
		Version:     readVersion(),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func intEnv(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		i, _ := strconv.Atoi(v)
		return i
	}
	return fallback
}

func readVersion() string {
	b, err := os.ReadFile("VERSION")
	if err != nil {
		return "dev"
	}
	return string(b)
}
