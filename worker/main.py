"""Aperture background worker: aggregates events, computes stats."""
import os
import time
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
import numpy as np
from stats import compute_experiment_stats, srm_test

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worker")

DSN = os.getenv("DATABASE_URL", "postgresql://aperture:aperture@db:5432/aperture")
INTERVAL = int(os.getenv("WORKER_INTERVAL_SECONDS", "30"))


def aggregate_metrics(conn):
    # One project-scoped set operation; recompute only cohorts whose windows remain open.
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO experiment_user_metrics
                (experiment_id, user_id, variant_id, metric_id, metric_value, updated_at)
            SELECT e.id, x.user_id, x.variant_id, m.id,
                CASE m.metric_type WHEN 'binary' THEN CASE WHEN count(ev.id)>0 THEN 1 ELSE 0 END
                     WHEN 'count' THEN count(ev.id) ELSE COALESCE(sum(ev.value),0) END, NOW()
            FROM experiments e
            JOIN experiment_metrics em ON em.experiment_id=e.id
            JOIN metrics m ON m.id=em.metric_id AND m.project_id=e.project_id
            JOIN exposures x ON x.experiment_id=e.id
            LEFT JOIN experiment_user_metrics old ON old.experiment_id=e.id AND old.user_id=x.user_id AND old.metric_id=m.id
            LEFT JOIN events ev ON ev.project_id=e.project_id AND ev.user_id=x.user_id
                AND ev.event_name=m.event_name AND ev.timestamp>=x.exposed_at
                AND ev.timestamp<LEAST(x.exposed_at+make_interval(days=>e.attribution_days),COALESCE(e.completed_at,'infinity'::timestamptz))
            WHERE e.status IN ('running','paused','completed')
                AND (old.id IS NULL OR old.updated_at < LEAST(x.exposed_at+make_interval(days=>e.attribution_days),COALESCE(e.completed_at,'infinity'::timestamptz))+interval '24 hours')
            GROUP BY e.id,x.user_id,x.variant_id,m.id
            ON CONFLICT (experiment_id,user_id,metric_id) DO UPDATE SET
                metric_value=EXCLUDED.metric_value,updated_at=NOW()
        """)
    conn.commit()


def compute_stats(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT DISTINCT e.id AS experiment_id, m.id AS metric_id, m.metric_type
            FROM experiments e
            JOIN experiment_metrics em ON em.experiment_id = e.id
            JOIN metrics m ON m.id = em.metric_id
            WHERE e.status IN ('running', 'paused', 'completed')
        """)
        experiments = cur.fetchall()

    for row in experiments:
        exp_id = row["experiment_id"]
        metric_id = row["metric_id"]
        metric_type = row["metric_type"]

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, key, is_control, allocation FROM variants WHERE experiment_id = %s", (exp_id,))
            variants = cur.fetchall()

        control_values = None
        variant_data = {}
        variant_counts = []
        for v in variants:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT metric_value FROM experiment_user_metrics
                    WHERE experiment_id = %s AND metric_id = %s AND variant_id = %s
                """, (exp_id, metric_id, v["id"]))
                vals = [r[0] for r in cur.fetchall()]
            arr = np.array(vals, dtype=float)
            variant_data[v["id"]] = arr
            variant_counts.append(len(arr))
            if v["is_control"]:
                control_values = arr

        if control_values is None:
            continue

        # Compute SRM once per experiment using current metric's exposure counts
        with conn.cursor() as cur:
            cur.execute("SELECT v.id,count(a.id) FROM variants v LEFT JOIN assignments a ON a.variant_id=v.id WHERE v.experiment_id=%s GROUP BY v.id", (exp_id,))
            assignment_counts = dict(cur.fetchall())
        srm_p = srm_test([assignment_counts[v["id"]] for v in variants], [v["allocation"] for v in variants])
        with conn.cursor() as cur:
            cur.execute("UPDATE experiments SET srm_p_value = %s WHERE id = %s", (srm_p, exp_id))

        for v in variants:
            treatment = variant_data.get(v["id"], np.array([]))
            if len(treatment) == 0:
                continue
            stats = compute_experiment_stats(treatment, control_values, metric_type)
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO experiment_results
                        (experiment_id, metric_id, variant_id, sample_size, mean,
                         lift, lift_ci_lower, lift_ci_upper, p_value, mde, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (experiment_id, metric_id, variant_id) DO UPDATE SET
                        sample_size = EXCLUDED.sample_size,
                        mean = EXCLUDED.mean,
                        lift = EXCLUDED.lift,
                        lift_ci_lower = EXCLUDED.lift_ci_lower,
                        lift_ci_upper = EXCLUDED.lift_ci_upper,
                        p_value = EXCLUDED.p_value,
                        mde = EXCLUDED.mde,
                        updated_at = NOW()
                """, (
                    exp_id, metric_id, v["id"], stats["sample_size_t"], stats["mean_t"],
                    stats["lift"], stats["lift_ci_lower"], stats["lift_ci_upper"],
                    stats["p_value"], stats["mde"],
                ))
        conn.commit()
    logger.info("Stats computed for %d experiments", len(experiments))


def run_once():
    conn = psycopg2.connect(DSN)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_try_advisory_lock(724819)")
            if not cur.fetchone()[0]:
                return
            cur.execute("SET statement_timeout = '60s'")
        aggregate_metrics(conn)
        compute_stats(conn)
        with conn.cursor() as cur:
            cur.execute("INSERT INTO worker_health VALUES(1,NOW()) ON CONFLICT(id) DO UPDATE SET updated_at=EXCLUDED.updated_at")
        conn.commit()
    finally:
        conn.close()


def run():
    while True:
        try:
            run_once()
        except Exception:
            logger.exception("Worker cycle failed")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    run()
