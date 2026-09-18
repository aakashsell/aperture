package handlers

import (
	"aperture/api/allocation"
	"aperture/api/auth"
	"aperture/api/db"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

type crashException struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Stack   string `json:"stack"`
}

type crashInput struct {
	Allocation    gateIdentity    `json:"allocation"`
	EventID       string          `json:"event_id"`
	GateKey       string          `json:"gate_key"`
	ConfigVersion int             `json:"config_version"`
	Name          string          `json:"name"`
	Severity      string          `json:"severity"`
	Exception     *crashException `json:"exception"`
	Properties    map[string]any  `json:"properties"`
	Timestamp     *time.Time      `json:"timestamp"`
}

func ReportCrash(c *fiber.Ctx) error {
	var body crashInput
	if c.BodyParser(&body) != nil {
		return fiber.NewError(400, "Invalid crash report")
	}
	if err := validateGateIdentity(&body.Allocation, body.Allocation.Kind); err != nil {
		return err
	}
	body.EventID = strings.TrimSpace(body.EventID)
	body.Name = strings.TrimSpace(body.Name)
	body.GateKey = strings.TrimSpace(body.GateKey)
	if body.EventID == "" || len(body.EventID) > 256 || !crashNamePattern.MatchString(body.Name) {
		return fiber.NewError(400, "event_id and a valid crash name are required")
	}
	if body.Severity != "info" && body.Severity != "warning" && body.Severity != "error" && body.Severity != "fatal" {
		return fiber.NewError(400, "Unsupported crash severity")
	}
	if body.GateKey != "" && !keyPattern.MatchString(body.GateKey) {
		return fiber.NewError(400, "Invalid gate key")
	}
	if body.ConfigVersion < 0 || (body.GateKey == "" && body.ConfigVersion != 0) {
		return fiber.NewError(400, "A configuration version requires a gate key")
	}
	projectID := auth.ProjectID(c)
	if body.GateKey != "" {
		var allocationKind string
		var currentVersion int
		err := db.Pool.QueryRow(c.Context(), `SELECT allocation_kind,config_version FROM gates WHERE project_id=$1 AND key=$2`, projectID, body.GateKey).Scan(&allocationKind, &currentVersion)
		if err == pgx.ErrNoRows {
			return fiber.NewError(400, "Crash gate does not exist in this project")
		}
		if err != nil {
			return err
		}
		if allocationKind != body.Allocation.Kind || body.ConfigVersion > currentVersion {
			return fiber.NewError(400, "Crash gate metadata does not match this installation")
		}
	}
	if body.Exception != nil {
		body.Exception.Type = limitString(strings.TrimSpace(body.Exception.Type), 256)
		body.Exception.Message = limitString(body.Exception.Message, 4096)
		body.Exception.Stack = limitString(body.Exception.Stack, 32_768)
	}
	properties, err := json.Marshal(body.Properties)
	if err != nil || len(properties) > 16_384 {
		return fiber.NewError(400, "Crash properties are too large")
	}
	when := time.Now()
	if body.Timestamp != nil {
		when = *body.Timestamp
	}
	if when.After(time.Now().Add(time.Minute)) {
		return fiber.NewError(400, "Crash timestamps cannot be in the future")
	}
	secret, err := projectTelemetrySecret(c.Context(), projectID)
	if err != nil {
		return err
	}
	identityHash := allocation.IdentityHash(secret, body.Allocation.Kind, body.Allocation.ID)
	exceptionType, exceptionMessage, exceptionStack := any(nil), any(nil), any(nil)
	if body.Exception != nil {
		exceptionType, exceptionMessage, exceptionStack = body.Exception.Type, body.Exception.Message, body.Exception.Stack
	}
	fingerprintBytes := sha256.Sum256([]byte(body.Name + "\x00" + valueString(exceptionType) + "\x00" + valueString(exceptionMessage)))
	fingerprint := hex.EncodeToString(fingerprintBytes[:])
	dedupeWindow := when.Unix() / 300
	if body.Timestamp != nil && time.Since(when) > 24*time.Hour {
		return fiber.NewError(400, "Crash timestamps cannot be more than 24 hours old")
	}
	tx, err := db.Pool.Begin(c.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.Context())
	tag, err := tx.Exec(c.Context(), `INSERT INTO crash_event_receipts(project_id,event_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, projectID, body.EventID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return c.JSON(fiber.Map{"ingested": false, "duplicate": true})
	}
	var occurrences int
	err = tx.QueryRow(c.Context(), `INSERT INTO crash_events(project_id,event_id,allocation_kind,allocation_id_hash,gate_key,config_version,name,severity,exception_type,exception_message,exception_stack,properties,fingerprint,dedupe_window,first_seen_at,last_seen_at)
		VALUES($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,0),$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
		ON CONFLICT(project_id,allocation_id_hash,fingerprint,dedupe_window) DO UPDATE SET occurrence_count=crash_events.occurrence_count+1,last_seen_at=GREATEST(crash_events.last_seen_at,EXCLUDED.last_seen_at),severity=CASE WHEN EXCLUDED.severity='fatal' THEN 'fatal' ELSE crash_events.severity END
		RETURNING occurrence_count`, projectID, body.EventID, body.Allocation.Kind, identityHash, body.GateKey, body.ConfigVersion, body.Name, body.Severity, exceptionType, exceptionMessage, exceptionStack, properties, fingerprint, dedupeWindow, when).Scan(&occurrences)
	if err != nil {
		return err
	}
	if err := tx.Commit(c.Context()); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"ingested": true, "deduplicated": occurrences > 1, "occurrences": occurrences})
}

func limitString(value string, max int) string {
	if len(value) > max {
		value = string([]rune(value)[:maxRunesWithin(value, max)])
	}
	return value
}

func maxRunesWithin(value string, maxBytes int) int {
	used, count := 0, 0
	for _, r := range value {
		size := len(string(r))
		if used+size > maxBytes {
			break
		}
		used += size
		count++
	}
	return count
}

func valueString(value any) string {
	if value == nil {
		return ""
	}
	return value.(string)
}

func ListCrashes(c *fiber.Ctx) error {
	var body struct {
		AllocationID   string `json:"allocation_id"`
		AllocationKind string `json:"allocation_kind"`
		Limit          int    `json:"limit"`
	}
	if c.BodyParser(&body) != nil {
		return fiber.NewError(400, "Invalid crash query")
	}
	if body.Limit <= 0 || body.Limit > 100 {
		body.Limit = 50
	}
	projectID := auth.ProjectID(c)
	var identityHash any
	var allocationKind any
	if strings.TrimSpace(body.AllocationID) != "" {
		identity := gateIdentity{Kind: body.AllocationKind, ID: body.AllocationID}
		if err := validateGateIdentity(&identity, body.AllocationKind); err != nil {
			return err
		}
		secret, err := projectTelemetrySecret(c.Context(), projectID)
		if err != nil {
			return err
		}
		identityHash = allocation.IdentityHash(secret, identity.Kind, identity.ID)
		allocationKind = identity.Kind
	}
	rows, err := db.Pool.Query(c.Context(), `
		SELECT * FROM (
			SELECT event_id,allocation_kind,allocation_id_hash,gate_key,config_version,name,severity,exception_type,exception_message,exception_stack,properties,occurrence_count,first_seen_at,last_seen_at
			FROM crash_events WHERE project_id=$1 AND ($3::text IS NULL OR allocation_id_hash=$3) AND ($4::text IS NULL OR allocation_kind=$4)
			UNION ALL
			SELECT h.event_id,h.allocation_kind,h.allocation_id_hash,g.key,h.config_version,h.name,h.severity,h.exception_type,h.exception_message,h.exception_stack,h.properties,1,h.timestamp,h.timestamp
			FROM gate_health_events h JOIN gates g ON g.id=h.gate_id WHERE g.project_id=$1 AND ($3::text IS NULL OR h.allocation_id_hash=$3) AND ($4::text IS NULL OR h.allocation_kind=$4)
		) recent ORDER BY last_seen_at DESC LIMIT $2`, projectID, body.Limit, identityHash, allocationKind)
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
