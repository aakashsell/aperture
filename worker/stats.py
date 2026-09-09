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

    mde = _mde_binary(p_c, n_c)

    return {
        "sample_size_t": n_t, "sample_size_c": n_c,
        "mean_t": float(p_t), "mean_c": float(p_c),
        "lift": float(lift), "lift_ci_lower": float(ci_lower), "lift_ci_upper": float(ci_upper),
        "p_value": float(p_value), "mde": float(mde),
    }


def compute_continuous_metric(treatment, control):
    """Bootstrap CI for continuous metrics."""
    n_t, n_c = len(treatment), len(control)
    if n_t == 0 or n_c == 0:
        return _empty_stats(n_t, n_c)

    lift, ci_lower, ci_upper = bootstrap_ci(treatment, control)
    p_value = 0.05 if (ci_lower > 0 or ci_upper < 0) else 0.5
    std_c = float(np.std(control, ddof=1)) if n_c > 1 else 1.0
    mde = _mde_continuous(std_c, n_c)

    return {
        "sample_size_t": n_t, "sample_size_c": n_c,
        "mean_t": float(np.mean(treatment)), "mean_c": float(np.mean(control)),
        "lift": float(lift), "lift_ci_lower": float(ci_lower), "lift_ci_upper": float(ci_upper),
        "p_value": float(p_value), "mde": float(mde),
    }


def compute_experiment_stats(treatment_values, control_values, metric_type="continuous"):
    """Dispatch to appropriate statistical method."""
    if metric_type == "binary":
        return compute_binary_metric(treatment_values, control_values)
    return compute_continuous_metric(treatment_values, control_values)


def _mde_binary(baseline_rate, n_per_variant, alpha=0.05, power=0.80):
    """Minimum detectable effect for a binary metric (absolute difference)."""
    if baseline_rate <= 0 or baseline_rate >= 1 or n_per_variant < 2:
        return 0.0
    z_alpha = stats.norm.ppf(1 - alpha / 2)
    z_beta = stats.norm.ppf(power)
    pooled_var = 2 * baseline_rate * (1 - baseline_rate)
    return (z_alpha + z_beta) * np.sqrt(pooled_var / n_per_variant)


def _mde_continuous(std_dev, n_per_variant, alpha=0.05, power=0.80):
    """Minimum detectable effect for a continuous metric."""
    if n_per_variant < 2 or std_dev <= 0:
        return 0.0
    z_alpha = stats.norm.ppf(1 - alpha / 2)
    z_beta = stats.norm.ppf(power)
    return (z_alpha + z_beta) * std_dev * np.sqrt(2 / n_per_variant)


def srm_test(variant_counts):
    """Sample Ratio Mismatch chi-square test.

    Returns p-value. p < 0.001 suggests a problem with randomization.
    """
    if len(variant_counts) < 2 or any(c == 0 for c in variant_counts):
        return 1.0
    total = sum(variant_counts)
    expected = total / len(variant_counts)
    chi2 = sum((obs - expected) ** 2 / expected for obs in variant_counts)
    p_value = 1 - stats.chi2.cdf(chi2, df=len(variant_counts) - 1)
    return float(p_value)


def _empty_stats(n_t, n_c):
    return {
        "sample_size_t": n_t, "sample_size_c": n_c,
        "mean_t": 0.0, "mean_c": 0.0,
        "lift": 0.0, "lift_ci_lower": 0.0, "lift_ci_upper": 0.0,
        "p_value": 1.0, "mde": 0.0,
    }
