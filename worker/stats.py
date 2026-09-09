"""Bootstrap-based statistics engine for A/B testing."""
import numpy as np
from scipy import stats

RNG = np.random.default_rng(42)


def bootstrap_ci(treatment, control, n_boot=2000, ci=0.95):
    """Bootstrap confidence interval for difference in means."""
    if len(treatment) == 0 or len(control) == 0:
        return 0.0, 0.0, 0.0

    t_mean, c_mean = np.mean(treatment), np.mean(control)
    lift = t_mean - c_mean

    diffs = []
    for _ in range(n_boot):
        tb = RNG.choice(treatment, size=len(treatment), replace=True)
        cb = RNG.choice(control, size=len(control), replace=True)
        diffs.append(np.mean(tb) - np.mean(cb))

    diffs = np.array(diffs)
    alpha = 1 - ci
    return lift, float(np.percentile(diffs, alpha / 2 * 100)), float(np.percentile(diffs, (1 - alpha / 2) * 100))


def compute_binary_metric(treatment, control):
    """Two-proportion z-test for binary metrics."""
    n_t, n_c = len(treatment), len(control)
    if n_t == 0 or n_c == 0:
        return _empty_stats(n_t, n_c)

    p_t = np.mean(treatment)
    p_c = np.mean(control)
    lift = p_t - p_c

    p_pool = (np.sum(treatment) + np.sum(control)) / (n_t + n_c)
    se = np.sqrt(p_pool * (1 - p_pool) * (1 / n_t + 1 / n_c))
    if se == 0:
        z, p_value = 0.0, 1.0
    else:
        z = (p_t - p_c) / se
        p_value = 2 * (1 - stats.norm.cdf(abs(z)))

    se_ci = np.sqrt(p_t * (1 - p_t) / max(n_t, 1) + p_c * (1 - p_c) / max(n_c, 1))
    ci_lower = lift - 1.96 * se_ci
    ci_upper = lift + 1.96 * se_ci

    return {
        "sample_size_t": n_t, "sample_size_c": n_c,
        "mean_t": float(p_t), "mean_c": float(p_c),
        "lift": float(lift), "lift_ci_lower": float(ci_lower), "lift_ci_upper": float(ci_upper),
        "p_value": float(p_value),
    }


def compute_continuous_metric(treatment, control):
    """Bootstrap CI for continuous metrics."""
    n_t, n_c = len(treatment), len(control)
    if n_t == 0 or n_c == 0:
        return _empty_stats(n_t, n_c)

    lift, ci_lower, ci_upper = bootstrap_ci(treatment, control)
    p_value = 0.05 if (ci_lower > 0 or ci_upper < 0) else 0.5

    return {
        "sample_size_t": n_t, "sample_size_c": n_c,
        "mean_t": float(np.mean(treatment)), "mean_c": float(np.mean(control)),
        "lift": float(lift), "lift_ci_lower": float(ci_lower), "lift_ci_upper": float(ci_upper),
        "p_value": float(p_value),
    }


def compute_experiment_stats(treatment_values, control_values, metric_type="continuous"):
    """Dispatch to appropriate statistical method."""
    if metric_type == "binary":
        return compute_binary_metric(treatment_values, control_values)
    return compute_continuous_metric(treatment_values, control_values)


def _empty_stats(n_t, n_c):
    return {
        "sample_size_t": n_t, "sample_size_c": n_c,
        "mean_t": 0.0, "mean_c": 0.0,
        "lift": 0.0, "lift_ci_lower": 0.0, "lift_ci_upper": 0.0,
        "p_value": 1.0,
    }
