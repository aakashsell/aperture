"""Aperture background worker: aggregates events, computes stats."""
import os
import time
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
import numpy as np
from stats import compute_experiment_stats

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("worker")

DSN = os.getenv("DATABASE_URL", "postgresql://aperture:aperture@db:5432/aperture")
INTERVAL = int(os.getenv("WORKER_INTERVAL_SECONDS", "30"))


def aggregate_metrics(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT e.id AS experiment_id, m.id AS metric_id,
                   m.event_name, m.metric_type
            FROM experiments e
            JOIN experiment_metrics em ON em.experiment_id = e.id
            JOIN metrics m ON m.id = em.metric_id
            WHERE e.status IN ('running', 'completed')
        """)
        rows = cur.fetchall()

    for row in rows:
        exp_id = row["experiment_id"]
        metric_id = row["metric_id"]
        event_name = row["event_name"]
        metric_type = row["metric_type"]

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT user_id, variant_id, exposed_at
                FROM exposures WHERE experiment_id = %s
            """, (exp_id,))
            users = cur.fetchall()

        for user in users:
            uid = user["user_id"]
            variant_id = user["variant_id"]
            exposed_at = user["exposed_at"]

            with conn.cursor() as cur:
                if metric_type == "binary":
                    cur.execute("""
                        SELECT COUNT(*) FROM events
                        WHERE user_id = %s AND event_name = %s AND timestamp >= %s
                    """, (uid, event_name, exposed_at))
                    val = 1.0 if cur.fetchone()[0] > 0 else 0.0
                elif metric_type == "count":
                    cur.execute("""
                        SELECT COUNT(*) FROM events
                        WHERE user_id = %s AND event_name = %s AND timestamp >= %s
                    """, (uid, event_name, exposed_at))
                    val = float(cur.fetchone()[0] or 0)
                else:
                    cur.execute("""
                        SELECT COALESCE(SUM(value), 0) FROM events
                        WHERE user_id = %s AND event_name = %s AND timestamp >= %s
                    """, (uid, event_name, exposed_at))
                    val = float(cur.fetchone()[0] or 0)

                cur.execute("""
                    INSERT INTO experiment_user_metrics
                        (experiment_id, user_id, variant_id, metric_id, metric_value, updated_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (experiment_id, user_id, metric_id) DO UPDATE SET
                        metric_value = EXCLUDED.metric_value, updated_at = NOW()
                """, (exp_id, uid, variant_id, metric_id, val))
        conn.commit()
    logger.info("Aggregated %d experiment-metric combos", len(rows))


def compute_stats(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT DISTINCT e.id AS experiment_id, m.id AS metric_id, m.metric_type
            FROM experiments e
            JOIN experiment_metrics em ON em.experiment_id = e.id
            JOIN metrics m ON m.id = em.metric_id
            WHERE e.status IN ('running', 'completed')
        """)
        experiments = cur.fetchall()

    for row in experiments:
        exp_id = row["experiment_id"]
        metric_id = row["metric_id"]
        metric_type = row["metric_type"]

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, key, is_control FROM variants WHERE experiment_id = %s", (exp_id,))
            variants = cur.fetchall()

        control_values = None
        variant_data = {}
        for v in variants:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT metric_value FROM experiment_user_metrics
                    WHERE experiment_id = %s AND metric_id = %s AND variant_id = %s
                """, (exp_id, metric_id, v["id"]))
                vals = [r[0] for r in cur.fetchall()]
            arr = np.array(vals, dtype=float)
            variant_data[v["id"]] = arr
            if v["is_control"]:
                control_values = arr

        if control_values is None or len(control_values) == 0:
            continue

        for v in variants:
            treatment = variant_data.get(v["id"], np.array([]))
            if len(treatment) == 0:
                continue
            stats = compute_experiment_stats(treatment, control_values, metric_type)
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO experiment_results
                        (experiment_id, metric_id, variant_id, sample_size, mean,
                         lift, lift_ci_lower, lift_ci_upper, p_value, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (experiment_id, metric_id, variant_id) DO UPDATE SET
                        sample_size = EXCLUDED.sample_size,
                        mean = EXCLUDED.mean,
                        lift = EXCLUDED.lift,
                        lift_ci_lower = EXCLUDED.lift_ci_lower,
                        lift_ci_upper = EXCLUDED.lift_ci_upper,
                        p_value = EXCLUDED.p_value,
                        updated_at = NOW()
                """, (
                    exp_id, metric_id, v["id"], stats["sample_size_t"], stats["mean_t"],
                    stats["lift"], stats["lift_ci_lower"], stats["lift_ci_upper"], stats["p_value"],
                ))
        conn.commit()
    logger.info("Stats computed for %d experiments", len(experiments))


def run():
    while True:
        try:
            conn = psycopg2.connect(DSN)
            aggregate_metrics(conn)
            compute_stats(conn)
            conn.close()
        except Exception as e:
            logger.error("Worker error: %s", e)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    logger.info("Worker starting, interval=%ds", INTERVAL)
    run()
