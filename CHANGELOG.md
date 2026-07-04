# Changelog

## 2026-07-04

- Resumed Phase 1.
- Verified local `/api/gacha/boatrace` startup behavior.
- Confirmed local `DATABASE_URL` is not configured.
- Confirmed `schedule` and `predict` return `503` without `DATABASE_URL`.
- Confirmed `/gacha` returns HTTP 200 locally.
- Confirmed `/gacha` has no React console errors in browser verification.
- Confirmed `/gacha` has no horizontal overflow on desktop or mobile.
- Real DB verification is blocked until `DATABASE_URL` is configured.
- Added project memory files: `PROJECT.md`, `ROADMAP.md`, `TODO.md`, `CHANGELOG.md`, `AGENTS.md`.
- Added required workflow rules to `AGENTS.md`.
- Added `DECISIONS.md` for design decision records.
- Added `RELEASE.md` for release readiness tracking.
- Rewrote project memory files in ASCII English to avoid Windows PowerShell encoding issues.
- Added `RUNBOOK.md` for local startup, Render, Neon, release, and incident procedures.
- Updated project memory to prioritize 3-model ensemble restoration before v1.0 release.
- Moved realtime prediction API ahead of Gacha product APIs in the roadmap.
- Restored LightGBM, XGBoost, and RandomForest model files into `models/`.
- Replaced `models/model_meta.json` with the matching v2 deploy-work metadata.
- Updated `.gitignore` so `models/*.pkl` can be tracked for v1.0.
- Updated Render build to install Python dependencies from `scripts/requirements.txt`.
- Fixed model metadata read/write to use UTF-8 explicitly for Windows compatibility.
- Verified local AI ensemble smoke test returns `modelUsed: Ensemble`, 6 `honsen`, 3 `aname`, and 6 win probabilities using mocked race entries.
- Noted model pickle compatibility warnings from XGBoost and scikit-learn version differences during local smoke test.
- Added Render AI ensemble verification steps to `RUNBOOK.md`.
- Added v1.0.0 release tag preparation notes and explicit tag rule.
