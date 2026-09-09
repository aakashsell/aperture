"""Aperture end-to-end integration tests.

Tests the complete assignment -> exposure -> event -> result pipeline.
"""
import os
import sys
import time
import uuid
import random
import requests
import psycopg2
from psycopg2.extras import RealDictCursor

API_URL = os.getenv("API_URL", "http://localhost:8000")
DB_URL = os.getenv("DATABASE_URL", "postgresql://aperture:aperture@db:5432/aperture")


def api(method: str, path: str, **kwargs):
    url = f"{API_URL}{path}"
    r = requests.request(method, url, **kwargs)
    return r


def db_query(sql, params=()):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(sql, params)
    rows = cur.fetchall() if cur.description else []
    conn.commit()
    cur.close()
    conn.close()
    return rows


def db_exec(sql, params=()):
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    cur.execute(sql, params)
    conn.commit()
    cur.close()
    conn.close()


def reset():
    """Clean slate for tests."""
    db_exec("DELETE FROM experiment_results")
    db_exec("DELETE FROM experiment_user_metrics")
    db_exec("DELETE FROM events")
    db_exec("DELETE FROM exposures")
    db_exec("DELETE FROM assignments")
    db_exec("DELETE FROM overrides")
    db_exec("DELETE FROM experiment_metrics")
    db_exec("DELETE FROM metrics")
    db_exec("DELETE FROM variants")
    db_exec("DELETE FROM experiments")


def test_create_experiment():
    r = api("POST", "/experiments", json={
        "key": "test_checkout",
        "name": "Test Checkout",
        "variants": [
            {"key": "control", "name": "Control", "allocation": 50, "is_control": True},
            {"key": "treatment", "name": "Treatment", "allocation": 50},
        ],
        "activation_event": "checkout_view",
        "allocated_percentage": 100,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["key"] == "test_checkout"
    assert data["status"] == "draft"
    return data["id"]


def test_assignment_determinism(exp_key="test_checkout"):
    """Same user always gets the same variant."""
    user = f"user_{uuid.uuid4().hex[:8]}"
    r1 = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})
    r2 = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})
    assert r1.json()["variant"] == r2.json()["variant"]
    assert r1.json()["assigned"] == True


def test_assignment_immutability(exp_key="test_checkout"):
    """Assignment is persisted and never changes."""
    user = f"user_{uuid.uuid4().hex[:8]}"
    r1 = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})
    variant1 = r1.json()["variant"]

    # Direct DB check: only one assignment row
    rows = db_query(
        "SELECT variant_id FROM assignments WHERE user_id = %s",
        (user,)
    )
    assert len(rows) == 1

    # Re-assign 10 more times
    for _ in range(10):
        r = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})
        assert r.json()["variant"] == variant1


def test_exclusion(exp_key="test_checkout"):
    """Excluded users get no variant."""
    user = f"excluded_{uuid.uuid4().hex[:8]}"

    # First assign normally
    r1 = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})
    assert r1.json()["assigned"] == True
    variant_before = r1.json()["variant"]

    # Exclude via DB (simulating override UI)
    exp_rows = db_query("SELECT id FROM experiments WHERE key = %s", (exp_key,))
    exp_id = exp_rows[0]["id"]
    db_exec(
        "INSERT INTO overrides (experiment_id, user_id, excluded) VALUES (%s, %s, true)",
        (exp_id, user)
    )

    # Now assignment returns null
    r2 = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})
    assert r2.json()["variant"] is None
    assert r2.json()["assigned"] == False

    # But the original assignment row still exists (immutable history)
    rows = db_query(
        "SELECT variant_id FROM assignments WHERE experiment_id = %s AND user_id = %s",
        (exp_id, user)
    )
    assert len(rows) == 1  # original assignment still there


def test_override_forces_variant(exp_key="test_checkout"):
    """Override can force a specific variant."""
    user = f"forced_{uuid.uuid4().hex[:8]}"
    exp_rows = db_query("SELECT id FROM experiments WHERE key = %s", (exp_key,))
    exp_id = exp_rows[0]["id"]
    variant_rows = db_query("SELECT id FROM variants WHERE experiment_id = %s AND key = 'control'", (exp_id,))
    control_id = variant_rows[0]["id"]

    db_exec(
        "INSERT INTO overrides (experiment_id, user_id, variant_id, excluded) VALUES (%s, %s, %s, false)",
        (exp_id, user, control_id)
    )

    r = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})
    assert r.json()["variant"] == "control"


