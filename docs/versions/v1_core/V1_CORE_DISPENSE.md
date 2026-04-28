# SmartFlow MVP — Version 1

## 1. Goal

Deliver the smallest possible end-to-end slice that proves the core dispensing loop works over real infrastructure:

> A user enters a litre amount in the browser, the request goes to the server, the server publishes a command to AWS IoT Core over MQTT, receives an acknowledgement from the device, and then relays per-litre progress back to the browser in real time.

Everything not required to demonstrate this loop is explicitly deferred. No auth, no database, no wallet, no plants catalogue, no multi-device routing — one hardcoded device, one screen, one dispense session at a time.

## 2. Scope

### In scope (V1)

- Single hardcoded device id (e.g. `DEV-001`).
- One web screen: litre input → dispense progress → done/failed.
- HTTP endpoint to trigger a dispense and receive a session id.
- MQTT publish of the dispense command to AWS IoT Core.
- Synchronous wait for the device's acknowledgement before responding to the browser.
- MQTT subscribe for progress messages, forwarded to the browser via WebSocket.
- Basic failure handling: timeouts, rejections, and device-reported failures surfaced via server logs and a UI snackbar.

### Out of scope (V1 — deferred to later versions)

- Authentication, signup, login, users, roles, scopes, JWT validation.
- Database, migrations, Redis, lookups, seeding.
- Plant / controller / tap catalogue, QR scanning, tap selection.
- Pricing, wallet, deposits, Stripe, refunds, transaction history.
- Daily limits, customer types, notifications.
- Admin and plant-manager dashboards.
- Real IoT firmware — the device is represented in V1 by manual MQTT publishes (Postman MQTT / AWS IoT Console) from the developer. Firmware work resumes in a later version.

## 3. Components

| Component | Folder | Responsibility in V1 |
|---|---|---|
| Web app | `smartflow.web/` | Single-screen React app. Takes litre input, calls the server, opens a WebSocket, renders live progress, shows errors via snackbar. |
| Backend | `smartflow.server/` | FastAPI service. Exposes dispense HTTP endpoint and progress WebSocket. Maintains an AWS IoT MQTT client with subscriptions to `ack` and `progress` topics. Holds in-memory session state keyed by session id. |
| MQTT broker | AWS IoT Core | Managed MQTT broker over TLS. Authenticates the server via X.509 certificate. Topics are per-device. |
| Device (stand-in) | — | For V1 there is no firmware. A developer uses Postman (MQTT) or the AWS IoT Core MQTT test client to publish `ack` and `progress` messages manually, simulating the ESP32. Real firmware is introduced in a subsequent version under `smartflow.iot/`. |

### Technology choices

- **Backend**: Python 3.12, FastAPI, `aiomqtt` (async MQTT client with TLS support for AWS IoT), `uvicorn`. No ORM, no DB driver.
- **Web**: Vite + React 18 + TypeScript. Tailwind CSS for layout utilities, Material UI for inputs / button / snackbar, GSAP for the dispensing animation (water fill, hero number counter).
- **MQTT**: AWS IoT Core, MQTT 3.1.1 over TLS 1.2, mutual TLS with a device/server certificate.

## 4. Architecture

```
┌──────────────────────┐        HTTPS / WSS         ┌──────────────────────────┐
│  Browser (React TS)  │◄──────────────────────────►│   FastAPI server         │
│  - Litre input       │  POST /api/dispense        │   - dispense endpoint    │
│  - Dispense view     │  WS   /api/ws/dispense/{id}│   - progress WebSocket   │
│  - Snackbar          │                            │   - AWS IoT MQTT client  │
└──────────────────────┘                            │   - in-memory sessions   │
                                                    └───────────┬──────────────┘
                                                                │ MQTT over TLS
                                                                ▼
                                                    ┌──────────────────────────┐
                                                    │   AWS IoT Core           │
                                                    │   topics:                │
                                                    │     smartflow/cmd/{dev}  │
                                                    │     smartflow/ack/{dev}  │
                                                    │     smartflow/progress/{dev}
                                                    └───────────┬──────────────┘
                                                                │
                                                                ▼
                                                    ┌──────────────────────────┐
                                                    │  Device (V1: Postman /   │
                                                    │  AWS IoT MQTT test       │
                                                    │  client, manual)         │
                                                    └──────────────────────────┘
```

