package assignment

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"fmt"

	"aperture/api/db"
	"aperture/api/models"

	"github.com/jackc/pgx/v5"
)

func Hash(userID, experimentKey string) int {
	h := sha256.Sum256([]byte(fmt.Sprintf("%s:%s", userID, experimentKey)))
	return int(binary.BigEndian.Uint64(h[:8]) % 1000000)
}

// GetVariant resolves a user's variant assignment with override and immutability.
func GetVariant(ctx context.Context, experimentID int, experimentKey string, userID string) (*models.Variant, error) {
	// 1. Override check
	var override models.Override
	err := db.Pool.QueryRow(ctx, `
		SELECT id, experiment_id, user_id, variant_id, excluded
		FROM overrides
		WHERE experiment_id = $1 AND user_id = $2
	`, experimentID, userID).Scan(&override.ID, &override.ExperimentID, &override.UserID, &override.VariantID, &override.Excluded)
	if err == nil {
		if override.Excluded {
			return nil, nil
		}
		if override.VariantID != nil {
			var v models.Variant
			err := db.Pool.QueryRow(ctx,
				`SELECT id, experiment_id, key, name, allocation, is_control FROM variants WHERE id = $1`,
				*override.VariantID,
			).Scan(&v.ID, &v.ExperimentID, &v.Key, &v.Name, &v.Allocation, &v.IsControl)
			if err == nil {
				return &v, nil
			}
		}
	}

	// 2. Existing assignment
	var existing models.Assignment
	err = db.Pool.QueryRow(ctx, `
		SELECT id, experiment_id, user_id, variant_id, assigned_at
		FROM assignments
		WHERE experiment_id = $1 AND user_id = $2
	`, experimentID, userID).Scan(&existing.ID, &existing.ExperimentID, &existing.UserID, &existing.VariantID, &existing.AssignedAt)
	if err == nil {
		var v models.Variant
		err := db.Pool.QueryRow(ctx,
			`SELECT id, experiment_id, key, name, allocation, is_control FROM variants WHERE id = $1`,
			existing.VariantID,
		).Scan(&v.ID, &v.ExperimentID, &v.Key, &v.Name, &v.Allocation, &v.IsControl)
		if err == nil {
			return &v, nil
		}
	}

	// 3. Hash-based assignment
	var status string
	var allocatedPercentage int
	err = db.Pool.QueryRow(ctx,
		`SELECT status, allocated_percentage FROM experiments WHERE id = $1`,
		experimentID,
	).Scan(&status, &allocatedPercentage)
	if err != nil {
		return nil, err
	}
	if status != "running" {
		return nil, nil
	}

	rows, err := db.Pool.Query(ctx,
		`SELECT id, experiment_id, key, name, allocation, is_control FROM variants WHERE experiment_id = $1 ORDER BY id`,
		experimentID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var variants []models.Variant
	for rows.Next() {
		var v models.Variant
		rows.Scan(&v.ID, &v.ExperimentID, &v.Key, &v.Name, &v.Allocation, &v.IsControl)
		variants = append(variants, v)
	}
	if len(variants) == 0 {
		return nil, nil
	}

	hashVal := float64(Hash(userID, experimentKey))
	bucket := hashVal / 10000.0 // 0.0 to 100.0

	if bucket >= float64(allocatedPercentage) {
		return nil, nil
	}

	normalized := (bucket / float64(allocatedPercentage)) * 100.0
	cumulative := 0.0
	for _, v := range variants {
		cumulative += float64(v.Allocation)
		if normalized < cumulative {
			// Persist assignment
			_, err := db.Pool.Exec(ctx, `
				INSERT INTO assignments (experiment_id, user_id, variant_id) VALUES ($1, $2, $3)
			`, experimentID, userID, v.ID)
			if err != nil {
				// Race: fetch existing
				var existingVariantID int
				err2 := db.Pool.QueryRow(ctx,
					`SELECT variant_id FROM assignments WHERE experiment_id = $1 AND user_id = $2`,
					experimentID, userID,
				).Scan(&existingVariantID)
				if err2 == nil {
					for _, vv := range variants {
						if vv.ID == existingVariantID {
							return &vv, nil
						}
					}
				}
			}
			return &v, nil
		}
	}

	// Fallback
	v := variants[len(variants)-1]
	db.Pool.Exec(ctx,
		`INSERT INTO assignments (experiment_id, user_id, variant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
		experimentID, userID, v.ID,
	)
	return &v, nil
}

// GetDefaultProject returns the first project (MVP: single project).
func GetDefaultProject(ctx context.Context) (*int, error) {
	var id int
	err := db.Pool.QueryRow(ctx, `SELECT id FROM projects LIMIT 1`).Scan(&id)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("no project found")
	}
	if err != nil {
		return nil, err
	}
	return &id, nil
}
