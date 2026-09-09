package handlers

import (
	"aperture/api/assignment"
	"aperture/api/db"
	"aperture/api/models"
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
)

func ListExperiments(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.JSON([]models.Experiment{})
	}

	rows, err := db.Pool.Query(ctx, `
		SELECT id, project_id, key, name, status, primary_metric_id, activation_event, allocated_percentage, created_at
		FROM experiments WHERE project_id = $1`, *projectID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var out []models.Experiment
	for rows.Next() {
		var e models.Experiment
		rows.Scan(&e.ID, &e.ProjectID, &e.Key, &e.Name, &e.Status, &e.PrimaryMetricID, &e.ActivationEvent, &e.AllocatedPercentage, &e.CreatedAt)
		out = append(out, e)
	}
	return c.JSON(out)
}

func CreateExperiment(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}

	var body struct {
		Key                 string                   `json:"key"`
		Name                string                   `json:"name"`
		Variants            []map[string]interface{} `json:"variants"`
		ActivationEvent     *string                  `json:"activation_event"`
		AllocatedPercentage int                      `json:"allocated_percentage"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	var expID int
	err = db.Pool.QueryRow(ctx, `
		INSERT INTO experiments (project_id, key, name, status, activation_event, allocated_percentage)
		VALUES ($1, $2, $3, 'draft', $4, $5) RETURNING id`,
		*projectID, body.Key, body.Name, body.ActivationEvent, body.AllocatedPercentage,
	).Scan(&expID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	for _, v := range body.Variants {
		key, _ := v["key"].(string)
		name, _ := v["name"].(string)
		if name == "" {
			name = key
		}
		alloc := 50
		if a, ok := v["allocation"].(float64); ok {
			alloc = int(a)
		}
		isControl := false
		if ic, ok := v["is_control"].(bool); ok {
			isControl = ic
		}
		db.Pool.Exec(ctx, `
			INSERT INTO variants (experiment_id, key, name, allocation, is_control)
			VALUES ($1, $2, $3, $4, $5)`,
			expID, key, name, alloc, isControl)
	}

	var e models.Experiment
	db.Pool.QueryRow(ctx, `
		SELECT id, project_id, key, name, status, primary_metric_id, activation_event, allocated_percentage, created_at
		FROM experiments WHERE id = $1`, expID).Scan(
		&e.ID, &e.ProjectID, &e.Key, &e.Name, &e.Status, &e.PrimaryMetricID, &e.ActivationEvent, &e.AllocatedPercentage, &e.CreatedAt,
	)
	return c.JSON(e)
}

func GetVariants(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}
	key := c.Params("key")

	var expID int
	err = db.Pool.QueryRow(ctx, `SELECT id FROM experiments WHERE project_id = $1 AND key = $2`, *projectID, key).Scan(&expID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "experiment not found"})
	}

	rows, err := db.Pool.Query(ctx, `SELECT id, experiment_id, key, name, allocation, is_control FROM variants WHERE experiment_id = $1`, expID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var out []models.Variant
	for rows.Next() {
		var v models.Variant
		rows.Scan(&v.ID, &v.ExperimentID, &v.Key, &v.Name, &v.Allocation, &v.IsControl)
		out = append(out, v)
	}
	return c.JSON(out)
}

func AssignUser(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}
	key := c.Params("key")

	var body struct{ UserID string `json:"user_id"` }
	c.BodyParser(&body)

	var expID int
	var expKey string
	err = db.Pool.QueryRow(ctx, `SELECT id, key FROM experiments WHERE project_id = $1 AND key = $2`, *projectID, key).Scan(&expID, &expKey)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "experiment not found"})
	}

	variant, err := assignment.GetVariant(ctx, expID, expKey, body.UserID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}

	if variant == nil {
		return c.JSON(fiber.Map{"experiment_key": key, "variant": nil, "assigned": false})
	}
	return c.JSON(fiber.Map{"experiment_key": key, "variant": variant.Key, "assigned": true})
}

func ExposeUser(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}
	key := c.Params("key")

	var body struct{ UserID string `json:"user_id"` }
	c.BodyParser(&body)

	var expID int
	var expKey string
	err = db.Pool.QueryRow(ctx, `SELECT id, key FROM experiments WHERE project_id = $1 AND key = $2`, *projectID, key).Scan(&expID, &expKey)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "experiment not found"})
	}

	variant, err := assignment.GetVariant(ctx, expID, expKey, body.UserID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	if variant == nil {
		return c.JSON(fiber.Map{"exposed": false, "reason": "not_assigned"})
	}

	var existingID int
	err = db.Pool.QueryRow(ctx, `SELECT id FROM exposures WHERE experiment_id = $1 AND user_id = $2`, expID, body.UserID).Scan(&existingID)
	if err == pgx.ErrNoRows {
		db.Pool.Exec(ctx, `INSERT INTO exposures (experiment_id, user_id, variant_id) VALUES ($1, $2, $3)`, expID, body.UserID, variant.ID)
	}

	return c.JSON(fiber.Map{"exposed": true, "variant": variant.Key})
}

func StartExperiment(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}
	db.Pool.Exec(ctx, `UPDATE experiments SET status = 'running' WHERE project_id = $1 AND key = $2`, *projectID, c.Params("key"))
	return c.JSON(fiber.Map{"status": "running"})
}

func PauseExperiment(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}
	db.Pool.Exec(ctx, `UPDATE experiments SET status = 'paused' WHERE project_id = $1 AND key = $2`, *projectID, c.Params("key"))
	return c.JSON(fiber.Map{"status": "paused"})
}

func RolloutExperiment(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}
	key := c.Params("key")
	variantKey := c.Query("variant_key")

	var expID int
	err = db.Pool.QueryRow(ctx, `SELECT id FROM experiments WHERE project_id = $1 AND key = $2`, *projectID, key).Scan(&expID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "experiment not found"})
	}

	db.Pool.Exec(ctx, `
		UPDATE variants SET allocation = CASE WHEN key = $1 THEN 100 ELSE 0 END
		WHERE experiment_id = $2`, variantKey, expID)
	db.Pool.Exec(ctx, `UPDATE experiments SET status = 'completed' WHERE id = $1`, expID)
	return c.JSON(fiber.Map{"status": "completed", "winner": variantKey})
}

func ListMetrics(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.JSON([]models.Metric{})
	}

	rows, err := db.Pool.Query(ctx, `SELECT id, project_id, name, event_name, metric_type FROM metrics WHERE project_id = $1`, *projectID)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var out []models.Metric
	for rows.Next() {
		var m models.Metric
		rows.Scan(&m.ID, &m.ProjectID, &m.Name, &m.EventName, &m.MetricType)
		out = append(out, m)
	}
	return c.JSON(out)
}

func CreateMetric(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}

	var body struct {
		Name       string `json:"name"`
		EventName  string `json:"event_name"`
		MetricType string `json:"metric_type"`
	}
	c.BodyParser(&body)

	var id int
	db.Pool.QueryRow(ctx, `
		INSERT INTO metrics (project_id, name, event_name, metric_type)
		VALUES ($1, $2, $3, $4) RETURNING id`,
		*projectID, body.Name, body.EventName, body.MetricType,
	).Scan(&id)

	var m models.Metric
	db.Pool.QueryRow(ctx, `SELECT id, project_id, name, event_name, metric_type FROM metrics WHERE id = $1`, id).Scan(
		&m.ID, &m.ProjectID, &m.Name, &m.EventName, &m.MetricType,
	)
	return c.JSON(m)
}

func LinkMetric(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}
	key := c.Params("key")

	var body struct {
		MetricID  int  `json:"metric_id"`
		IsPrimary bool `json:"is_primary"`
	}
	c.BodyParser(&body)

	var expID int
	err = db.Pool.QueryRow(ctx, `SELECT id FROM experiments WHERE project_id = $1 AND key = $2`, *projectID, key).Scan(&expID)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "experiment not found"})
	}

	if body.IsPrimary {
		db.Pool.Exec(ctx, `UPDATE experiment_metrics SET is_primary = false WHERE experiment_id = $1 AND is_primary = true`, expID)
		db.Pool.Exec(ctx, `UPDATE experiments SET primary_metric_id = $1 WHERE id = $2`, body.MetricID, expID)
	}

	db.Pool.Exec(ctx, `
		INSERT INTO experiment_metrics (experiment_id, metric_id, is_primary) VALUES ($1, $2, $3)
		ON CONFLICT (experiment_id, metric_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
		expID, body.MetricID, body.IsPrimary)

	return c.JSON(fiber.Map{"linked": true})
}