## 5. AWS IoT Core setup (one-time, outside code)

Required before the server can connect:

1. Create an IoT **Thing** for the server client (e.g. `smartflow-server-v1`).
2. Generate a device certificate + private key, attach to the Thing.
3. Attach an IoT policy that allows:
   - `iot:Connect` for the server client id
   - `iot:Publish` on `smartflow/cmd/*`
   - `iot:Subscribe` and `iot:Receive` on `smartflow/ack/*` and `smartflow/progress/*`
4. Download the Amazon root CA, device certificate, and private key.
5. Note the AWS IoT **endpoint** (e.g. `xxxxxxxx-ats.iot.<region>.amazonaws.com`).

These are consumed by the server via environment variables (see section 9).

## 6. MQTT contract

All topics are scoped by device id (`{device_id}`, hardcoded to `DEV-001` in V1).

| Topic | Direction | QoS |
|---|---|---|
| `smartflow/cmd/DEV-001` | server → device | 1 |
| `smartflow/ack/DEV-001` | device → server | 1 |
| `smartflow/progress/DEV-001` | device → server | 1 |

No retained messages on any topic.

---

### `smartflow/cmd/DEV-001` — dispense command (server → device)

```json
{
  "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
  "action": "START",
  "litres": 20
}
```

| Field | Type | Constraints / notes |
|---|---|---|
| `id` | string (UUIDv4) | Server-generated. Must be echoed in every `ack` and `progress` message. |
| `action` | `"START"` | Only value in V1. V1.1+ adds `"STOP"`. |
| `litres` | number | > 0 and ≤ `MAX_LITRES` (default 100). |

---

### `smartflow/ack/DEV-001` — acknowledgement (device → server)

**Accepted:**
```json
{
  "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
  "status": "accepted"
}
```

**Rejected (tap busy, valve fault, etc.):**
```json
{
  "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
  "status": "rejected",
  "reason": "tap already in use"
}
```

| Field | Type | Constraints / notes |
|---|---|---|
| `id` | string (UUIDv4) | Must exactly match the `id` from the triggering `cmd`. |
| `status` | `"accepted"` \| `"rejected"` | `accepted` → device will dispense; `rejected` → device refused (tap busy, valve fault, etc.). |
| `reason` | string (optional) | Present only when `rejected`. Human-readable. |

---

### `smartflow/progress/DEV-001` — progress update (device → server)

**Mid-dispense (send repeatedly as litres accumulate):**
```json
{
  "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
  "litres": 7.4,
  "status": "dispensing"
}
```

**Successfully finished:**
```json
{
  "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
  "litres": 20.0,
  "status": "complete"
}
```

**Hardware / flow failure:**
```json
{
  "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
  "litres": 11.2,
  "status": "failed",
  "reason": "flow sensor stalled"
}
```

| Field | Type | Constraints / notes |
|---|---|---|
| `id` | string (UUIDv4) | Must match the session id. |
| `litres` | number | Cumulative litres dispensed. ≥ 0; monotonically increasing across frames; never exceeds the requested `litres` from the `cmd`. |
| `status` | `"dispensing"` \| `"complete"` \| `"failed"` | `dispensing` → ongoing, more frames follow; `complete` / `failed` are terminal — no further messages after either. |
| `reason` | string (optional) | Present only when `failed`. Human-readable hardware/sensor description. |

## 7. HTTP API

Base path: `/api`.

---

### `POST /api/dispense`

**Request**

```
POST /api/dispense
Content-Type: application/json
```

```json
{
  "litres": 20
}
```

| Field | Type | Validation |
|---|---|---|
| `litres` | number | Required. Must be > 0 and ≤ `MAX_LITRES` (default 100). |

**Behaviour:**
1. Generate session `id` (UUIDv4).
2. Register an in-memory session.
3. Publish the `cmd` message to `smartflow/cmd/DEV-001` at QoS 1.
4. Await the device's `ack` for up to `ACK_TIMEOUT_SECONDS` (default 15 s).
5. Respond based on outcome (see below).

---

**`202 Accepted` — device acknowledged, water will flow**

```json
{
  "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
  "status": "accepted"
}
```

Open `WS /api/ws/dispense/{id}` immediately after this response to receive progress frames.

