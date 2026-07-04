# Runbook

Operational procedures for Betako. Do not put secrets in this file.

## Local Startup

Install dependencies:

```text
npm install
```

Run development server on Windows PowerShell:

```text
npm.cmd run dev
```

Run checks:

```text
npm.cmd run check
npm.cmd test
```

If `npm.ps1` fails because of PowerShell execution policy, use `npm.cmd`.

## Local Environment

`DATABASE_URL` is required for real DB verification.

Use a local `.env` only when needed. Do not commit `.env`.

Expected env vars:

- `DATABASE_URL`
- `JWT_SECRET`
- `VITE_APP_ID`
- `OWNER_OPEN_ID`
- `CLIENT_ID` optional, defaults to `001`

## Render

Service:

```text
boatrace-ai
```

Config file:

```text
render.yaml
```

Build command:

```text
npm install -g pnpm && pnpm install --no-frozen-lockfile && pip3 install -r scripts/requirements.txt && pnpm build
```

Start command:

```text
pnpm start
```

Env vars are configured in the Render dashboard. Do not store secret values in the repository.

Required Render env vars:

- `DATABASE_URL`
- `JWT_SECRET`
- `VITE_APP_ID`
- `OWNER_OPEN_ID`

## AI Model Artifacts

For v1.0, trained model artifacts are stored in Git under `models/`:

- `models/lgbm_model.pkl`
- `models/xgb_model.pkl`
- `models/rf_model.pkl`
- `models/model_meta.json`

`predict.py` expects these files directly under `models/`. Do not move them to a versioned subdirectory without updating `predict.py`.

The matching metadata should include:

- `use_ensemble: true`
- `ensemble_models: ["LightGBM", "XGBoost", "RandomForest"]`
- `version: "v2"`

Local smoke verification on 2026-07-04 confirmed:

- Dependencies can import in a temporary Python venv.
- The three pickle files load.
- `predict.py` returns `modelUsed: Ensemble` when race entries are mocked.

Known warnings:

- XGBoost may warn when loading the pickled classifier from an older serialized format.
- scikit-learn may warn if the runtime version differs from the model training version. The restored RandomForest pickle reports it was created with scikit-learn 1.8.0.

## Neon

Neon is accessed through `DATABASE_URL`.

Store the actual value only in:

- Render dashboard env vars
- Local `.env` if local DB verification is needed

Do not paste `DATABASE_URL` into issues, docs, commits, screenshots, or logs.

## Phase 1 Verification

First confirm AI ensemble mode on Render after deployment:

- Build log installs Python packages from `scripts/requirements.txt`.
- Render shell or logs show the model files exist under `models/`.
- A prediction run returns `modelUsed: Ensemble`.
- The response includes `honsen`, `aname`, and `winProbabilities`.

After `DATABASE_URL` is configured and the server is restarted:

```text
GET /api/gacha/boatrace?action=schedule
GET /api/gacha/boatrace?action=predict&stadium=01&race=1
GET /gacha
```

Expected checks:

- `schedule` returns HTTP 200
- `schedule` returns `venues`
- `predict` returns HTTP 200
- `predict` returns `honsen`
- `predict` returns `anaCombos`
- `predict` returns `winProbabilities`
- Data is scoped to `clientId=001`
- Missing stadium / race returns easy-to-handle JSON
- `/gacha` has no React errors
- `/gacha` layout is not broken
- Response time is practical

## Release Procedure

1. Review `TODO.md`.
2. Review `RELEASE.md`.
3. Confirm Phase quality gate in `AGENTS.md`.
4. Run local verification where possible.
5. Ask user before commit.
6. Ask user before push.
7. Deploy on Render.
8. Confirm Cron success.
9. Confirm Neon save/read.
10. Confirm X posting.
11. Update `RELEASE.md`.
12. Update `CHANGELOG.md`.
13. Ask user before creating the `v1.0.0` release tag.
14. Create tag only after all v1.0 production checks pass.

## Incident Response

### Cron failed

1. Check Render logs.
2. Check Python dependency errors.
3. Check script path errors.
4. Check `DATABASE_URL`.
5. Re-run the failed script manually only if safe.

### DB connection failed

1. Confirm `DATABASE_URL` is set.
2. Confirm Neon database is active.
3. Confirm SSL mode / connection options.
4. Confirm Render env vars were applied after restart.
5. Do not print the secret value in logs.

### Gacha API returns 503

1. Check whether `DATABASE_URL` is configured.
2. Restart server after env var change.
3. Confirm `server/db.ts` can initialize a connection.
4. Check Render logs for connection errors.

### Gacha API returns empty data

1. Confirm today's date in JST.
2. Confirm `race_predictions` has rows for that date.
3. Confirm `clientId=001`.
4. Confirm `stadiumId` format is two digits.
5. Confirm `raceNumber` is 1 to 12.

### `/gacha` UI broken

1. Open `/gacha`.
2. Check browser console errors.
3. Check network calls to `/api/gacha/boatrace`.
4. Confirm zero-row response does not break the page.
5. Test desktop and mobile widths.

### X posting failed

1. Check token configuration location.
2. Check Render logs.
3. Confirm rate limits.
4. Confirm posting script input data.
5. Do not log or commit tokens.

## Windows Notes

PowerShell may show mojibake for non-ASCII files or block `npm.ps1`.

Project memory files should stay ASCII to keep Codex shell reads reliable.
