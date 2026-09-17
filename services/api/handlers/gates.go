package handlers

import (
	"aperture/api/allocation"
	"aperture/api/auth"
	"aperture/api/db"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

var allocationKinds = map[string]bool{
	"anonymous": true, "user": true, "installation": true, "device": true,
	"account": true, "organization": true, "host": true,
}

type gateIdentity struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

type gateDecisionInput struct {
	Allocation gateIdentity `json:"allocation"`
}

type gateSignalInput struct {
	Allocation    gateIdentity    `json:"allocation"`
	Enabled       bool            `json:"enabled"`
	ConfigVersion int             `json:"config_version"`
	EventID       string          `json:"event_id"`
	Name          string          `json:"name"`
	Severity      string          `json:"severity"`
	Properties    map[string]any  `json:"properties"`
	Exception     *crashException `json:"exception"`
	Timestamp     *time.Time      `json:"timestamp"`
}

var crashNamePattern = regexp.MustCompile(`^[a-zA-Z0-9:_-]{1,100}$`)

type gateRecord struct {
	ID                 int
	ProjectID          int
	Key                string
	Name               string
	Description        string
	Status             string
	RolloutBasisPoints int
	AllocationKind     string
	Salt               string
	ConfigVersion      int
}

func randomHex() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func projectTelemetrySecret(ctx context.Context, projectID int) (string, error) {
	var secret *string
	err := db.Pool.QueryRow(ctx, `SELECT telemetry_secret FROM projects WHERE id=$1`, projectID).Scan(&secret)
	if err != nil {
		return "", err
	}
	if secret != nil && *secret != "" {
		return *secret, nil
	}
	generated, err := randomHex()
	if err != nil {
		return "", err
	}
	err = db.Pool.QueryRow(ctx, `UPDATE projects SET telemetry_secret=COALESCE(telemetry_secret,$2) WHERE id=$1 RETURNING telemetry_secret`, projectID, generated).Scan(&generated)
	return generated, err
}

func gateByKey(c *fiber.Ctx, lock bool) (gateRecord, error) {
	query := `SELECT id,project_id,key,name,description,status,rollout_basis_points,allocation_kind,salt,config_version FROM gates WHERE project_id=$1 AND key=$2`
	if lock {
		query += ` FOR UPDATE`
	}
	var g gateRecord
	err := db.Pool.QueryRow(c.Context(), query, auth.ProjectID(c), c.Params("key")).Scan(
		&g.ID, &g.ProjectID, &g.Key, &g.Name, &g.Description, &g.Status,
		&g.RolloutBasisPoints, &g.AllocationKind, &g.Salt, &g.ConfigVersion,
	)
	if err == pgx.ErrNoRows {
		return g, fiber.NewError(404, "Rollout not found")
	}
	return g, err
}

func validateGateIdentity(identity *gateIdentity, requiredKind string) error {
	identity.Kind = strings.TrimSpace(identity.Kind)
	identity.ID = strings.TrimSpace(identity.ID)
	if !allocationKinds[identity.Kind] || identity.Kind != requiredKind {
		return fiber.NewError(400, "Allocation kind must match this rollout")
	}
	if identity.ID == "" || len(identity.ID) > 256 {
		return fiber.NewError(400, "Allocation ID is required (maximum 256 bytes)")
	}
	return nil
}

func ListGates(c *fiber.Ctx) error {
	rows, err := db.Pool.Query(c.Context(), `
		SELECT g.id,g.key,g.name,g.description,g.status,g.rollout_basis_points,g.allocation_kind,g.config_version,g.created_at,g.updated_at,
		(SELECT count(*) FROM gate_decisions d WHERE d.gate_id=g.id AND d.config_version=g.config_version) evaluations,
		(SELECT count(*) FROM gate_exposures x WHERE x.gate_id=g.id AND x.config_version=g.config_version) exposures,
		(SELECT count(DISTINCT h.allocation_id_hash) FROM gate_health_events h WHERE h.gate_id=g.id AND h.timestamp>=NOW()-interval '24 hours' AND h.severity IN ('error','fatal')) errors_24h
		FROM gates g WHERE g.project_id=$1 AND g.status<>'archived' ORDER BY g.updated_at DESC`, auth.ProjectID(c))
	if err != nil {
		return err
	}
	defer rows.Close()
	out, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		return err
	}
	if out == nil {
		out = []map[string]any{}
	}
	return c.JSON(out)
}

