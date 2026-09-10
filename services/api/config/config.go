package config

import (
	"os"
	"strconv"
	"strings"
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
	paths := []string{"VERSION", "../../VERSION", "../../../VERSION"}
	for _, p := range paths {
		b, err := os.ReadFile(p)
		if err == nil {
			return strings.TrimSpace(string(b))
		}
	}
	return "dev"
}
