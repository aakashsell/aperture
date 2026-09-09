package models

import "time"

// Experiment represents an A/B test definition.
type Experiment struct {
	ID                  int       `json:"id"`
	ProjectID           int       `json:"project_id"`
	Key                 string    `json:"key"`
	Name                string    `json:"name"`
	Status              string    `json:"status"` // draft, running, paused, completed
	PrimaryMetricID     *int      `json:"primary_metric_id"`
	ActivationEvent     *string   `json:"activation_event"`
	AllocatedPercentage int       `json:"allocated_percentage"`
	CreatedAt           time.Time `json:"created_at"`
}

// Variant is a treatment bucket within an experiment.
type Variant struct {
	ID           int    `json:"id"`
	ExperimentID int    `json:"experiment_id"`
	Key          string `json:"key"`
	Name         string `json:"name"`
	Allocation   int    `json:"allocation"`
	IsControl    bool   `json:"is_control"`
}

// Assignment is an immutable user→variant mapping.
type Assignment struct {
	ID           int       `json:"id"`
	ExperimentID int       `json:"experiment_id"`
	UserID       string    `json:"user_id"`
	VariantID    int       `json:"variant_id"`
	AssignedAt   time.Time `json:"assigned_at"`
}

// Override allows manual user-level experiment manipulation.
type Override struct {
	ID           int       `json:"id"`
	ExperimentID int       `json:"experiment_id"`
	UserID       string    `json:"user_id"`
	VariantID    *int      `json:"variant_id"`
	Excluded     bool      `json:"excluded"`
	CreatedAt    time.Time `json:"created_at"`
}

// Exposure records an explicit user exposure event.
type Exposure struct {
	ID           int       `json:"id"`
	ExperimentID int       `json:"experiment_id"`
	UserID       string    `json:"user_id"`
	VariantID    int       `json:"variant_id"`
	ExposedAt    time.Time `json:"exposed_at"`
}

// Metric defines how events map to experiment measurements.
type Metric struct {
	ID         int    `json:"id"`
	ProjectID  int    `json:"project_id"`
	Name       string `json:"name"`
	EventName  string `json:"event_name"`
	MetricType string `json:"metric_type"` // binary, continuous, ratio, count
}

// Event is an ingested user action.
type Event struct {
	ID         int                    `json:"id"`
	ProjectID  int                    `json:"project_id"`
	EventID    string                 `json:"event_id"`
	UserID     string                 `json:"user_id"`
	EventName  string                 `json:"event_name"`
	Value      *float64               `json:"value"`
	Properties map[string]interface{} `json:"properties"`
	Timestamp  time.Time              `json:"timestamp"`
}
