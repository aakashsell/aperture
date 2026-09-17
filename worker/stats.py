"""Fixed-horizon, user-level estimates. Intervals are not sequential stopping rules."""
import numpy as np
from scipy import stats

MIN_SAMPLE = 30


def bootstrap_ci(treatment, control, n_boot=2000, ci=0.95):
    rng = np.random.default_rng(42)
    diffs = np.empty(n_boot)
    for i in range(n_boot):
        diffs[i] = rng.choice(treatment, len(treatment)).mean() - rng.choice(control, len(control)).mean()
    alpha = (1 - ci) / 2
    return float(np.mean(treatment) - np.mean(control)), *map(float, np.quantile(diffs, [alpha, 1-alpha]))


def compute_experiment_stats(treatment_values, control_values, metric_type="continuous"):
    t, c = np.asarray(treatment_values, dtype=float), np.asarray(control_values, dtype=float)
    if not np.all(np.isfinite(t)) or not np.all(np.isfinite(c)):
        raise ValueError("Metric values must be finite")
    nt, nc = len(t), len(c)
    result = dict(sample_size_t=nt, sample_size_c=nc, mean_t=float(t.mean()) if nt else None,
                  mean_c=float(c.mean()) if nc else None, lift=None, lift_ci_lower=None,
                  lift_ci_upper=None, p_value=None, mde=None)
    if not nt or not nc:
        return result
    result["lift"] = float(t.mean()-c.mean())
    if min(nt, nc) < MIN_SAMPLE:
        return result
    if metric_type == "binary":
        if not np.all(np.isin(t, [0, 1])) or not np.all(np.isin(c, [0, 1])):
            raise ValueError("Binary values must be 0 or 1")
        # Conservative difference interval: simultaneous 97.5% exact binomial intervals.
        ti = stats.binomtest(int(t.sum()), nt).proportion_ci(confidence_level=.975)
        ci = stats.binomtest(int(c.sum()), nc).proportion_ci(confidence_level=.975)
        result.update(lift_ci_lower=float(ti.low-ci.high), lift_ci_upper=float(ti.high-ci.low),
                      p_value=float(stats.fisher_exact([[int(t.sum()), nt-int(t.sum())], [int(c.sum()), nc-int(c.sum())]])[1]))
        variance = float(c.mean()*(1-c.mean()))
        if variance > 0:
            result["mde"] = float((stats.norm.ppf(.975)+stats.norm.ppf(.8))*np.sqrt(variance*(1/nt+1/nc)))
    else:
        # Degenerate samples do not support a meaningful nonparametric uncertainty estimate.
        if np.var(t) == 0 and np.var(c) == 0:
            return result
        lift, low, high = bootstrap_ci(t, c)
        result.update(lift=lift, lift_ci_lower=low, lift_ci_upper=high)
        # No fabricated p-value: bootstrap intervals are the reported inferential output.
        result["mde"] = float((stats.norm.ppf(.975)+stats.norm.ppf(.8))*np.sqrt(np.var(t, ddof=1)/nt+np.var(c, ddof=1)/nc))
    return result


def srm_test(variant_counts, allocations=None):
    counts = np.asarray(variant_counts, dtype=float)
    if len(counts) < 2 or counts.sum() == 0:
        return None
    weights = np.asarray(allocations if allocations is not None else np.ones(len(counts)), dtype=float)
    if len(weights) != len(counts) or np.any(weights <= 0):
        return None
    expected = counts.sum()*weights/weights.sum()
    if len(counts) == 2:
        return float(stats.binomtest(int(counts[0]), int(counts.sum()), float(weights[0]/weights.sum())).pvalue)
    if np.any(expected < 5):
        return None
    return float(stats.chisquare(counts, expected).pvalue)
