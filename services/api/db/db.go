package db

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool is the global database connection pool.
var Pool *pgxpool.Pool

// Init establishes the connection pool.
func Init() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL must be set")
	}

	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return fmt.Errorf("parse config: %w", err)
	}

	config.MaxConns = 20
	config.ConnConfig.RuntimeParams["statement_timeout"] = "15000"
	config.MinConns = 2
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute
	config.HealthCheckPeriod = 5 * time.Minute

	Pool, err = pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}

	// Verify connectivity
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := Pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping: %w", err)
	}

	return nil
}

// Acquire gets a connection from the pool. Caller must release.
func Acquire(ctx context.Context) (*pgxpool.Conn, error) {
	return Pool.Acquire(ctx)
}

// Health reports whether the database is reachable.
func Health(ctx context.Context) error {
	_, err := Pool.Exec(ctx, "SELECT 1")
	return err
}

// Close shuts down the pool.
func Close() {
	if Pool != nil {
		Pool.Close()
	}
}
