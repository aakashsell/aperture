package handlers

import "testing"

func TestExposureDiagnostics(t *testing.T) {
	low := assessCoverage([]Coverage{{Variant: "control", Control: true, Assigned: 1000, Exposed: 100}, {Variant: "treatment", Assigned: 1000, Exposed: 100}}, nil)
	if low.Status != "no_flags" {
		t.Fatal("equal low coverage should not be labeled invalid")
	}
	biased := assessCoverage([]Coverage{{Variant: "control", Control: true, Assigned: 5021, Exposed: 4987}, {Variant: "treatment", Assigned: 4979, Exposed: 3102}}, nil)
	if biased.Status != "needs_review" || len(biased.Issues) != 1 {
		t.Fatal("failed to identify differential exposure")
	}
	tiny := assessCoverage([]Coverage{{Control: true, Assigned: 1, Exposed: 1}, {Assigned: 1}}, nil)
	if tiny.Status != "collecting" {
		t.Fatal("tiny samples should remain collecting")
	}
}
