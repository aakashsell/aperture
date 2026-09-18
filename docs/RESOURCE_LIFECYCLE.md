# Archive and delete rollouts and experiments

Aperture supports two different cleanup actions:

- **Archive** hides an item from the active workspace and stops new treatment/assignment. Its history is retained.
- **Delete permanently** removes the resource and its resource-owned records. This cannot be undone. The dashboard requires typing the exact key before deletion.

## Rollouts

Archive a rollout from its detail page. Archiving moves it to the terminal `archived` state and evaluation returns disabled. It no longer appears in the active rollout list. Reopen the existing detail URL if you need to permanently delete an archived rollout.

Delete is available only when the rollout is off or archived. A running rollout must be turned off or archived first. Permanent deletion removes gate decisions, exposures, gate health events, support overrides, override audit entries, release history, and gate-linked crash records. Channel definitions and channel membership remain, so other gates using those channels are unaffected.

## Experiments

Archive any experiment from its detail page. It disappears from the active experiment list, and Aperture stops returning assignments for it. Existing assignments, exposures, events, variants, and results remain stored for historical reference.

Permanent deletion is available for draft, paused, completed, or archived experiments. Running experiments must be paused or archived first. Type the experiment key to confirm. Deletion removes the experiment's assignments, exposures, variants, linked metric associations, overrides, user aggregates, and calculated results. Project-level raw events and reusable metric definitions remain.

## API behavior

All lifecycle routes require a dashboard session and are scoped to the signed-in project. SDK publishable keys cannot archive or delete resources.

| Resource   | Archive                                                     | Permanent delete                            |
| ---------- | ----------------------------------------------------------- | ------------------------------------------- |
| Gate       | `POST /gates/:key/archive` with the expected config version | `DELETE /gates/:key` when off or archived   |
| Experiment | `POST /experiments/:key/archive`                            | `DELETE /experiments/:key` when not running |

Use archive when you may need the data later. Use permanent delete only when you intend to remove the resource-owned history as well as the active UI entry.
