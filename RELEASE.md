# Release

Track release readiness only. Put work logs in `CHANGELOG.md`, decisions in `DECISIONS.md`, and next actions in `TODO.md`.

## v1.0

Status: Not Yet

Target:

- AI-powered boatrace prediction app
- Gacha read API with Neon
- `/gacha` production verification
- Render + Neon operation baseline

Completion criteria:

- [x] AI prediction
- [x] Cron / scheduled scripts
- [x] Neon baseline
- [x] `/gacha` read API implementation
- [x] Switch boatrace prediction reads from Base44 function to `/api/gacha/boatrace`
- [x] 3-model ensemble is restored
- [x] `predict.py` AI ensemble mode is verified locally
- [ ] Render AI ensemble mode check passes
- [ ] `DATABASE_URL` is configured in Render Web Service
- [ ] Next Cron succeeds
- [ ] Neon save is verified
- [ ] `GET /api/gacha/boatrace?action=schedule` production check passes
- [ ] `GET /api/gacha/boatrace?action=predict&stadium=01&race=1` production check passes
- [ ] `/gacha` production UI check passes
- [ ] `clientId=001` filtering is verified
- [ ] X posting is verified
- [ ] Phase 1 commit is created

Release decision:

Not Yet

Release record:

```text
Release: v1.0
Status: Released
Date: YYYY-MM-DD
Commit: <commit-sha>
Tag: v1.0.0
Notes:
- TBD
```

## v1.1

Status: Planned

Target:

- Realtime prediction API
- Requested race prediction using the 3-model ensemble

Release decision:

Not Yet

## v1.2

Status: Planned

Target:

- User API
- Draw API
- Checkout API
- DB transaction
- Idempotency
- Audit log
- Unified error codes

Release decision:

Not Yet
