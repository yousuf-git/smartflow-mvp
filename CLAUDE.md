# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

SmartFlow MVP — IoT water **conservation** system, not a water shop. Users pre-commit to exactly how much water they need before dispensing; the system tracks real-time delivery and accounts for what was actually used. Cost is a minimal deterrent against waste — not a revenue goal.

One order (1–4 canes across ≤2 taps), server commands an MQTT-connected controller, progress streams back over WebSocket. Three sub-packages:

- `smartflow.server/` — FastAPI + async SQLAlchemy + aiomqtt
- `smartflow.web/` — React 19 + MUI + Tailwind CSS v4 + Vite
- `smartflow.iot/` — placeholder (firmware not yet in repo)

Current version: **V1.2** (QR-based plant/tap selection). Spec: `docs/versions/V1.2_QR_BASED_PLANT_AND_TAP_SELECTION.md`.

---

## Server (`smartflow.server/`)

### Dev commands

```bash
cd smartflow.server
source .venv/bin/activate       # or: python -m venv .venv && pip install -r requirements.txt
uvicorn app.main:app --reload   # default port 8000
```

Needs a running Postgres. Set `DATABASE_URL` in `.env` (see `.env.example`).  
MQTT is optional — if `AWS_IOT_*` vars are blank the server starts without it (dispense commands won't reach hardware).

### Architecture

```
app/
  main.py          — FastAPI app, lifespan (DB + seed + MQTT)
  config.py        — pydantic-settings; get_settings() is lru_cache-cached
  db.py            — engine/sessionmaker singletons; get_sessionmaker()
  models.py        — SQLAlchemy ORM models (all entities below)
  schemas.py       — Pydantic in/out schemas
  routes.py        — all HTTP + WS endpoints under /api
  purchase_service.py — order/cane lifecycle logic
  wallet.py        — ledger helpers (balance, hold, daily-limit, debit/credit)
  mqtt.py          — MQTTClient (aiomqtt); dispatch ack + progress frames
  runtime.py       — in-memory Registry: ack futures, WS queue, idle timer per group
  seed/
    lookups.py     — prices, limits, customer_types (normal / commercial)
    infrastructure.py — plant, controller, taps
    demo_user.py   — user + customer + opening credit wallet_tx
```

### Key domain concepts

- **Cane** (UI) = **Purchase** row (DB). One cane = one dispense on one tap.
- **Order** (UI) = **PurchaseGroup** row. Groups 1–4 canes (max 2 per tap, max 2 taps).
- **Hold model**: no wallet_tx at order creation. Debit written when cane acks + starts. Credit written on stop/fail for undelivered litres. Cancel of unstarted canes writes nothing.
- **`runtime.Registry`**: in-memory per-group state (ack `Future`, WS `Queue`, idle `Task`). DB is source of truth for persistent state.

### MQTT topics (keyed by `CONTROLLER_NAME`)

| Topic | Direction | Payload |
|---|---|---|
| `smartflow/cmd/{name}` | server→device | `{id, tap_id, action, litres?}` |
| `smartflow/ack/{name}` | device→server | `{id, status, reason?}` |
| `smartflow/progress/{name}` | device→server | `{id, litres, status, reason?}` |

`id` = integer `Purchase.id`. Ack `status`: `accepted` or `rejected`. Progress `status`: `dispensing`, `complete`, `failed`, `stopped_early`.

### Cane status machine

```
pending → (START acked) → started → (progress) → completed | partial_completed | failed
pending → cancelled   (no wallet movement)
started → partial_completed  (user STOP or stopped_early frame; credit for undelivered)
```

### Seeded customer types

| Type | Price | Daily limit |
|---|---|---|
| normal | 5 PKR/L | 50 L |
| commercial | 4 PKR/L | 200 L |

Demo user defaults to `normal`, `INITIAL_BALANCE=500 PKR`.

### Config knobs (`.env`)

`IDLE_RELEASE_SECONDS` (90), `ACK_TIMEOUT_SECONDS` (5), `RETRY_LIMIT` (3), `RETRY_WINDOW_SECONDS` (60), `MAX_LITRES` (100), `TAPS` (`"T1:Tap 1,T2:Tap 2"` — code:label CSV).

Schema is created via `Base.metadata.create_all()` on startup (no Alembic yet). Re-boot is idempotent; seed uses upsert-style checks.

---

## Web (`smartflow.web/`)

### Dev commands

```bash
cd smartflow.web
npm install
npm run dev          # Vite dev server, default port 5173
npm run typecheck    # tsc --noEmit (no test suite yet)
npm run build        # tsc -b && vite build
```

### Env vars

```
VITE_API_BASE_URL=http://localhost:8000   # HTTP base
VITE_WS_BASE_URL=ws://localhost:8000     # WebSocket base
VITE_IDLE_RELEASE_SECONDS=90             # mirrors server default
```

### Architecture

```
src/
  App.tsx             — single-page state machine (screen: loading|home|submitting|progress)
  lib/
    api.ts            — axios client; all REST calls; ApiErr type
    ws.ts             — openOrderSocket(); OrderFrame type
  components/
    WalletHeader.tsx  — balance / hold / daily-remaining display
    CaneBuilder.tsx   — tap + litre draft form
    ProgressScreen.tsx — per-cane cards + idle countdown
    CaneCard.tsx      — individual cane status card
```

`App.tsx` owns all state. `applyFrame()` patches cane state from WS frames. `/me` is re-fetched on every terminal frame (non-`dispensing` status) to sync wallet.

---

## Web UI — Language & UX Guidelines

### Language (what to say / avoid)

| Avoid | Use instead | Why |
|---|---|---|
| "purchase", "order", "buy" | "session", "fill" | App is utility, not e-commerce |
| "Holding funds…" | "Reserving…" | Less bank-statement feel |
| "Total" (lone label) | "Session total" | Adds context |
| "/ 10.0 L" | "of 10.0 L" | More natural when reading progress |
| "Unused litres refunded" | "Unused credit returned" | "litres" aren't refunded, credit is |
| Version string in UI ("V1.2") | — (omit entirely) | Makes product feel like a test build |

### UX rules

- **Separate concerns visually.** Don't cram rate + constraints + limits into one line. Use Chips/badges so each piece of information is independently scannable.
- **Back navigation at every pre-dispense step.** User must be able to reach the QR scan screen from CaneBuilder without cancelling anything.
- **Back from ProgressScreen only when terminal.** While fills are active or pending, the user must cancel first — don't provide a shortcut that abandons live dispense.
- **Mobile-first.** Assume 5–6 inch phone. Tap targets ≥ 44 px. Primary actions (Confirm, Start, Stop) always reachable without scrolling on a phone.
- **No version strings in UI.** Versions belong in git tags and docs, not rendered on screen.
- **Toast for transient feedback, inline error only for blocking validation.** Camera errors, same-tap warnings, server errors → Toast. Form validation that blocks submission → inline below the form.

---

## Docs

- `docs/versions/V1.1_MULTIPLE_TAP_DISPENSE.md` — current feature spec + edge-case table (14 rows)
- `docs/versions/V1_CORE_DISPENSE.md` — previous version baseline
- `docs/TARGET_DB.md/entities_context.md` — full target DB schema (superset of what's implemented)
- `docs/tech-stack/TECH_STACK.md` — stack choices and rationale
- `docs/SYSTEM_CONSTANTS.md` — reference for grouped enums/constants (WIP)