---

**`409 Conflict` — device explicitly rejected the command**

```json
{
  "detail": {
    "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
    "status": "rejected",
    "reason": "tap already in use"
  }
}
```

---

**`504 Gateway Timeout` — no ack received within the timeout window**

```json
{
  "detail": {
    "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
    "status": "timeout"
  }
}
```

---

**`502 Bad Gateway` — MQTT publish to AWS IoT failed**

```json
{
  "detail": "mqtt_publish_failed"
}
```

---

**`400 Bad Request` — invalid input**

```json
{
  "detail": "litres must be <= 100"
}
```

---

The session is kept alive for 60 s after any error response so that late-arriving MQTT messages can be logged and discarded cleanly.

---

### `WS /api/ws/dispense/{id}`

Opened by the web client immediately after receiving a `202`. The `{id}` must match the `id` from the `202` response body.

**Close codes:**
- `4404` — session not found (wrong id or not yet created).
- `4410` — session already reached a terminal state before the WS connected.

**Frames (server → client)**

Progress update while dispensing:
```json
{
  "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
  "litres": 7.4,
  "status": "dispensing"
}
```

Terminal — dispense complete:
```json
{
  "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
  "litres": 20.0,
  "status": "complete"
}
```

Terminal — device failure:
```json
{
  "id": "cb66362b-ebb1-4547-9625-963876ca61e3",
  "litres": 11.2,
  "status": "failed",
  "reason": "flow sensor stalled"
}
```

After a `complete` or `failed` frame the server closes the socket normally. The client should treat any of these fields identically to the MQTT progress payload — they are forwarded verbatim.

---

### `GET /api/health`

```json
{ "status": "ok" }
```

## 8. End-to-end flow

```
User              Web                 Server                  AWS IoT              Device (manual)
 │                 │                    │                       │                       │
 │ enters 20 L     │                    │                       │                       │
 ├────────────────►│                    │                       │                       │
 │ click Dispense  │                    │                       │                       │
 │                 │ POST /api/dispense │                       │                       │
 │                 ├───────────────────►│                       │                       │
 │                 │                    │ gen id, create session│                       │
 │                 │                    │ publish cmd           │                       │
 │                 │                    ├──────────────────────►│ smartflow/cmd/DEV-001 │
 │                 │                    │                       ├──────────────────────►│
 │                 │                    │                       │                       │ (dev publishes ack via Postman)
 │                 │                    │                       │◄──────────────────────┤ smartflow/ack/DEV-001 {accepted}
 │                 │                    │◄──────────────────────┤                       │
 │                 │   202 {id, accepted}│ resolve ack_future   │                       │
 │                 │◄───────────────────┤                       │                       │
 │                 │ open WS /ws/{id}   │                       │                       │
 │                 ├───────────────────►│ attach ws to session  │                       │
 │                 │                    │                       │                       │ (dev publishes progress frames)
 │                 │                    │                       │◄──────────────────────┤ progress litres=4 dispensing
 │                 │ {litres:4,...}     │ forward               │                       │
 │                 │◄───────────────────┤                       │                       │
 │                 │                    │                       │◄──────────────────────┤ progress litres=20 complete
 │                 │ {litres:20,complete}│ forward + close     │                       │
 │                 │◄───────────────────┤                       │                       │
 │ sees "Done"     │                    │                       │                       │
```

## 9. Configuration

Server environment variables (`.env`):

| Variable | Purpose |
|---|---|
| `AWS_IOT_ENDPOINT` | MQTT endpoint hostname (from AWS IoT Core settings) |
| `AWS_IOT_PORT` | `8883` |
| `AWS_IOT_CLIENT_ID` | Server-side client id, e.g. `smartflow-server-v1` |
| `AWS_IOT_CA_PATH` | Path to Amazon root CA PEM |
| `AWS_IOT_CERT_PATH` | Path to server certificate PEM |
| `AWS_IOT_KEY_PATH` | Path to server private key PEM |
| `DEVICE_ID` | Hardcoded device id for V1 (`DEV-001`) |
| `ACK_TIMEOUT_SECONDS` | `5` |
| `CORS_ORIGINS` | `http://localhost:5173` during dev |

Web environment variables (`.env`):

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | e.g. `http://localhost:8000` |
| `VITE_WS_BASE_URL` | e.g. `ws://localhost:8000` |