func CreateGate(c *fiber.Ctx) error {
	var body struct {
		Key               string  `json:"key"`
		Name              string  `json:"name"`
		Description       string  `json:"description"`
		AllocationKind    string  `json:"allocation_kind"`
		RolloutPercentage float64 `json:"rollout_percentage"`
	}
	if c.BodyParser(&body) != nil {
		return fiber.NewError(400, "Invalid rollout")
	}
	body.Key = strings.TrimSpace(body.Key)
	body.Name = strings.TrimSpace(body.Name)
	if !keyPattern.MatchString(body.Key) || body.Name == "" || len(body.Name) > 160 || len(body.Description) > 2000 {
		return fiber.NewError(400, "A name and valid rollout key are required")
	}
	if !allocationKinds[body.AllocationKind] {
		return fiber.NewError(400, "Choose a supported allocation kind")
	}
	if body.RolloutPercentage < 0 || body.RolloutPercentage > 100 {
		return fiber.NewError(400, "Rollout percentage must be between 0 and 100")
	}
	basisPoints := int(math.Round(body.RolloutPercentage * 100))
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
	err = tx.QueryRow(c.Context(), `INSERT INTO gates(project_id,key,name,description,rollout_basis_points,allocation_kind,salt) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, auth.ProjectID(c), body.Key, body.Name, body.Description, basisPoints, body.AllocationKind, salt).Scan(&id)
	if err != nil {
		return fiber.NewError(409, "Rollout key already exists or could not be saved")
	}
	_, err = tx.Exec(c.Context(), `INSERT INTO gate_changes(gate_id,config_version,status,rollout_basis_points,changed_by) VALUES($1,1,'off',$2,$3)`, id, basisPoints, auth.UserID(c))
	if err != nil {
		return err
	}
	if err = tx.Commit(c.Context()); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"key": body.Key, "status": "off", "config_version": 1})
}

func GateDetail(c *fiber.Ctx) error {
	g, err := gateByKey(c, false)
	if err != nil {
		return err
	}
	rows, err := db.Pool.Query(c.Context(), `SELECT config_version,status,rollout_basis_points,changed_at FROM gate_changes WHERE gate_id=$1 ORDER BY config_version DESC LIMIT 20`, g.ID)
	if err != nil {
		return err
	}
	changes, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		return err
	}
	var evaluations, exposures, enabledExposures, disabledExposures, enabledErrors, disabledErrors int
	err = db.Pool.QueryRow(c.Context(), `
		SELECT
		(SELECT count(*) FROM gate_decisions WHERE gate_id=$1 AND config_version=$2),
		(SELECT count(*) FROM gate_exposures WHERE gate_id=$1 AND config_version=$2),
		(SELECT count(*) FROM gate_exposures WHERE gate_id=$1 AND config_version=$2 AND enabled),
		(SELECT count(*) FROM gate_exposures WHERE gate_id=$1 AND config_version=$2 AND NOT enabled),
		(SELECT count(DISTINCT allocation_id_hash) FROM gate_health_events WHERE gate_id=$1 AND config_version=$2 AND enabled AND severity IN ('error','fatal')),
		(SELECT count(DISTINCT allocation_id_hash) FROM gate_health_events WHERE gate_id=$1 AND config_version=$2 AND NOT enabled AND severity IN ('error','fatal'))`, g.ID, g.ConfigVersion).Scan(&evaluations, &exposures, &enabledExposures, &disabledExposures, &enabledErrors, &disabledErrors)
	if err != nil {
		return err
	}
	healthStatus := "collecting"
	if enabledExposures >= 30 && disabledExposures >= 30 {
		healthStatus = "no_flags"
		enabledRate := float64(enabledErrors) / float64(enabledExposures)
		disabledRate := float64(disabledErrors) / float64(disabledExposures)
		if enabledErrors >= 3 && enabledRate > disabledRate*2+0.01 {
			healthStatus = "needs_review"
		}
	}
	return c.JSON(fiber.Map{
		"key": g.Key, "name": g.Name, "description": g.Description, "status": g.Status,
		"rollout_percentage": float64(g.RolloutBasisPoints) / 100, "allocation_kind": g.AllocationKind,
		"config_version": g.ConfigVersion, "evaluations": evaluations, "exposures": exposures,
		"enabled_exposures": enabledExposures, "disabled_exposures": disabledExposures,
		"enabled_errors": enabledErrors, "disabled_errors": disabledErrors,
		"health_status": healthStatus, "changes": changes,
	})
}

func EvaluateGate(c *fiber.Ctx) error {
	var body gateDecisionInput
	if c.BodyParser(&body) != nil {
		return fiber.NewError(400, "Invalid evaluation")
	}
	g, err := gateByKey(c, false)
	if err != nil {
		return err
	}
	if err = validateGateIdentity(&body.Allocation, g.AllocationKind); err != nil {
		return err
	}
	secret, err := projectTelemetrySecret(c.Context(), g.ProjectID)
	if err != nil {
		return err
	}
	hash := allocation.IdentityHash(secret, body.Allocation.Kind, body.Allocation.ID)
	enabled := g.Status == "running" && allocation.Bucket(g.ProjectID, g.Salt, body.Allocation.Kind, body.Allocation.ID) < g.RolloutBasisPoints*100
	_, err = db.Pool.Exec(c.Context(), `INSERT INTO gate_decisions(gate_id,allocation_kind,allocation_id_hash,enabled,config_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(gate_id,allocation_kind,allocation_id_hash,config_version) DO UPDATE SET enabled=EXCLUDED.enabled,evaluated_at=NOW()`, g.ID, body.Allocation.Kind, hash, enabled, g.ConfigVersion)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"gate_key": g.Key, "enabled": enabled, "config_version": g.ConfigVersion, "allocation_kind": body.Allocation.Kind, "expires_at": time.Now().Add(30 * time.Second)})
}

func ExposeGate(c *fiber.Ctx) error {
	var body gateSignalInput
	if c.BodyParser(&body) != nil {
		return fiber.NewError(400, "Invalid exposure")
	}
	g, err := gateByKey(c, false)
	if err != nil {
		return err
	}
	if err = validateGateIdentity(&body.Allocation, g.AllocationKind); err != nil {
		return err
	}
	secret, err := projectTelemetrySecret(c.Context(), g.ProjectID)
	if err != nil {
		return err
	}
	hash := allocation.IdentityHash(secret, body.Allocation.Kind, body.Allocation.ID)
	var exists bool
	err = db.Pool.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM gate_decisions WHERE gate_id=$1 AND allocation_kind=$2 AND allocation_id_hash=$3 AND config_version=$4 AND enabled=$5)`, g.ID, body.Allocation.Kind, hash, body.ConfigVersion, body.Enabled).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return fiber.NewError(409, "Exposure must match an evaluated gate decision")
	}
	_, err = db.Pool.Exec(c.Context(), `INSERT INTO gate_exposures(gate_id,allocation_kind,allocation_id_hash,enabled,config_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT(gate_id,allocation_kind,allocation_id_hash,config_version) DO UPDATE SET last_exposed_at=NOW(),exposure_count=gate_exposures.exposure_count+1`, g.ID, body.Allocation.Kind, hash, body.Enabled, body.ConfigVersion)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"exposed": true})
}