func TrackEvent(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}

	var body struct {
		EventID    string                 `json:"event_id"`
		UserID     string                 `json:"user_id"`
		EventName  string                 `json:"event_name"`
		Value      *float64               `json:"value"`
		Properties map[string]interface{} `json:"properties"`
		Timestamp  *string                `json:"timestamp"`
	}
	c.BodyParser(&body)

	var ts interface{}
	if body.Timestamp != nil {
		ts = *body.Timestamp
	}

	_, err = db.Pool.Exec(ctx, `
		INSERT INTO events (project_id, event_id, user_id, event_name, value, properties, timestamp)
		VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
		ON CONFLICT (project_id, event_id) DO NOTHING`,
		*projectID, body.EventID, body.UserID, body.EventName, body.Value, body.Properties, ts,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"ingested": true})
}

func GetResults(c *fiber.Ctx) error {
	ctx := context.Background()
	projectID, err := assignment.GetDefaultProject(ctx)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "no project"})
	}
	key := c.Params("key")

	var expID int
	var status string
	err = db.Pool.QueryRow(ctx, `SELECT id, status FROM experiments WHERE project_id = $1 AND key = $2`, *projectID, key).Scan(&expID, &status)
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

	type metricInfo struct{ id int; name string; mtype string; isPrimary bool }
	var metrics []metricInfo
	for mrows.Next() {
		var m metricInfo
		mrows.Scan(&m.id, &m.name, &m.mtype, &m.isPrimary)
		metrics = append(metrics, m)
	}

	var outMetrics []map[string]interface{}
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
			}
			err := db.Pool.QueryRow(ctx, `
				SELECT sample_size, mean, lift, lift_ci_lower, lift_ci_upper, p_value
				FROM experiment_results WHERE experiment_id = $1 AND metric_id = $2 AND variant_id = $3`,
				expID, m.id, vid,
			).Scan(&r.SampleSize, &r.Mean, &r.Lift, &r.CILower, &r.CIUpper, &r.PValue)
			if err != nil && err != pgx.ErrNoRows {
				continue
			}

			entry := map[string]interface{}{"variant": v["key"], "is_control": v["is_control"], "sample_size": r.SampleSize}
			if r.Mean != nil { entry["mean"] = *r.Mean }
			if r.Lift != nil { entry["lift"] = *r.Lift }
			if r.CILower != nil { entry["lift_ci_lower"] = *r.CILower }
			if r.CIUpper != nil { entry["lift_ci_upper"] = *r.CIUpper }
			if r.PValue != nil { entry["p_value"] = *r.PValue }

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

	return c.JSON(fiber.Map{
		"experiment_key": key, "status": status, "metrics": outMetrics,
	})
}