## 10. Error handling

The philosophy for V1: **log verbosely on the server console, surface a concise message to the user via a Material UI snackbar, never crash the app**.

| Failure | Server behaviour | UI behaviour |
|---|---|---|
| MQTT publish fails | Log error with session id, return `502`. | Snackbar: "Couldn't reach the dispenser. Try again." |
| Ack timeout (5 s) | Log warning with session id, keep session for late-arrival logging, return `504`. | Snackbar: "Dispenser didn't respond. Please try again." |
| Ack `rejected` | Log info with reason, return `409`. | Snackbar: "Dispense rejected: <reason>." |
| MQTT disconnect while session active | Log error, mark session failed, push terminal `failed` frame on WS. | Snackbar: "Connection lost. Dispense halted." |
| Progress `failed` from device | Log info with reason, push terminal frame on WS, close. | Snackbar with reason, progress view resets. |
| WS closes unexpectedly | Log warning, keep session so reconnect (future) is possible. | Snackbar: "Lost live updates." Allow retry button to reopen the WS. |
| Malformed MQTT payload | Log error with raw payload, drop. | No UI impact. |

All server logs include the session `id` so a single dispense can be traced across topics.

## 11. UI sketch

Single route (`/`). Two states in one component:

1. **Idle** — Material UI `TextField` for litres (number input, min 1, max 100), primary "Dispense" button, recent-status text if any.
2. **Dispensing** — hero GSAP-animated litre counter (tabular nums), progress bar (`litres / target`), status chip ("Pouring" / "Complete" / "Failed"), "Back" button once terminal.

Visual tokens (colours, typography) may be lifted from `ui-mock/project/colors_and_type.css`, and the dispensing animation idea from `ui-mock/.../screens/Screens.jsx → ScreenDispensing`. Pixel-perfect fidelity to the mock is **not** required in V1; the goal is a clean, legible demo.

Snackbar (MUI) is the single channel for all error and info messages.

## 12. Build order

1. **AWS IoT setup** — Thing, cert, policy, download creds. Verify connectivity from a local Python script or the AWS IoT test client.
2. **Server skeleton** — FastAPI app, CORS, `/health` endpoint, MQTT client connecting to AWS IoT on startup with subscriptions wired up (logging received messages).
3. **Dispense endpoint + session registry** — `POST /api/dispense` with publish + ack wait. Drive the ack manually via AWS IoT MQTT test client; verify timeout and accepted/rejected paths.
4. **Progress WebSocket** — `WS /api/ws/dispense/{id}` pipes progress frames. Drive progress manually via the test client.
5. **Web scaffold** — Vite + React TS + Tailwind + MUI + GSAP. Single page that hits the API and the WS.
6. **UI polish** — GSAP animation for the litre counter and progress fill, snackbar wiring, disabled button states.
7. **End-to-end dry run** — use Postman MQTT to simulate a full `accepted → dispensing × N → complete` sequence, then a `rejected` path, then an ack-timeout.

## 13. References from the legacy `smart-flow/` project

Copy or adapt — do not re-architect:

- `smart-flow-backend/app/iot/` — MQTT client setup and AWS IoT TLS configuration. Drop provisioning and the dispense-session manager's DB writes.
- `smart-flow-backend/app/routers/ws.py` — WebSocket handler shape for dispense progress.
- `smart-flow-backend/app/main.py` — lifespan hook pattern for connecting the MQTT client on app start.
- `ui-mock/project/colors_and_type.css` — design tokens.
- `ui-mock/project/ui_kits/mobile_app/screens/Screens.jsx` → `ScreenDispensing` — reference for the dispense animation.

## 14. Definition of done (V1)

- Server starts, connects to AWS IoT, logs `subscribed` for `ack/#` and `progress/#`.
- Web page loads, user enters a litre amount, clicks Dispense.
- Manually published ack over AWS IoT test client moves the UI from "sending" to "dispensing".
- Manually published progress frames drive the hero counter and progress bar smoothly via GSAP.
- A manually published `complete` frame transitions the UI to a done state.
- A manually published `failed` frame, an ack `rejected`, and a no-ack-at-all scenario each produce a distinct, visible snackbar and a corresponding server log line tagged with the session id.