func ReportGateHealth(c *fiber.Ctx) error {
	var body gateSignalInput
	if c.BodyParser(&body) != nil {
		return fiber.NewError(400, "Invalid health event")
	}
	g, err := gateByKey(c, false)
	if err != nil {
		return err
	}
	if err = validateGateIdentity(&body.Allocation, g.AllocationKind); err != nil {
		return err
	}
	if body.EventID == "" || len(body.EventID) > 256 || !crashNamePattern.MatchString(body.Name) {
		return fiber.NewError(400, "event_id and a valid health event name are required")
	}
	if body.Severity != "info" && body.Severity != "warning" && body.Severity != "error" && body.Severity != "fatal" {
		return fiber.NewError(400, "Unsupported health-event severity")
	}
	properties, err := json.Marshal(body.Properties)
	if err != nil || len(properties) > 16_384 {
		return fiber.NewError(400, "Health-event properties are too large")
	}
	exceptionType, exceptionMessage, exceptionStack := any(nil), any(nil), any(nil)
	if body.Exception != nil {
		exceptionType = limitString(strings.TrimSpace(body.Exception.Type), 256)
		exceptionMessage = limitString(body.Exception.Message, 4096)
		exceptionStack = limitString(body.Exception.Stack, 32_768)
	}
	secret, err := projectTelemetrySecret(c.Context(), g.ProjectID)
	if err != nil {
		return err
	}
	hash := allocation.IdentityHash(secret, body.Allocation.Kind, body.Allocation.ID)
	var exists bool
	err = db.Pool.QueryRow(c.Context(), `SELECT EXISTS(SELECT 1 FROM gate_exposures WHERE gate_id=$1 AND allocation_kind=$2 AND allocation_id_hash=$3 AND config_version=$4 AND enabled=$5)`, g.ID, body.Allocation.Kind, hash, body.ConfigVersion, body.Enabled).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return fiber.NewError(409, "Health event must match a recorded gate exposure")
	}
	when := time.Now()
	if body.Timestamp != nil {
		when = *body.Timestamp
	}
	if when.After(time.Now().Add(time.Minute)) {
		return fiber.NewError(400, "Health-event timestamps cannot be in the future")
	}
	tag, err := db.Pool.Exec(c.Context(), `INSERT INTO gate_health_events(gate_id,event_id,allocation_kind,allocation_id_hash,enabled,config_version,name,severity,properties,timestamp,exception_type,exception_message,exception_stack) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(gate_id,event_id) DO NOTHING`, g.ID, body.EventID, body.Allocation.Kind, hash, body.Enabled, body.ConfigVersion, body.Name, body.Severity, properties, when, exceptionType, exceptionMessage, exceptionStack)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"ingested": tag.RowsAffected() == 1})
}

