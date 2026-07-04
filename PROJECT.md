# Betako Project

## Overview

Betako is a boatrace prediction AI product with a gacha-style user experience.

Core goals:

- Collect, store, and display AI prediction data.
- Run the restored LightGBM + XGBoost + RandomForest ensemble for core predictions.
- Let `/gacha` read today's venues and predictions from the app backend.
- Return trifecta candidates as `honsen`, `anaCombos`, and `winProbabilities`.
- Implement User API, Draw API, and Checkout API in Phase 2.

## Repository

Main working repository:

```text
boatrace-ai-repo/
```

Use `TODO.md` as the source of truth for short-term work.

Use `RUNBOOK.md` for operations and recovery procedures.

## System

- Frontend: Vite + React
- Routing: Wouter
- Backend: Express
- API entrypoint: `server/_core/index.ts`
- Gacha read API: `server/gachaBoatrace.ts`
- Database helper: `server/db.ts`
- Model artifacts: `models/lgbm_model.pkl`, `models/xgb_model.pkl`, `models/rf_model.pkl`
- Database: Neon PostgreSQL
- Hosting: Render Web Service

## Render

Render config lives in `render.yaml`.

- Service name: `boatrace-ai`
- Build command: `npm install -g pnpm && pnpm install --no-frozen-lockfile && pip3 install ... && pnpm build`
- Start command: `pnpm start`
- Required env vars:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `VITE_APP_ID`
  - `OWNER_OPEN_ID`

`DATABASE_URL` is `sync: false`, so it must be set manually in the Render dashboard.

## Neon

Neon is accessed through `DATABASE_URL`.

Never commit the connection string or any secrets.

Phase 1 expects the Gacha read API to read from `race_predictions`.

## CLIENT_ID

Default `CLIENT_ID` is `001`.

Gacha read API uses:

```text
clientId = query.clientId || process.env.CLIENT_ID || "001"
```

Phase 1 must verify that only `clientId=001` data is returned.

## X

X posting is part of Betako operations, but it is not a Phase 1 blocker.

Never store X tokens, cookies, or API keys in the repository.

## Current Phase

Current phase: Phase 1A AI ensemble restoration, then Phase 1B real database verification.

Current blocker: verify local or Render Python dependencies can load LightGBM / XGBoost / RandomForest and confirm `predict.py` returns `modelUsed: Ensemble`.
