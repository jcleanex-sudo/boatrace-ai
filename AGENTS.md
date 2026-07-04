# Betako Development Rules

## Required Rules

1. Work from the first unchecked item in `TODO.md`.
2. Do not change `ROADMAP.md` unless the user explicitly asks.
3. Commit only when the user explicitly asks.
4. Push only when the user explicitly asks.
5. Create Git tags only when the user explicitly asks.
6. Any DB schema change requires a migration.
7. New APIs must follow the architecture in `PROJECT.md`.
8. If blocked, report only the reason and the next required action.
9. Do not delete completed TODOs. Mark them checked.
10. If a design decision changes, record the reason in `DECISIONS.md`.
11. Keep project memory files ASCII unless the user explicitly asks otherwise.

## Default Workflow

When the user sends a short continuation request, read these files in order:

1. `PROJECT.md`
2. `ROADMAP.md`
3. `TODO.md`
4. `CHANGELOG.md`
5. `DECISIONS.md`
6. `RELEASE.md`
7. `RUNBOOK.md`

Then continue from the first unchecked item in `TODO.md`.

## Reporting

Keep reports short:

- What was done
- Why work stopped, if blocked
- Next required action

## Commit Rule

Do not commit unless explicitly instructed by the user.

Expected Phase 1 commit message:

```text
Phase 1: Gacha read API with Neon
```

Do not create release tags unless explicitly instructed by the user.

## Secrets

Never commit:

- `DATABASE_URL`
- API keys
- JWT secrets
- LINE secrets
- X tokens
- payment provider secrets
- cookies

If `.env` is needed, values are managed by the user.

## Phase 1 Quality Gate

Do not mark Phase 1 complete until all items are OK:

- `schedule` returns `venues`
- `predict` returns `honsen` / `anaCombos` / `winProbabilities`
- Results are scoped to `clientId=001`
- `/gacha` does not break with zero rows
- Response time is practical
- Missing `stadium` / `race` returns easy-to-handle JSON

## API Rules

- Return JSON from APIs.
- Return easy-to-handle JSON for errors.
- Use unified error codes from Phase 2 onward.
- Draw / Checkout / Coin updates require DB transactions.
- Payment and gacha consumption require idempotency keys.
- Money, coin, draw, and referral reward changes require audit logs.

## Database Rules

- Assume Neon PostgreSQL.
- Connect through `DATABASE_URL`.
- Default `clientId` is `001`.
- Keep `clientId=001` filtering in Gacha read API.
- Do not complete Phase 1 without real DB verification.

## Render Rules

- Prefer `render.yaml` for Render configuration.
- `DATABASE_URL` is set manually in the Render dashboard.
- Before deploy, verify build command, start command, and env vars.

## Local Verification Notes

On Windows PowerShell, `npm.ps1` can fail because of execution policy. Use `npm.cmd`.

On Windows local runs, `sudo` and Linux-only Python paths can fail. These warnings do not block Phase 1 Gacha read API verification by themselves.

## Known Current Blocker

As of 2026-07-04, the only Phase 1 blocker is confirming a working `DATABASE_URL` for real DB verification.
