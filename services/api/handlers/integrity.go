package handlers

import (
	"aperture/api/db"
	"github.com/gofiber/fiber/v2"
	"math"
)

type Coverage struct {
	Variant  string   `json:"variant"`
	Control  bool     `json:"is_control"`
	Assigned int      `json:"assigned"`
	Exposed  int      `json:"exposed"`
	Rate     *float64 `json:"coverage"`
}
type Integrity struct {
	Status   string     `json:"status"`
	Issues   []string   `json:"issues"`
	Variants []Coverage `json:"variants"`
}

func assessCoverage(variants []Coverage, srm *float64) Integrity {
	out := Integrity{Status: "collecting", Issues: []string{}, Variants: variants}
	if srm != nil && *srm < .001 {
		out.Issues = append(out.Issues, "Assignment counts differ from the configured allocation. Investigate bucketing and eligibility.")
	}
	var control *Coverage
	for i := range variants {
		if variants[i].Assigned > 0 {
			r := float64(variants[i].Exposed) / float64(variants[i].Assigned)
			variants[i].Rate = &r
		}
		if variants[i].Control {
			control = &variants[i]
		}
	}
	if control != nil && control.Assigned >= 30 {
		enough := true
		for _, v := range variants {
			if v.Control {
				continue
			}
			if v.Assigned < 30 {
				enough = false
				continue
			}
			pc, pt := float64(control.Exposed)/float64(control.Assigned), float64(v.Exposed)/float64(v.Assigned)
			pooled := float64(control.Exposed+v.Exposed) / float64(control.Assigned+v.Assigned)
			se := math.Sqrt(pooled * (1 - pooled) * (1/float64(control.Assigned) + 1/float64(v.Assigned)))
			// Diagnostic, not proof of bias: require a material gap and strong imbalance signal.
			if se > 0 && math.Abs(pt-pc) >= .05 && math.Erfc(math.Abs(pt-pc)/se/math.Sqrt2) < .001 {
				out.Issues = append(out.Issues, "Exposure coverage differs substantially for "+v.Variant+". Check tracking and who reaches the experience before interpreting effects.")
			}
		}
		if enough {
			out.Status = "no_flags"
		}
	}
	if len(out.Issues) > 0 {
		out.Status = "needs_review"
	}
	return out
}
func experimentIntegrity(c *fiber.Ctx, id int, srm *float64) (Integrity, error) {
	rows, err := db.Pool.Query(c.Context(), `SELECT v.key,v.is_control,(SELECT count(*) FROM assignments a WHERE a.variant_id=v.id),(SELECT count(*) FROM exposures x WHERE x.variant_id=v.id) FROM variants v WHERE v.experiment_id=$1 ORDER BY v.id`, id)
	if err != nil {
		return Integrity{}, err
	}
	defer rows.Close()
	variants := []Coverage{}
	for rows.Next() {
		var v Coverage
		if err = rows.Scan(&v.Variant, &v.Control, &v.Assigned, &v.Exposed); err != nil {
			return Integrity{}, err
		}
		variants = append(variants, v)
	}
	if err = rows.Err(); err != nil {
		return Integrity{}, err
	}
	return assessCoverage(variants, srm), nil
}