func UpdateGateRollout(c *fiber.Ctx) error {
	var body struct {
		RolloutPercentage float64 `json:"rollout_percentage"`
		ExpectedVersion   int     `json:"expected_version"`
	}
	if c.BodyParser(&body) != nil || body.RolloutPercentage < 0 || body.RolloutPercentage > 100 {
		return fiber.NewError(400, "Rollout percentage must be between 0 and 100")
	}
	return changeGate(c, "running", int(math.Round(body.RolloutPercentage*100)), body.ExpectedVersion)
}

func DisableGate(c *fiber.Ctx) error {
	var body struct {
		ExpectedVersion int `json:"expected_version"`
	}
	if c.BodyParser(&body) != nil {
		return fiber.NewError(400, "Invalid request")
	}
	return changeGate(c, "off", -1, body.ExpectedVersion)
}

func ArchiveGate(c *fiber.Ctx) error {
	var body struct {
		ExpectedVersion int `json:"expected_version"`
	}
	if c.BodyParser(&body) != nil {
		return fiber.NewError(400, "Invalid request")
	}
	return changeGate(c, "archived", -1, body.ExpectedVersion)
}

func changeGate(c *fiber.Ctx, status string, basisPoints, expectedVersion int) error {
	tx, err := db.Pool.Begin(c.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.Context())
	var id, currentVersion, currentBasisPoints int
	var currentStatus string
	err = tx.QueryRow(c.Context(), `SELECT id,status,rollout_basis_points,config_version FROM gates WHERE project_id=$1 AND key=$2 FOR UPDATE`, auth.ProjectID(c), c.Params("key")).Scan(&id, &currentStatus, &currentBasisPoints, &currentVersion)
	if err == pgx.ErrNoRows {
		return fiber.NewError(404, "Rollout not found")
	}
	if err != nil {
		return err
	}
	if currentStatus == "archived" {
		return fiber.NewError(409, "Archived rollouts cannot be changed")
	}
	if expectedVersion != currentVersion {
		return fiber.NewError(409, "Rollout changed in another session; refresh before trying again")
	}
	if basisPoints < 0 {
		basisPoints = currentBasisPoints
	}
	newVersion := currentVersion + 1
	archivedAt := any(nil)
	if status == "archived" {
		archivedAt = time.Now()
	}
	_, err = tx.Exec(c.Context(), `UPDATE gates SET status=$2,rollout_basis_points=$3,config_version=$4,updated_at=NOW(),archived_at=$5 WHERE id=$1`, id, status, basisPoints, newVersion, archivedAt)
	if err != nil {
		return err
	}
	_, err = tx.Exec(c.Context(), `INSERT INTO gate_changes(gate_id,config_version,status,rollout_basis_points,changed_by) VALUES($1,$2,$3,$4,$5)`, id, newVersion, status, basisPoints, auth.UserID(c))
	if err != nil {
		return err
	}
	if err = tx.Commit(c.Context()); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": status, "rollout_percentage": float64(basisPoints) / 100, "config_version": newVersion})
}
