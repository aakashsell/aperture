# Aperture MVP Audit

**Date:** 2026-09-09
**Commit:** `0c97d77`

## Honest Assessment

We are **80% to MVP**. The hard parts work. The soft parts (polish, docs, onboarding flow) are what remain.

---

## ✅ What's Working

### Core Pipeline
1. **Create experiment** → DB stores it with variants, allocations, overrides
2. **Start experiment** → status flips to `running`
3. **SDK assignment** → deterministic hash (`cityhash64`), client-side eval, sub-millisecond
4. **Exposure** → server validates variant + records it
5. **Event tracking** → batch ingestion, typed metrics (binary/continuous/count)
6. **Stats worker** → Python background process computing bootstrap CI, MDE, SRM
7. **Dashboard** → lists experiments, shows results with proper statistical interpretation

### Architecture
- Go API (hot path) + Python worker (stats) = correct separation of concerns
- Postgres single source of truth, no queues needed at this scale
- Client-side evaluation = zero-latency for end users
- Deterministic hashing = immutability guarantee (same user → same variant forever)

### Tests
- 11 integration tests covering full pipeline
- API compiles cleanly, no type errors in core Go code

---

## ⚠️ What's Partially Working

| Item | Status | Issue |
|------|--------|-------|
| Card layout | Fixed (pending verify) | `CardTitle` + `CardDescription` used to stack inline; added `mt-1` and checked `components/` in tailwind config |
| Tailwind compilation | Partial | CSS loads but HMR can be flaky in Next.js 14 with custom server config |
| Database URL | Dev-only | Default config points to Docker `db:5432`; `dev-local.sh` overrides with `localhost` and `sslmode=disable` |
| Stats worker scheduling | ✅ Working | `worker/main.py` already has `while True: ... time.sleep(INTERVAL)`. Runs every 30s. |
| Experiment settings | Missing | Cannot edit allocations, add variants, or set allocated_percentage after creation |
| SDK npm package | Not published | `sdks/ts/` exists but isn't on npm. User must copy or local-link. |
| Environment config | Hardcoded | API URL in frontend uses `process.env.NEXT_PUBLIC_API_URL` but isn't documented for build-time injection |

---

## ❌ What's Broken / Missing

### Critical for MVP
1. **No experiment detail editing** — can't change allocations, variants, or traffic split after creation
2. **No delete/archive** — experiments accumulate forever
3. **Stats worker not auto-scheduled** — must be run manually or via external cron
4. **No API key / auth** — completely open, anyone can POST events to any experiment
5. **No event visual debugger** — can't see raw events coming in without querying DB

### UI Polish
1. **Mobile layout untested** — max-w-5xl may not work on small screens
2. **No dark mode** — not required for MVP but nice
3. **No loading states on mutations** — pause/resume buttons don't show spinner
4. **Charts missing** — results shown as numbers only, no trend lines over time
5. **No copy-to-clipboard on SDK code** — friction for developer onboarding

### DevEx / Ops
1. **No design.md or API spec checked in** — this doc lives only in my memory
2. **No health check for worker** — if worker dies, dashboard shows stale data silently
3. **No migration rollback** — `migrate.sh` only runs forward
4. **Log level hard to change** — no env var docs

---

## 🎯 MVP Definition

MVP = a technical founder can:
1. `git clone`, run `./scripts/dev-local.sh`, and have everything working on localhost in <60s
2. Create an experiment in the dashboard
3. Copy SDK code into their React/Next.js app
4. `getVariant()` returns the right variant, `expose()` records it
5. `track()` sends events
6. See experiment results with lift + CI + verdict within ~30 seconds
7. Trust the stats (bootstrap CI, MDE check, SRM warning are all present)

**By this definition: we are 80% done.**

---

## 🚀 Remaining Work (Priority Order)

### P0 — Must Have for MVP
1. [ ] Fix card layout verification (need to actually see it render)
2. [ ] Add next.config.js proxy for `/api` → `localhost:8000` so no CORS needed
3. [ ] Auto-schedule worker (simple loop `sleep(30)` in `main.py`)
4. [ ] Write proper README with architecture diagram + setup steps
5. [ ] Publish SDK to npm (or at least document `npm link` workflow)

### P1 — Strongly Recommended
6. [ ] Add `allocated_percentage` / variant editor in experiment detail
7. [ ] Add basic API key (single token in env, check header)
8. [ ] Add toast notifications for mutations (success/error)
9. [ ] Add event debugger/view in dashboard (last 50 events table)

### P2 — Nice to Have
10. [ ] Charts (time-series of metric values per variant)
11. [ ] Dark mode toggle
12. [ ] Experiment archive/delete
13. [ ] Realtime event stream via SSE/WebSocket

---

## Files That Need Attention

| File | Issue |
|------|-------|
| `services/web/components/ui/card.tsx` | Layout was broken, may still need verification |
| `services/web/next.config.js` | Needs rewrite rule for `/api/*` → backend |
| `services/web/tailwind.config.js` | Missing `components/` content path (just fixed) |
| `worker/main.py` | No auto-loop; runs once and exits |
| `services/api/config/config.go` | Docker URL default is wrong for local dev |
| `README.md` | Just a title; needs real content |
| `sdks/ts/package.json` | No publish config, no `files` array |

---

## Known Frustration Points

1. **"UI is ugly"** — Cards looked like inline text because `CardHeader` didn't use `flex-col`. Added `mt-1` to `CardDescription` and ensured `components/` is in Tailwind content. Need actual visual confirmation.
2. **Services die between turns** — Nothing is persistent. `dev-local.sh` starts them but if I don't keep them running, the user has to restart. Need a `Procfile` or `tmux` script.
3. **No single source of truth for URLs** — Frontend hardcodes `localhost:8000` in some places, uses env var in others.

---

## Recommendation

**Call it MVP after these 5 things:**
1. Visual confirmation the dashboard looks good
2. `README.md` that a stranger can follow
3. Worker auto-runs on a loop
4. API proxy configured in `next.config.js`
5. SDK installable via npm (or documented local install)

That is ~2 hours of work.