def test_assignment_not_equal_exposure(exp_key="test_checkout"):
    """Assigned users are not automatically exposed."""
    user = f"unexposed_{uuid.uuid4().hex[:8]}"
    api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})

    # Exposure check: no exposure row
    exp_rows = db_query("SELECT id FROM experiments WHERE key = %s", (exp_key,))
    exp_id = exp_rows[0]["id"]
    rows = db_query(
        "SELECT * FROM exposures WHERE experiment_id = %s AND user_id = %s",
        (exp_id, user)
    )
    assert len(rows) == 0

    # Explicit exposure creates the row
    r = api("POST", f"/experiments/{exp_key}/expose", json={"user_id": user})
    assert r.json()["exposed"] == True

    rows = db_query(
        "SELECT * FROM exposures WHERE experiment_id = %s AND user_id = %s",
        (exp_id, user)
    )
    assert len(rows) == 1


def test_exposure_idempotent(exp_key="test_checkout"):
    """Multiple exposures are idempotent."""
    user = f"idempotent_{uuid.uuid4().hex[:8]}"
    api("POST", f"/experiments/{exp_key}/expose", json={"user_id": user})
    api("POST", f"/experiments/{exp_key}/expose", json={"user_id": user})
    api("POST", f"/experiments/{exp_key}/expose", json={"user_id": user})

    exp_rows = db_query("SELECT id FROM experiments WHERE key = %s", (exp_key,))
    exp_id = exp_rows[0]["id"]
    rows = db_query(
        "SELECT * FROM exposures WHERE experiment_id = %s AND user_id = %s",
        (exp_id, user)
    )
    assert len(rows) == 1


def test_experiment_pause(exp_key="test_checkout"):
    """Paused experiments return no new assignments."""
    user_paused = f"paused_{uuid.uuid4().hex[:8]}"

    # Pause
    r = api("POST", f"/experiments/{exp_key}/pause")
    assert r.json()["status"] == "paused"

    # New user gets no assignment
    r = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user_paused})
    assert r.json()["assigned"] == False

    # Previously assigned user still gets their variant
    user_assigned = f"assigned_before_{uuid.uuid4().hex[:8]}"
    api("POST", f"/experiments/{exp_key}/start")  # start to assign
    r1 = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user_assigned})
    assigned_variant = r1.json()["variant"]

    api("POST", f"/experiments/{exp_key}/pause")
    r2 = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user_assigned})
    assert r2.json()["variant"] == assigned_variant

    # Resume
    api("POST", f"/experiments/{exp_key}/start")


def test_rollout_does_not_change_assignments(exp_key="test_checkout"):
    """Changing allocation does not mutate existing assignments."""
    user = f"rollout_{uuid.uuid4().hex[:8]}"
    api("POST", f"/experiments/{exp_key}/start")
    r1 = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})
    original_variant = r1.json()["variant"]

    # Change allocation in DB (simulate rollout to 100% treatment)
    exp_rows = db_query("SELECT id FROM experiments WHERE key = %s", (exp_key,))
    exp_id = exp_rows[0]["id"]
    db_exec("UPDATE variants SET allocation = 0 WHERE experiment_id = %s AND is_control = true", (exp_id,))
    db_exec("UPDATE variants SET allocation = 100 WHERE experiment_id = %s AND is_control = false", (exp_id,))

    # Same user still gets their original variant
    r2 = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})
    assert r2.json()["variant"] == original_variant


def test_event_idempotency():
    """Duplicate event_ids are silently deduplicated."""
    event_id = f"evt_{uuid.uuid4().hex}"
    user = f"event_user_{uuid.uuid4().hex[:8]}"

    r1 = api("POST", "/events/track", json={
        "event_id": event_id,
        "user_id": user,
        "event_name": "purchase",
        "value": 49.99,
    })
    assert r1.json()["ingested"] == True

    r2 = api("POST", "/events/track", json={
        "event_id": event_id,
        "user_id": user,
        "event_name": "purchase",
        "value": 49.99,
    })
    assert r2.json()["ingested"] == True  # request succeeds, but row not duplicated

    rows = db_query("SELECT * FROM events WHERE event_id = %s", (event_id,))
    assert len(rows) == 1


