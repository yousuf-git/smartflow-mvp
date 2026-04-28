## SmartFlow MVP — Server (V1.1)

FastAPI backend. V1.1 introduces Postgres (async SQLAlchemy) and a slice of
the target entity model (see `../docs/TARGET_DB.md/entities_context.md`):
`User`, `Customer`, `CustomerType`, `Price`, `Limit`, `Plant`, `Controller`,
`Tap`, `PurchaseGroup`, `Purchase`, `WalletTransaction`.

Full spec in `../docs/versions/V1.1_MULTIPLE_TAP_DISPENSE.md`.

### Layout

```
smartflow.server/
├── app/
│   ├── config.py            # pydantic-settings, env-driven
│   ├── db.py                # async SQLAlchemy engine + sessionmaker
│   ├── models.py            # target-aligned models (V1.1 subset)
│   ├── seed/                # idempotent seed, one file per slice
│   │   ├── __init__.py      #   orchestrator + create_all
│   │   ├── lookups.py       #   CustomerType / Price / Limit
│   │   ├── infrastructure.py#   Plant / Controller / Tap
│   │   └── demo_user.py     #   User / Customer / opening credit WalletTransaction
│   ├── wallet.py            # ledger reads + writes; live hold/daily sums
│   ├── runtime.py           # in-memory order state: ack futures, WS queue, idle timer
│   ├── purchase_service.py  # orchestration: create / start / stop / cancel / progress
│   ├── mqtt.py              # aiomqtt TLS client; dispatches by cane int id
│   ├── routes.py            # /me, /catalogue, /order…, /ws/order/{id}, /health
│   ├── schemas.py           # pydantic request/response models
│   └── main.py              # FastAPI app + lifespan
├── certs/                   # AWS IoT cert/key (gitignored)
├── .env.example
└── requirements.txt
```

### Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # edit DATABASE_URL, AWS IoT, demo user/plant
createdb -U smartflow smartflow
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Boot creates tables (`create_all`) and runs every file in `app/seed/`
idempotently. Adding a new slice is additive: drop a file, wire it into
`seed/__init__.py`.

### Runtime (`app/runtime.py`)

In-memory sidecar for active orders. The Postgres tables remain the source of
truth for *data*; the runtime owns *liveness* — the moving parts that can't be
expressed as rows:

| Per-group state      | Purpose                                                  |
|----------------------|----------------------------------------------------------|
| `canes[cid].ack_future` | `asyncio.Future` awaited by `/start` until `smartflow/ack/{controller}` comes back. |
| `ws_queue`           | `asyncio.Queue` of frames; the `/ws/order/{id}` coroutine drains this. |
| `idle_task`          | `asyncio.Task` armed for `IDLE_RELEASE_SECONDS`; cancels `pending` canes if no activity. |
| `closed`             | Flag set by `close_group`; drops later pushes on the floor. |

A `GroupRuntime` is registered at `POST /order` (`register_purchase`) and
stays in memory until one of the close paths runs.

#### WebSocket lifecycle

```
client connects → /api/ws/order/{id}
  • if runtime has no entry for {id}     → 4404 close (order not active here)
  • otherwise accept, drain ws_queue in a loop, send_json each frame
  • exit loop only when a {"__close__": true} sentinel arrives
```

The socket is NOT closed when an individual cane reaches a terminal state,
nor when the whole `PurchaseGroup` flips to `completed` — other canes in
the same order may still be active, and the user may want to inspect the
final state. It is closed only in these cases:

| Trigger                              | What closes the WS                                   |
|--------------------------------------|------------------------------------------------------|
| Client navigates / calls `ws.close()`| Browser half-closes; server loop sees `WebSocketDisconnect`. |
| Idle timer fires **and** the whole order was still pending (no cane ever started) | `_fire` in `routes.py` pushes cancel frames then calls `close_group`. |
| Server shutdown                      | FastAPI lifespan teardown.                           |

If the idle timer fires on an order where at least one cane already
completed/failed/stopped, the timer is effectively a no-op: there's nothing
`pending` to cancel, and the socket is left open for the client. In normal
operation the timer is *cancelled* as soon as the last cane reaches a
terminal state (see `mqtt._handle_progress` and `/stop`), so it never fires
in the happy path.

#### Ack futures

```
POST /start
  → record_start_attempt (retry limiter)
  → registry.arm_ack(cane_id)        # creates Future
  → mqtt.publish(cmd/..., START)
  → asyncio.wait_for(future, ACK_TIMEOUT_SECONDS)
       on accepted  → mark_cane_started (debit ledger) → 200
       on rejected  → 409
       on timeout   → 504
```

`smartflow/ack/{controller}` handler calls `registry.resolve_ack(id, payload)`
to complete the future. An ack for a cane that isn't waiting is logged and
dropped.

#### Idle timer

- Armed at `POST /order` and re-armed on each successful `POST /start`.
- Fires after `IDLE_RELEASE_SECONDS` of inactivity.
- Cancelled as soon as every cane in the group reaches a terminal status
  (complete/partial/failed/cancelled), so a finished order does not kick
  its own WS.

### MQTT topics

Keyed by `CONTROLLER_NAME` (default `DEV-001`):

- `smartflow/cmd/{controller_name}` — server→device `{id, tap_id, action:"START"|"STOP", litres?}`
- `smartflow/ack/{controller_name}` — device→server `{id, status, reason?}`
- `smartflow/progress/{controller_name}` — device→server `{id, litres, status, reason?}`

`id` is the integer `Purchase.id` for the cane. `tap_id` is the integer `Tap.id`.

### HTTP API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/me` | User + customer type + wallet + daily-limit snapshot |
| `GET` | `/api/catalogue` | Plants → taps |
| `POST` | `/api/order` | Create an order (1–4 canes over ≤2 taps) |
| `GET` | `/api/order/{id}` | Read an order |
| `POST` | `/api/order/{id}/cane/{cid}/start` | Publish START; await ack; debit ledger |
| `POST` | `/api/order/{id}/cane/{cid}/stop` | Publish STOP; credit undelivered |
| `POST` | `/api/order/{id}/cancel` | Cancel pending canes |
| `WS` | `/api/ws/order/{id}` | Stream progress frames |
| `GET` | `/api/health` | Liveness probe |

### Config

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | — | `postgresql+asyncpg://…` |
| `CONTROLLER_NAME` | `DEV-001` | Seeded controller name; MQTT topic key |
| `PLANT_NAME` | `Demo Plant` | Seeded plant |
| `TAPS` | `T1:Tap 1,T2:Tap 2` | Comma-separated `code:label`, seeded under the controller |
| `DEMO_EMAIL` | `demo@smartflow.local` | Demo user's email (auth attribute in target) |
| `DEMO_FIRST_NAME` | `Demo` | Demo user first name |
| `DEMO_LAST_NAME` | `User` | Demo user last name |
| `DEMO_CUSTOMER_TYPE` | `normal` | One of the seeded customer types (`normal` / `commercial`) |
| `INITIAL_BALANCE` | `500` | Opening credit wallet_transaction |
| `IDLE_RELEASE_SECONDS` | `90` | Idle auto-cancel window |
| `RETRY_LIMIT` / `RETRY_WINDOW_SECONDS` | `3` / `60` | START retry limiter |
| `ACK_TIMEOUT_SECONDS` | `5` | Max wait for ack |
| `MAX_LITRES` | `100` | Per-cane safety cap |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
