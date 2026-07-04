# TODO

Work from the first unchecked item. Check items when done. Do not delete completed items. Do not commit unless the user explicitly asks.

## Phase 1A - Restore AI Ensemble

- [x] Copy 3 model files from `betako_deploy_work/betako_deploy/models` into `boatrace-ai-repo/models`
- [x] Replace `models/model_meta.json` with the matching deploy-work metadata
- [x] Decide whether `.pkl` files are committed with `git add -f` or provisioned outside Git
- [x] Confirm `predict.py` can load LightGBM / XGBoost / RandomForest dependencies
- [x] Confirm `predict.py` returns `modelUsed: Ensemble`
- [x] Record AI restore result
- [ ] Confirm Render can run `predict.py` in AI ensemble mode

## Phase 1B - Gacha Read API With Neon

- [ ] Confirm `DATABASE_URL` is configured locally or in Render Web Service
- [ ] Restart the server
- [ ] Confirm `GET /api/gacha/boatrace?action=schedule` returns HTTP 200
- [ ] Confirm `schedule` returns `venues`
- [ ] Confirm today's venues are correct
- [ ] Confirm `GET /api/gacha/boatrace?action=predict&stadium=01&race=1` returns HTTP 200
- [ ] Confirm `predict` returns `honsen` / `anaCombos` / `winProbabilities`
- [ ] Confirm `predict` returns only `clientId=001` data
- [ ] Confirm missing `stadium` / `race` returns easy-to-handle JSON
- [ ] Confirm `/gacha` does not break when data count is zero
- [ ] Confirm response time is practical
- [ ] Confirm `/gacha` has no React errors
- [ ] Confirm `/gacha` API fetch succeeds
- [ ] Confirm `/gacha` layout is not broken
- [ ] Record Phase 1 completion decision
- [ ] If instructed, commit: `Phase 1: Gacha read API with Neon`
- [ ] If instructed after release checks pass, create tag: `v1.0.0`

## Phase 2 - Realtime Prediction API

- [ ] Design realtime prediction API
- [ ] Define request format for stadium / race / date
- [ ] Fetch latest racecard / beforeinfo / odds before prediction
- [ ] Run 3-model ensemble prediction
- [ ] Return `honsen` / `ana` / confidence / expected value
- [ ] Decide persistence policy for realtime predictions

## Phase 3 - Product APIs

- [ ] Design User API
- [ ] Design Draw API
- [ ] Design Checkout API
- [ ] Define unified error codes
- [ ] Design audit log
- [ ] Decide DB transaction policy
- [ ] Decide idempotency key policy