def test_full_pipeline_with_stats(exp_key="test_checkout"):
    """End-to-end: assign, expose, track, aggregate, stats."""
    # Reset and set up
    reset()
    api("POST", "/experiments", json={
        "key": exp_key,
        "name": "Test Checkout",
        "variants": [
            {"key": "control", "name": "Control", "allocation": 50, "is_control": True},
            {"key": "treatment", "name": "Treatment", "allocation": 50},
        ],
        "activation_event": "checkout_view",
        "allocated_percentage": 100,
    })

    # Create and link metric
    r = api("POST", "/metrics", json={
        "name": "Purchase Rate",
        "event_name": "purchase",
        "metric_type": "binary",
    })
    metric_id = r.json()["id"]
    api("POST", f"/experiments/{exp_key}/metrics", json={
        "metric_id": metric_id,
        "is_primary": True,
    })

    # Start experiment
    api("POST", f"/experiments/{exp_key}/start")

    # Generate 100 users: assign, expose, track events
    random.seed(42)
    for i in range(100):
        user = f"pipeline_user_{i:03d}"
        r = api("POST", f"/experiments/{exp_key}/assign", json={"user_id": user})
        variant = r.json()["variant"]

        # Only expose 80% (simulating not all assigned users reach the feature)
        if random.random() < 0.8:
            api("POST", f"/experiments/{exp_key}/expose", json={"user_id": user})

            # Track purchase for exposed users
            # Treatment has 15% purchase rate, control has 10%
            if variant == "treatment":
                purchased = random.random() < 0.15
            else:
                purchased = random.random() < 0.10

            api("POST", "/events/track", json={
                "event_id": f"evt_{user}",
                "user_id": user,
                "event_name": "purchase",
                "value": 1.0 if purchased else 0.0,
            })

    # Run worker logic inline (or wait for background worker)
    sys.path.insert(0, "/worker")
    from main import aggregate_metrics, compute_stats
    import psycopg2
    conn = psycopg2.connect(DB_URL)
    aggregate_metrics(conn)
    compute_stats(conn)
    conn.close()

    # Verify results exist
    results = db_query("SELECT * FROM experiment_results")
    assert len(results) > 0, "No results computed"

    # Verify treatment has higher mean than control
    exp_rows = db_query("SELECT id FROM experiments WHERE key = %s", (exp_key,))
    exp_id = exp_rows[0]["id"]
    control_result = db_query(
        "SELECT mean, mde FROM experiment_results WHERE experiment_id = %s AND metric_id = %s AND variant_id IN (SELECT id FROM variants WHERE experiment_id = %s AND is_control = true)",
        (exp_id, metric_id, exp_id)
    )
    treatment_result = db_query(
        "SELECT mean FROM experiment_results WHERE experiment_id = %s AND metric_id = %s AND variant_id IN (SELECT id FROM variants WHERE experiment_id = %s AND is_control = false)",
        (exp_id, metric_id, exp_id)
    )

    assert len(control_result) == 1
    assert len(treatment_result) == 1
    # Treatment should have higher mean (probabilistically true with our seed)
    assert treatment_result[0]["mean"] > control_result[0]["mean"]

    # MDE should be computed
    assert control_result[0]["mde"] is not None
    assert control_result[0]["mde"] > 0

    # SRM should be computed (no mismatch expected with hash-based assignment)
    exp_row = db_query("SELECT srm_p_value FROM experiments WHERE id = %s", (exp_id,))
    assert exp_row[0]["srm_p_value"] is not None
    assert exp_row[0]["srm_p_value"] > 0.001  # no SRM detected

    # Dashboard should return results
    r = api("GET", f"/results/{exp_key}")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "running"
    assert len(data["metrics"]) == 1
    assert data["metrics"][0]["metric_name"] == "Purchase Rate"
    assert data["srm_p_value"] is not None


def main():
    print("=" * 60)
    print("Aperture Integration Tests")
    print("=" * 60)

    # Wait for API to be ready
    for _ in range(30):
        try:
            r = requests.get(f"{API_URL}/health", timeout=1)
            if r.status_code == 200:
                break
        except requests.exceptions.ConnectionError:
            pass
        time.sleep(1)
    else:
        print("ERROR: API did not become healthy")
        sys.exit(1)

    tests = [
        ("create_experiment", test_create_experiment),
        ("assignment_determinism", test_assignment_determinism),
        ("assignment_immutability", test_assignment_immutability),
        ("exclusion", test_exclusion),
        ("override_forces_variant", test_override_forces_variant),
        ("assignment_not_equal_exposure", test_assignment_not_equal_exposure),
        ("exposure_idempotent", test_exposure_idempotent),
        ("experiment_pause", test_experiment_pause),
        ("rollout_does_not_change_assignments", test_rollout_does_not_change_assignments),
        ("event_idempotency", test_event_idempotency),
        ("full_pipeline_with_stats", test_full_pipeline_with_stats),
    ]

    passed = 0
    failed = 0

    for name, fn in tests:
        try:
            fn()
            print(f"  ✓ {name}")
            passed += 1
        except Exception as e:
            print(f"  ✗ {name}: {e}")
            failed += 1

    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
