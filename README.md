# Aperture

**Open-source experimentation for startups.**

Aperture is a fast, lightweight A/B testing platform built for startups that want to run experiments without a data team. It separates assignment, exposure, and outcomes cleanly — so your numbers actually mean something.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Assign     │────▶│   Expose     │────▶│   Measure    │
│ (immutable)  │     │ (explicit)   │     │ (bootstrap)  │
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## Quick Start

```bash
git clone https://github.com/your-org/aperture.git
cd aperture
make dev
```

Then open http://localhost:3000.

---

## Philosophy

- **Assignment ≠ Exposure ≠ Outcome** — stats you can trust
- **Bring your own events** — integrate with PostHog, Segment, or send directly
- **Bootstrap everything** — no normality assumptions, works with real revenue data
- **Immutable assignments** — users never switch variants mid-experiment
- **Supabase-native** — runs beautifully on any Postgres, exceptional on Supabase

---

## Architecture

| Service | Language | Role |
|---------|----------|------|
| `services/api` | Go | Assignment, exposure, ingestion |
| `services/web` | Next.js | Dashboard |
| `worker` | Python | Aggregation, bootstrap stats |
| `sdks/ts` | TypeScript | Browser + Node SDK |

---

## SDK

```typescript
import { Aperture } from "@aperture/sdk";

const ap = new Aperture({ apiUrl: "http://localhost:8000" });

const variant = await ap.getVariant("checkout_v2", user.id);
if (variant === "treatment") renderNewCheckout();
ap.expose("checkout_v2", user.id);

// later...
ap.track(uuid(), user.id, "purchase", 49.99);
```

---

## Status

Early development. APIs will change.

## License

MIT
