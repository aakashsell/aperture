---
name: aperture-integration
description: Integrate Aperture rollout gates, health reporting, or experiments into an existing app. Use when adding or debugging Aperture instrumentation; do not use for unrelated feature work.
---

# Integrate Aperture

Use Aperture as the application's release and measurement layer. In the Aperture checkout, follow [`docs/AGENT_INTEGRATION.md`](../../docs/AGENT_INTEGRATION.md) and consult [`docs/TELEMETRY_GUIDE.md`](../../docs/TELEMETRY_GUIDE.md) for event and health details. Those guides are the maintained reference—do not copy their API catalog into this skill.

Before changing code, inspect the app's framework, existing fallback behavior, and installed Aperture SDK version. Use only APIs available in that SDK version and documented by its matching README/types. If this skill is copied into another repository, read the current [Aperture integration guide](https://github.com/aakashsell/aperture/blob/main/docs/AGENT_INTEGRATION.md) and [telemetry guide](https://github.com/aakashsell/aperture/blob/main/docs/TELEMETRY_GUIDE.md) as well. If current docs and installed SDK disagree, do not guess: explain the mismatch and use only the installed SDK's supported API.

## Integration rules

- Preserve the existing behavior as the safe fallback when gate evaluation fails.
- Record rollout exposure only after the application has committed to the selected path. For experiments, expose only the variant actually rendered, and track a conversion only when it happens.
- Use `reportGateHealth()` for failures attributable to an evaluated and exposed gate. Use `reportCrash()` or `captureException()` for exceptions without a reliable gate attribution; scrub sensitive data.
- Do not invent assignment, exposure, or event calls, or create dashboard resources through a publishable key.
- Do not start or widen a live rollout or experiment. Leave activation and traffic changes for the human to review in the dashboard.

After implementation, run the app's relevant checks and report changed files, fallback behavior, signal placement, checks run, and any manual dashboard steps. Show the proposed integration before asking the human to start traffic.

## Keep this skill current

This skill is versioned with Aperture. When copied into an application repository, it does not update itself; re-read the linked integration guide for each new integration and refresh the copied skill when upgrading Aperture. For reproducible work, pin the skill and SDK to the same Aperture release once release tags are available.
