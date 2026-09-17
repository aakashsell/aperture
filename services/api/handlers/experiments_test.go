package handlers

import "testing"

func TestExperimentValidation(t *testing.T) {
	valid := experimentInput{Key: "checkout", Name: "Checkout", AllocatedPercentage: 100, AttributionDays: 7, Variants: []variantInput{{Key: "control", Allocation: 50, IsControl: true}, {Key: "treatment", Allocation: 50}}}
	if err := validateExperiment(valid); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name   string
		change func(*experimentInput)
	}{
		{"missing control", func(e *experimentInput) { e.Variants[0].IsControl = false }},
		{"bad allocation", func(e *experimentInput) { e.Variants[0].Allocation = 20 }},
		{"duplicate key", func(e *experimentInput) { e.Variants[1].Key = "control" }},
		{"negative traffic", func(e *experimentInput) { e.AllocatedPercentage = -1 }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := valid
			e.Variants = append([]variantInput(nil), valid.Variants...)
			tc.change(&e)
			if validateExperiment(e) == nil {
				t.Fatal("invalid configuration accepted")
			}
		})
	}
}
