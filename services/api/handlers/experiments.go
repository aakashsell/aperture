package handlers

import (
	"aperture/api/assignment"
	"aperture/api/auth"
	"aperture/api/db"
	"context"
	"encoding/json"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"regexp"
	"strings"
	"time"
)

func project(c *fiber.Ctx) (*int, error) {
	id := auth.ProjectID(c)
	if id == 0 {
		return nil, fmt.Errorf("project required")
	}
	return &id, nil
}

var keyPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,100}$`)

type variantInput struct {
	Key        string `json:"key"`
	Name       string `json:"name"`
	Allocation int    `json:"allocation"`
	IsControl  bool   `json:"is_control"`
}
type primaryMetricInput struct {
	Name       string `json:"name"`
	EventName  string `json:"event_name"`
	MetricType string `json:"metric_type"`
}
type experimentInput struct {
	PrimaryMetric       *primaryMetricInput `json:"primary_metric"`
	Key                 string              `json:"key"`
	Name                string              `json:"name"`
	Hypothesis          string              `json:"hypothesis"`
	AllocatedPercentage int                 `json:"allocated_percentage"`
	AttributionDays     int                 `json:"attribution_days"`
	Variants            []variantInput      `json:"variants"`
}

func validateExperiment(b experimentInput) error {
	if !keyPattern.MatchString(b.Key) || strings.TrimSpace(b.Name) == "" {
		return fiber.NewError(400, "Name and a valid experiment key are required")
	}
	if b.AllocatedPercentage < 1 || b.AllocatedPercentage > 100 || b.AttributionDays < 1 || b.AttributionDays > 90 {
		return fiber.NewError(400, "Traffic must be 1–100% and attribution 1–90 days")
	}
	if len(b.Variants) < 2 || len(b.Variants) > 8 {
		return fiber.NewError(400, "Use between 2 and 8 variants")
	}
	total, controls := 0, 0
	seen := map[string]bool{}
	for _, v := range b.Variants {
		if !keyPattern.MatchString(v.Key) || seen[v.Key] || v.Allocation <= 0 {
			return fiber.NewError(400, "Variant keys must be unique with positive allocations")
		}
		seen[v.Key] = true
		total += v.Allocation
		if v.IsControl {
			controls++
		}
	}
	if total != 100 || controls != 1 {
		return fiber.NewError(400, "Allocations must total 100 with exactly one control")
	}
	return nil
}
func ListExperiments(c *fiber.Ctx) error {
	rows, err := db.Pool.Query(c.Context(), `SELECT e.id,e.key,e.name,e.status,e.hypothesis,e.allocated_percentage,e.created_at,(SELECT count(*) FROM exposures x WHERE x.experiment_id=e.id) AS exposures,(SELECT max(updated_at) FROM experiment_results r WHERE r.experiment_id=e.id) AS results_updated_at FROM experiments e WHERE project_id=$1 ORDER BY created_at DESC`, auth.ProjectID(c))
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
func CreateExperiment(c *fiber.Ctx) error {
	var b experimentInput
	if c.BodyParser(&b) != nil {
		return fiber.NewError(400, "Invalid experiment")
	}
	if b.AttributionDays == 0 {
		b.AttributionDays = 7
	}
	if err := validateExperiment(b); err != nil {
		return err
	}
	tx, err := db.Pool.Begin(c.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.Context())
	var id int
	err = tx.QueryRow(c.Context(), `INSERT INTO experiments(project_id,key,name,hypothesis,allocated_percentage,attribution_days) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, auth.ProjectID(c), b.Key, b.Name, b.Hypothesis, b.AllocatedPercentage, b.AttributionDays).Scan(&id)
	if err != nil {
		return fiber.NewError(409, "Experiment key already exists or experiment could not be saved")
	}
	for _, v := range b.Variants {
		if v.Name == "" {
			v.Name = v.Key
		}
		_, err = tx.Exec(c.Context(), `INSERT INTO variants(experiment_id,key,name,allocation,is_control) VALUES($1,$2,$3,$4,$5)`, id, v.Key, v.Name, v.Allocation, v.IsControl)
		if err != nil {
			return err
		}
	}
	if m := b.PrimaryMetric; m != nil {
		if strings.TrimSpace(m.Name) == "" || !keyPattern.MatchString(m.EventName) || (m.MetricType != "binary" && m.MetricType != "count" && m.MetricType != "continuous") {
			return fiber.NewError(400, "Invalid primary metric")
		}
		var metricID int
		err = tx.QueryRow(c.Context(), `INSERT INTO metrics(project_id,name,event_name,metric_type) VALUES($1,$2,$3,$4) RETURNING id`, auth.ProjectID(c), m.Name, m.EventName, m.MetricType).Scan(&metricID)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(c.Context(), `INSERT INTO experiment_metrics(experiment_id,metric_id,is_primary) VALUES($1,$2,true)`, id, metricID); err != nil {
			return err
		}
		if _, err = tx.Exec(c.Context(), `UPDATE experiments SET primary_metric_id=$2 WHERE id=$1`, id, metricID); err != nil {
			return err
		}
	}
	if err = tx.Commit(c.Context()); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"id": id, "key": b.Key, "status": "draft"})
}
func experimentID(c *fiber.Ctx) (int, error) {
	var id int
	err := db.Pool.QueryRow(c.Context(), `SELECT id FROM experiments WHERE project_id=$1 AND key=$2`, auth.ProjectID(c), c.Params("key")).Scan(&id)
	if err == pgx.ErrNoRows {
		return 0, fiber.NewError(404, "Experiment not found")
	}
	return id, err
}
func GetVariants(c *fiber.Ctx) error {
	id, err := experimentID(c)
	if err != nil {
		return err
	}
	rows, err := db.Pool.Query(c.Context(), `SELECT id,key,name,allocation,is_control FROM variants WHERE experiment_id=$1 ORDER BY id`, id)
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		return err
	}
	return c.JSON(out)
}
func resolve(c *fiber.Ctx, user string) error {
	if strings.TrimSpace(user) == "" || len(user) > 256 {
		return fiber.NewError(400, "user_id is required (maximum 256 bytes)")
	}
	id, err := experimentID(c)
	if err != nil {
		return err
	}
	v, err := assignment.GetVariant(c.Context(), id, c.Params("key"), user)
	if err != nil {
		return err
	}
	c.Set("Cache-Control", "no-store")
	if v == nil {
		return c.JSON(fiber.Map{"experiment_key": c.Params("key"), "variant": nil, "assigned": false})
	}
	return c.JSON(fiber.Map{"experiment_key": c.Params("key"), "variant": v.Key, "assigned": true})
}
func GetAssignUser(c *fiber.Ctx) error { return resolve(c, c.Query("user_id")) }
func AssignUser(c *fiber.Ctx) error {
	var b struct {
		UserID string `json:"user_id"`
	}
	if c.BodyParser(&b) != nil {
		return fiber.NewError(400, "Invalid request")
	}
	return resolve(c, b.UserID)
}
func ExposeUser(c *fiber.Ctx) error {
	var b struct {
		UserID  string `json:"user_id"`
		Variant string `json:"variant"`
	}
	if c.BodyParser(&b) != nil || b.UserID == "" || b.Variant == "" {
		return fiber.NewError(400, "user_id and displayed variant are required")
	}
	id, err := experimentID(c)
	if err != nil {
		return err
	}
	tag, err := db.Pool.Exec(c.Context(), `INSERT INTO exposures(experiment_id,user_id,variant_id) SELECT a.experiment_id,a.user_id,a.variant_id FROM assignments a JOIN variants v ON v.id=a.variant_id JOIN experiments e ON e.id=a.experiment_id WHERE a.experiment_id=$1 AND a.user_id=$2 AND v.key=$3 AND e.status IN ('running','paused') ON CONFLICT(experiment_id,user_id) DO UPDATE SET user_id=EXCLUDED.user_id WHERE exposures.variant_id=EXCLUDED.variant_id`, id, b.UserID, b.Variant)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fiber.NewError(409, "Exposure must match a persisted assignment in an active experiment")
	}
	return c.JSON(fiber.Map{"exposed": true, "variant": b.Variant})
}
func StartExperiment(c *fiber.Ctx) error   { return transition(c, "running") }
func PauseExperiment(c *fiber.Ctx) error   { return transition(c, "paused") }
func RolloutExperiment(c *fiber.Ctx) error { return transition(c, "completed") }
func transition(c *fiber.Ctx, target string) error {
	tx, err := db.Pool.Begin(c.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.Context())
	var id int
	var status string
	err = tx.QueryRow(c.Context(), `SELECT id,status FROM experiments WHERE project_id=$1 AND key=$2 FOR UPDATE`, auth.ProjectID(c), c.Params("key")).Scan(&id, &status)
	if err == pgx.ErrNoRows {
		return fiber.NewError(404, "Experiment not found")
	}
	if err != nil {
		return err
	}
	if target == "running" && (status == "draft" || status == "paused") {
		var valid bool
		err = tx.QueryRow(c.Context(), `SELECT count(*) BETWEEN 2 AND 8 AND sum(allocation)=100 AND bool_and(allocation>0) AND count(*) FILTER(WHERE is_control)=1 FROM variants WHERE experiment_id=$1`, id).Scan(&valid)
		if err != nil {
			return err
		}
		if !valid {
			return fiber.NewError(409, "Fix variant allocations and control before starting")
		}

		var count int
		err = tx.QueryRow(c.Context(), `SELECT count(*) FROM experiment_metrics WHERE experiment_id=$1 AND is_primary`, id).Scan(&count)
		if err != nil {
			return err
		}
		if count != 1 {
			return fiber.NewError(409, "Choose a primary metric before starting")
		}
		_, err = tx.Exec(c.Context(), `UPDATE experiments SET status='running',started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE id=$1`, id)
	} else if target == "paused" && status == "running" {
		_, err = tx.Exec(c.Context(), `UPDATE experiments SET status='paused',updated_at=NOW() WHERE id=$1`, id)
	} else if target == "completed" && (status == "running" || status == "paused") {
		var winner int
		err = tx.QueryRow(c.Context(), `SELECT id FROM variants WHERE experiment_id=$1 AND key=$2`, id, c.Query("variant_key")).Scan(&winner)
		if err != nil {
			return fiber.NewError(400, "Select a valid rollout variant")
		}
		_, err = tx.Exec(c.Context(), `UPDATE experiments SET status='completed',completed_at=NOW(),winner_variant_id=$2,updated_at=NOW() WHERE id=$1`, id, winner)
	} else {
		return fiber.NewError(409, "Invalid experiment transition")
	}
	if err != nil {
		return err
	}
	if err = tx.Commit(c.Context()); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"status": target})
}
func ListMetrics(c *fiber.Ctx) error {
	rows, err := db.Pool.Query(c.Context(), `SELECT id,name,event_name,metric_type FROM metrics WHERE project_id=$1 ORDER BY id`, auth.ProjectID(c))
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		return err
	}
	if out == nil {
		out = []map[string]any{}
	}
	return c.JSON(out)
}
func CreateMetric(c *fiber.Ctx) error {
	var b struct {
		Name       string `json:"name"`
		EventName  string `json:"event_name"`
		MetricType string `json:"metric_type"`
	}
	if c.BodyParser(&b) != nil || strings.TrimSpace(b.Name) == "" || !keyPattern.MatchString(b.EventName) {
		return fiber.NewError(400, "Metric name and event name are required")
	}
	if b.MetricType != "binary" && b.MetricType != "continuous" && b.MetricType != "count" {
		return fiber.NewError(400, "Supported metrics: binary, continuous, count")
	}
	var id int
	err := db.Pool.QueryRow(c.Context(), `INSERT INTO metrics(project_id,name,event_name,metric_type) VALUES($1,$2,$3,$4) RETURNING id`, auth.ProjectID(c), b.Name, b.EventName, b.MetricType).Scan(&id)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{"id": id, "name": b.Name, "event_name": b.EventName, "metric_type": b.MetricType})
}
func LinkMetric(c *fiber.Ctx) error {
	var b struct {
		MetricID  int  `json:"metric_id"`
		IsPrimary bool `json:"is_primary"`
	}
	if c.BodyParser(&b) != nil {
		return fiber.NewError(400, "Invalid metric")
	}
	tx, err := db.Pool.Begin(c.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.Context())
	var id int
	var status string
	err = tx.QueryRow(c.Context(), `SELECT id,status FROM experiments WHERE project_id=$1 AND key=$2 FOR UPDATE`, auth.ProjectID(c), c.Params("key")).Scan(&id, &status)
	if err != nil {
		return fiber.NewError(404, "Experiment not found")
	}
	if status != "draft" {
		return fiber.NewError(409, "Metrics are frozen after first start")
	}
	var metric int
	err = tx.QueryRow(c.Context(), `SELECT id FROM metrics WHERE id=$1 AND project_id=$2`, b.MetricID, auth.ProjectID(c)).Scan(&metric)
	if err != nil {
		return fiber.NewError(404, "Metric not found")
	}
	if b.IsPrimary {
		if _, err = tx.Exec(c.Context(), `UPDATE experiment_metrics SET is_primary=false WHERE experiment_id=$1`, id); err != nil {
			return err
		}
		if _, err = tx.Exec(c.Context(), `UPDATE experiments SET primary_metric_id=$2 WHERE id=$1`, id, b.MetricID); err != nil {
			return err
		}
	}
	_, err = tx.Exec(c.Context(), `INSERT INTO experiment_metrics VALUES($1,$2,$3) ON CONFLICT(experiment_id,metric_id) DO UPDATE SET is_primary=EXCLUDED.is_primary`, id, b.MetricID, b.IsPrimary)
	if err != nil {
		return err
	}
	if err = tx.Commit(c.Context()); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"linked": true})
}

