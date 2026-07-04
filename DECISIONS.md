# Decisions

Record design decisions and reasons only. Put work logs in `CHANGELOG.md`.

## 2026-07-04

### Add project memory files

Decision:

- Add `PROJECT.md`, `ROADMAP.md`, `TODO.md`, `CHANGELOG.md`, `AGENTS.md`, `DECISIONS.md`, and `RELEASE.md`.

Reason:

- Stop relying on long copied context for every session.
- Let Codex continue from repository memory.
- Separate project overview, roadmap, current work, history, design decisions, agent rules, and release readiness.

### Commit and push require explicit instruction

Decision:

- Codex does not commit unless explicitly instructed.
- Codex does not push unless explicitly instructed.

Reason:

- Avoid locking unfinished Phase work into history.
- Let the user decide the correct checkpoint after DB and production verification.

### Phase 1 requires real DB verification

Decision:

- Local `DATABASE_URL` missing behavior is not enough to complete Phase 1.
- `schedule`, `predict`, and `/gacha` must be verified against real DB data.

Reason:

- The value of Gacha read API is reading real Neon data.
- `clientId=001`, zero-row handling, and response time must be verified with real DB behavior.

### Move prediction reads from Base44 boatrace function to Render + Neon

Decision:

- `/gacha` reads predictions from `/api/gacha/boatrace` instead of the Base44 boatrace function.

Reason:

- Unify data source and API operations around Render + Neon.
- Keep Phase 2 User API / Draw API / Checkout API on the same backend.

### Track release readiness in RELEASE.md

Decision:

- Release readiness, production checks, and release records live in `RELEASE.md`.

Reason:

- Keep `TODO.md` focused on current work.
- Keep `CHANGELOG.md` focused on completed work.
- Keep `DECISIONS.md` focused on why decisions were made.

### Keep project memory files ASCII

Decision:

- Project memory files should stay ASCII English unless the user explicitly asks otherwise.

Reason:

- Windows PowerShell default reads can show UTF-8 Japanese as mojibake.
- Codex must be able to read memory files reliably through shell tools.

### Add RUNBOOK.md for operations

Decision:

- Add `RUNBOOK.md` for startup, Render, Neon, release, and incident procedures.

Reason:

- Operational steps should not be mixed into `TODO.md` or `CHANGELOG.md`.
- Future recovery should be possible without reconstructing deployment and verification steps from memory.

### Restore 3-model ensemble before v1.0 release

Decision:

- Add 3-model restoration and AI ensemble mode verification to the v1.0 release criteria.
- Move realtime prediction API ahead of Gacha product APIs in the roadmap.

Reason:

- Betako's core product value is AI-powered boatrace prediction.
- The LightGBM, XGBoost, and RandomForest model files still exist under `betako_deploy_work/betako_deploy/models`.
- Current `boatrace-ai-repo` can fall back to heuristic mode when model files are missing.
- Releasing v1.0 should verify that `predict.py` runs with the restored AI ensemble, not only the heuristic fallback.

### Commit model artifacts for v1.0

Decision:

- Store `models/lgbm_model.pkl`, `models/xgb_model.pkl`, and `models/rf_model.pkl` in Git for v1.0.
- Keep the model files directly under `models/` so the current `predict.py` can load them without code changes.
- Revisit external model storage in v2 or later if model size or update frequency grows.

Reason:

- The largest model is about 6.7 MB, which is practical for this repository.
- Betako is currently a personal project and Render should deploy with AI mode available immediately.
- External storage would add operational complexity before v1.0.

### Prepare v1.0.0 release tag

Decision:

- Prepare to tag the first production release as `v1.0.0`.
- Create the tag only after all v1.0 production checks pass and the user explicitly instructs it.

Reason:

- A release tag makes the first AI-powered Betako production baseline easy to find.
- Future releases can then track `v1.1` realtime prediction API, `v1.2` product APIs, and later model updates clearly.
