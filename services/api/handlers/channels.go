package handlers

import (
	"aperture/api/allocation"
	"aperture/api/auth"
	"aperture/api/db"
	"math"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

func CreateChannel(c *fiber.Ctx) error {
	var body struct {
		Key            string   `json:"key"`
		Name           string   `json:"name"`
		AllocationKind string   `json:"allocation_kind"`
		FillPercentage float64  `json:"fill_percentage"`
		AllocationIDs  []string `json:"allocation_ids"`
	}
	if c.BodyParser(&body) != nil {
		return fiber.NewError(400, "Invalid channel")
	}
	body.Key, body.Name = strings.TrimSpace(body.Key), strings.TrimSpace(body.Name)
	if !keyPattern.MatchString(body.Key) || body.Name == "" || len(body.Name) > 160 || !allocationKinds[body.AllocationKind] || body.FillPercentage < 0 || body.FillPercentage > 100 || len(body.AllocationIDs) > 500 {
		return fiber.NewError(400, "Provide a valid channel key, name, allocation kind, fill percentage, and at most 500 allocation IDs")
	}
	salt, err := randomHex()
	if err != nil {
		return err
	}
	tx, err := db.Pool.Begin(c.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.Context())
	var id int
	err = tx.QueryRow(c.Context(), `INSERT INTO channels(project_id,key,name,allocation_kind,fill_basis_points,salt,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, auth.ProjectID(c), body.Key, body.Name, body.AllocationKind, int(math.Round(body.FillPercentage*100)), salt, auth.UserID(c)).Scan(&id)
	if err != nil {
		return fiber.NewError(409, "Channel key already exists or could not be saved")
	}
	_, err = tx.Exec(c.Context(), `INSERT INTO channel_config_changes(channel_id,config_version,fill_basis_points,changed_by) VALUES($1,1,$2,$3)`, id, int(math.Round(body.FillPercentage*100)), auth.UserID(c))
	if err != nil {
		return err
	}
	secret, err := projectTelemetrySecret(c.Context(), auth.ProjectID(c))
	if err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, rawID := range body.AllocationIDs {
		allocationID := strings.TrimSpace(rawID)
		if allocationID == "" || len(allocationID) > 256 {
			return fiber.NewError(400, "Allocation IDs must contain 1 to 256 bytes")
		}
		hash := allocation.IdentityHash(secret, body.AllocationKind, allocationID)
		if seen[hash] {
			continue
		}
		seen[hash] = true
		_, err = tx.Exec(c.Context(), `INSERT INTO channel_members(channel_id,allocation_kind,allocation_id_hash,added_by) VALUES($1,$2,$3,$4)`, id, body.AllocationKind, hash, auth.UserID(c))
		if err != nil {
			return err
		}
		_, err = tx.Exec(c.Context(), `INSERT INTO channel_member_changes(channel_id,allocation_kind,allocation_id_hash,action,changed_by) VALUES($1,$2,$3,'add',$4)`, id, body.AllocationKind, hash, auth.UserID(c))
		if err != nil {
			return err
		}
	}
	if err = tx.Commit(c.Context()); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"key": body.Key, "config_version": 1, "members": len(seen)})
}

func ListChannels(c *fiber.Ctx) error {
	rows, err := db.Pool.Query(c.Context(), `SELECT c.key,c.name,c.allocation_kind,c.fill_basis_points,c.config_version,c.created_at,c.updated_at,(SELECT count(*) FROM channel_members m WHERE m.channel_id=c.id) members FROM channels c WHERE c.project_id=$1 ORDER BY c.name`, auth.ProjectID(c))
	if err != nil {
		return err
	}
	defer rows.Close()
	items, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		return err
	}
	if items == nil {
		items = []map[string]any{}
	}
	return c.JSON(items)
}

func UpdateChannelFill(c *fiber.Ctx) error {
	var body struct {
		FillPercentage  float64 `json:"fill_percentage"`
		ExpectedVersion int     `json:"expected_version"`
	}
	if c.BodyParser(&body) != nil || body.FillPercentage < 0 || body.FillPercentage > 100 || body.ExpectedVersion < 1 {
		return fiber.NewError(400, "Invalid channel update")
	}
	tx, err := db.Pool.Begin(c.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.Context())
	var id, version int
	err = tx.QueryRow(c.Context(), `SELECT id,config_version FROM channels WHERE project_id=$1 AND key=$2 FOR UPDATE`, auth.ProjectID(c), c.Params("key")).Scan(&id, &version)
	if err == pgx.ErrNoRows {
		return fiber.NewError(404, "Channel not found")
	}
	if err != nil {
		return err
	}
	if version != body.ExpectedVersion {
		return fiber.NewError(409, "Channel changed in another session; refresh before trying again")
	}
	newVersion, basisPoints := version+1, int(math.Round(body.FillPercentage*100))
	if _, err = tx.Exec(c.Context(), `UPDATE channels SET fill_basis_points=$2,config_version=$3,updated_at=NOW() WHERE id=$1`, id, basisPoints, newVersion); err != nil {
		return err
	}
	if _, err = tx.Exec(c.Context(), `INSERT INTO channel_config_changes(channel_id,config_version,fill_basis_points,changed_by) VALUES($1,$2,$3,$4)`, id, newVersion, basisPoints, auth.UserID(c)); err != nil {
		return err
	}
	if err = bumpChannelGates(c, tx, id); err != nil {
		return err
	}
	if err = tx.Commit(c.Context()); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"config_version": newVersion, "fill_percentage": float64(basisPoints) / 100})
}

func ReplaceChannelMembers(c *fiber.Ctx) error {
	var body struct {
		AllocationIDs   []string `json:"allocation_ids"`
		ExpectedVersion int      `json:"expected_version"`
	}
	if c.BodyParser(&body) != nil || len(body.AllocationIDs) > 500 || body.ExpectedVersion < 1 {
		return fiber.NewError(400, "Provide a valid member list and expected channel version")
	}
	tx, err := db.Pool.Begin(c.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.Context())
	var id, version int
	var kind string
	err = tx.QueryRow(c.Context(), `SELECT id,config_version,allocation_kind FROM channels WHERE project_id=$1 AND key=$2 FOR UPDATE`, auth.ProjectID(c), c.Params("key")).Scan(&id, &version, &kind)
	if err == pgx.ErrNoRows {
		return fiber.NewError(404, "Channel not found")
	}
	if err != nil {
		return err
	}
	if version != body.ExpectedVersion {
		return fiber.NewError(409, "Channel changed in another session; refresh before trying again")
	}
	secret, err := projectTelemetrySecret(c.Context(), auth.ProjectID(c))
	if err != nil {
		return err
	}
	wanted := map[string]bool{}
	for _, rawID := range body.AllocationIDs {
		allocationID := strings.TrimSpace(rawID)
		if allocationID == "" || len(allocationID) > 256 {
			return fiber.NewError(400, "Allocation IDs must contain 1 to 256 bytes")
		}
		wanted[allocation.IdentityHash(secret, kind, allocationID)] = true
	}
	rows, err := tx.Query(c.Context(), `SELECT allocation_id_hash FROM channel_members WHERE channel_id=$1 AND allocation_kind=$2`, id, kind)
	if err != nil {
		return err
	}
	currentRows, err := pgx.CollectRows(rows, pgx.RowToStructByPos[[1]string])
	rows.Close()
	if err != nil {
		return err
	}
	current := map[string]bool{}
	for _, row := range currentRows {
		current[row[0]] = true
	}
	for hash := range current {
		if !wanted[hash] {
			if _, err = tx.Exec(c.Context(), `DELETE FROM channel_members WHERE channel_id=$1 AND allocation_kind=$2 AND allocation_id_hash=$3`, id, kind, hash); err != nil {
				return err
			}
			if _, err = tx.Exec(c.Context(), `INSERT INTO channel_member_changes(channel_id,allocation_kind,allocation_id_hash,action,changed_by) VALUES($1,$2,$3,'remove',$4)`, id, kind, hash, auth.UserID(c)); err != nil {
				return err
			}
		}
	}
	for hash := range wanted {
		if !current[hash] {
			if _, err = tx.Exec(c.Context(), `INSERT INTO channel_members(channel_id,allocation_kind,allocation_id_hash,added_by) VALUES($1,$2,$3,$4)`, id, kind, hash, auth.UserID(c)); err != nil {
				return err
			}
			if _, err = tx.Exec(c.Context(), `INSERT INTO channel_member_changes(channel_id,allocation_kind,allocation_id_hash,action,changed_by) VALUES($1,$2,$3,'add',$4)`, id, kind, hash, auth.UserID(c)); err != nil {
				return err
			}
		}
	}
	newVersion := version + 1
	if _, err = tx.Exec(c.Context(), `UPDATE channels SET config_version=$2,updated_at=NOW() WHERE id=$1`, id, newVersion); err != nil {
		return err
	}
	if err = bumpChannelGates(c, tx, id); err != nil {
		return err
	}
	if err = tx.Commit(c.Context()); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"config_version": newVersion, "members": len(wanted)})
}

func bumpChannelGates(c *fiber.Ctx, tx pgx.Tx, channelID int) error {
	rows, err := tx.Query(c.Context(), `UPDATE gates SET config_version=config_version+1,updated_at=NOW() WHERE channel_id=$1 RETURNING id,config_version,status,rollout_basis_points`, channelID)
	if err != nil {
		return err
	}
	type change struct {
		ID      int
		Version int
		Status  string
		Basis   int
	}
	changed, err := pgx.CollectRows(rows, pgx.RowToStructByPos[change])
	rows.Close()
	if err != nil {
		return err
	}
	for _, gate := range changed {
		if _, err := tx.Exec(c.Context(), `INSERT INTO gate_changes(gate_id,config_version,status,rollout_basis_points,changed_by) VALUES($1,$2,$3,$4,$5)`, gate.ID, gate.Version, gate.Status, gate.Basis, auth.UserID(c)); err != nil {
			return err
		}
	}
	return nil
}