type eventInput struct {
	EventID    string          `json:"event_id"`
	UserID     string          `json:"user_id"`
	EventName  string          `json:"event_name"`
	Value      *float64        `json:"value"`
	Properties json.RawMessage `json:"properties"`
	Timestamp  *time.Time      `json:"timestamp"`
}

func TrackEvent(c *fiber.Ctx) error {
	var b eventInput
	if c.BodyParser(&b) != nil {
		return fiber.NewError(400, "Invalid event")
	}
	return ingest(c, []eventInput{b})
}
func TrackEventsBatch(c *fiber.Ctx) error {
	var b struct {
		Events []eventInput `json:"events"`
	}
	if c.BodyParser(&b) != nil {
		return fiber.NewError(400, "Invalid events")
	}
	return ingest(c, b.Events)
}
func ingest(c *fiber.Ctx, events []eventInput) error {
	if len(events) == 0 || len(events) > 500 {
		return fiber.NewError(400, "Send 1–500 events")
	}
	for _, e := range events {
		if e.EventID == "" || len(e.EventID) > 256 || strings.TrimSpace(e.UserID) == "" || len(e.UserID) > 256 || !keyPattern.MatchString(e.EventName) {
			return fiber.NewError(400, "Each event needs event_id, user_id, and event_name")
		}
		if e.Timestamp != nil && e.Timestamp.After(time.Now().Add(time.Minute)) {
			return fiber.NewError(400, "Event timestamps cannot be in the future")
		}
	}
	tx, err := db.Pool.Begin(c.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(c.Context())
	count := int64(0)
	for _, e := range events {
		tag, err := tx.Exec(c.Context(), `INSERT INTO events(project_id,event_id,user_id,event_name,value,properties,timestamp) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,NOW())) ON CONFLICT(project_id,event_id) DO NOTHING`, auth.ProjectID(c), e.EventID, e.UserID, e.EventName, e.Value, e.Properties, e.Timestamp)
		if err != nil {
			return err
		}
		count += tag.RowsAffected()
	}
	if err = tx.Commit(c.Context()); err != nil {
		return err
	}
	return c.JSON(fiber.Map{"ingested": true, "inserted": count, "duplicates": int64(len(events)) - count})
}
func experimentSummary(c *fiber.Ctx, id int) map[string]any {
	var out map[string]any
	rows, err := db.Pool.Query(c.Context(), `SELECT name,hypothesis,allocated_percentage,attribution_days,started_at,completed_at,(SELECT key FROM variants WHERE id=e.winner_variant_id) AS winner,(SELECT count(*) FROM assignments WHERE experiment_id=e.id) AS assignments,(SELECT count(*) FROM exposures WHERE experiment_id=e.id) AS exposures,(SELECT max(updated_at) FROM experiment_results WHERE experiment_id=e.id) AS results_updated_at FROM experiments e WHERE id=$1`, id)
	if err == nil {
		out, _ = pgx.CollectOneRow(rows, pgx.RowToMap)
	}
	return out
}
func Diagnostics(c *fiber.Ctx) error {
	rows, err := db.Pool.Query(c.Context(), `SELECT event_id,user_id,event_name,value,timestamp FROM events WHERE project_id=$1 ORDER BY id DESC LIMIT 30`, auth.ProjectID(c))
	if err != nil {
		return err
	}
	events, err := pgx.CollectRows(rows, pgx.RowToMap)
	if err != nil {
		return err
	}
	if events == nil {
		events = []map[string]any{}
	}
	var updated *time.Time
	err = db.Pool.QueryRow(c.Context(), `SELECT updated_at FROM worker_health WHERE id=1`).Scan(&updated)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}
	return c.JSON(fiber.Map{"events": events, "worker_updated_at": updated})
}
func GetResults(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := project(c)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}
	key := c.Params("key")

	var expID int
	var status string
	var srmPValue *float64
	err = db.Pool.QueryRow(ctx, `SELECT id, status, srm_p_value FROM experiments WHERE project_id = $1 AND key = $2`, *projectID, key).Scan(&expID, &status, &srmPValue)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "experiment not found"})
	}

	// Variants
	rows, err := db.Pool.Query(ctx, `SELECT id, key, is_control FROM variants WHERE experiment_id = $1`, expID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var variantList []map[string]interface{}
	for rows.Next() {
		var id int
		var k string
		var ic bool
		rows.Scan(&id, &k, &ic)
		variantList = append(variantList, map[string]interface{}{"id": id, "key": k, "is_control": ic})
	}

	// Metrics
	mrows, err := db.Pool.Query(ctx, `
		SELECT m.id, m.name, m.metric_type, em.is_primary
		FROM metrics m
		JOIN experiment_metrics em ON em.metric_id = m.id
		WHERE em.experiment_id = $1`, expID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer mrows.Close()

	type metricInfo struct {
		id        int
		name      string
		mtype     string
		isPrimary bool
	}
	var metrics []metricInfo
	for mrows.Next() {
		var m metricInfo
		mrows.Scan(&m.id, &m.name, &m.mtype, &m.isPrimary)
		metrics = append(metrics, m)
	}

	outMetrics := []map[string]interface{}{}
	for _, m := range metrics {
		metricOut := map[string]interface{}{
			"metric_id": m.id, "metric_name": m.name,
			"metric_type": m.mtype, "is_primary": m.isPrimary,
		}
		var control map[string]interface{}
		var treatments []map[string]interface{}

		for _, v := range variantList {
			vid := v["id"].(int)
			var r struct {
				SampleSize int
				Mean       *float64
				Lift       *float64
				CILower    *float64
				CIUpper    *float64
				PValue     *float64
				MDE        *float64
			}
			err := db.Pool.QueryRow(ctx, `
				SELECT sample_size, mean, lift, lift_ci_lower, lift_ci_upper, p_value, mde
				FROM experiment_results WHERE experiment_id = $1 AND metric_id = $2 AND variant_id = $3`,
				expID, m.id, vid,
			).Scan(&r.SampleSize, &r.Mean, &r.Lift, &r.CILower, &r.CIUpper, &r.PValue, &r.MDE)
			if err != nil && err != pgx.ErrNoRows {
				continue
			}

			entry := map[string]interface{}{"variant": v["key"], "is_control": v["is_control"], "sample_size": r.SampleSize}
			if r.Mean != nil {
				entry["mean"] = *r.Mean
			}
			if r.Lift != nil {
				entry["lift"] = *r.Lift
			}
			if r.CILower != nil {
				entry["lift_ci_lower"] = *r.CILower
			}
			if r.CIUpper != nil {
				entry["lift_ci_upper"] = *r.CIUpper
			}
			if r.PValue != nil {
				entry["p_value"] = *r.PValue
			}
			if r.MDE != nil {
				entry["mde"] = *r.MDE
			}

			if v["is_control"].(bool) {
				control = entry
			} else {
				treatments = append(treatments, entry)
			}
		}
		metricOut["control"] = control
		metricOut["treatments"] = treatments
		outMetrics = append(outMetrics, metricOut)
	}

	integrity, err := experimentIntegrity(c, expID, srmPValue)
	if err != nil {
		return err
	}
	return c.JSON(fiber.Map{
		"integrity": integrity, "experiment_key": key, "status": status, "srm_p_value": srmPValue, "metrics": outMetrics, "summary": experimentSummary(c, expID),
	})
}
