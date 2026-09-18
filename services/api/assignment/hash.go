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

// GetVariant serializes assignment with lifecycle changes and never rewrites history.
func GetVariant(ctx context.Context, experimentID int, experimentKey string, userID string) (*models.Variant, error) {
	tx, err := db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var status string
	var percentage int
	var winner *int
	err = tx.QueryRow(ctx, `SELECT status,allocated_percentage,winner_variant_id FROM experiments WHERE id=$1 FOR SHARE`, experimentID).Scan(&status, &percentage, &winner)
	if err != nil {
		return nil, err
	}
	if status == "archived" {
		return nil, nil
	}
	rows, err := tx.Query(ctx, `SELECT id,experiment_id,key,name,allocation,is_control FROM variants WHERE experiment_id=$1 ORDER BY id`, experimentID)
	if err != nil {
		return nil, err
	}
	variants := []models.Variant{}
	for rows.Next() {
		var v models.Variant
		if err = rows.Scan(&v.ID, &v.ExperimentID, &v.Key, &v.Name, &v.Allocation, &v.IsControl); err != nil {
			rows.Close()
			return nil, err
		}
		variants = append(variants, v)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return nil, err
	}
	find := func(id int) *models.Variant {
		for _, v := range variants {
			if v.ID == id {
				return &v
			}
		}
		return nil
	}
	// Rollout is a feature decision, independent of historical experiment assignment.
	if status == "completed" {
		if winner != nil {
			return find(*winner), nil
		}
		return nil, nil
	}
	var existing int
	err = tx.QueryRow(ctx, `SELECT variant_id FROM assignments WHERE experiment_id=$1 AND user_id=$2`, experimentID, userID).Scan(&existing)
	if err == nil {
		return find(existing), nil
	}
	if err != pgx.ErrNoRows {
		return nil, err
	}
	if status != "running" {
		return nil, nil
	}
	var forced *int
	var excluded bool
	err = tx.QueryRow(ctx, `SELECT variant_id,excluded FROM overrides WHERE experiment_id=$1 AND user_id=$2`, experimentID, userID).Scan(&forced, &excluded)
	if err != nil && err != pgx.ErrNoRows {
		return nil, err
	}
	if excluded {
		return nil, nil
	}
	var chosen *models.Variant
	if forced != nil {
		chosen = find(*forced)
		if chosen == nil {
			return nil, fmt.Errorf("override belongs to another experiment")
		}
	} else {
		bucket := float64(Hash(userID, experimentKey)) / 10000
		if percentage <= 0 || bucket >= float64(percentage) {
			return nil, nil
		}
		cumulative := 0.0
		for _, v := range variants {
			cumulative += float64(v.Allocation)
			if bucket/float64(percentage)*100 < cumulative {
				chosen = &v
				break
			}
		}
	}
	if chosen == nil {
		return nil, fmt.Errorf("invalid variant allocation")
	}
	err = tx.QueryRow(ctx, `INSERT INTO assignments(experiment_id,user_id,variant_id) VALUES($1,$2,$3) ON CONFLICT(experiment_id,user_id) DO UPDATE SET user_id=EXCLUDED.user_id RETURNING variant_id`, experimentID, userID, chosen.ID).Scan(&existing)
	if err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	return find(existing), nil
}
