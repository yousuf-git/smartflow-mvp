# SmartFlow MVP

SmartFlow is an IoT-enabled smart water dispensing platform. Customers use a mobile-friendly web app to request a specific volume of water at a managed distribution plant. The request flows to a cloud backend that commands a hardware controller over MQTT, which opens a relay, measures flow via a sensor, and reports progress back to the browser in real time.

---

## Building approach

This repository is built incrementally — feature by feature, version by version. Each version delivers one vertical slice of the full system end-to-end, from the browser down to the hardware. No version introduces infrastructure it does not immediately use; everything deferred is called out explicitly.

This means at any point in the history the system actually runs. There are no placeholder stubs masquerading as features and no partially-wired modules waiting to be connected later.

Version plans live in `docs/versions/`. Read the relevant version doc before touching code in that increment.

---

## Project structure

```
smartflow-mvp/
├── smartflow.server/       # Python / FastAPI backend
├── smartflow.web/          # React / TypeScript PWA
├── smartflow.iot/          # Arduino / ESP32 firmware
├── docs/
│   ├── versions/           # Per-version specs (scope, contracts, flows, JSON shapes)
│   └── tech-stack/         # Pinned dependency versions and rationale
└── ui-mock/                # HTML/CSS design prototypes (reference only)
```

### `smartflow.server`

FastAPI service. Handles HTTP and WebSocket requests from the browser, maintains an MQTT client connected to AWS IoT Core, and holds in-memory session state that ties a browser session to an active device dispense. Async throughout — no blocking I/O.

### `smartflow.web`

Vite + React 19 + TypeScript single-page app. Tailwind CSS for layout, Material UI for interactive components, GSAP for animations. Communicates with the server over REST (dispense request) and WebSocket (real-time progress).

### `smartflow.iot`

Arduino C++ firmware for an ESP32 controller at the physical plant. Connects to AWS IoT Core over MQTT/TLS, receives dispense commands, operates a relay to open the water tap, counts pulses from a flow sensor to measure volume, and publishes progress back to the server. Not active in early versions — replaced by manual MQTT publishes during development.

---

## Communication at a glance

```
Browser ──POST /api/dispense──► Server ──pub cmd──► AWS IoT Core ──► ESP32
   ▲                               │                      │               │
   └── WS /api/ws/dispense/{id} ◄──┘       ack / progress ◄──────────────┘
```

1. Browser sends litres → server generates a session id and publishes a `START` command to the device's MQTT topic.
2. Device acknowledges; server responds to the HTTP request.
3. Device streams per-litre progress; server forwards each frame over WebSocket to the browser.
4. On completion (or failure / overage), the server sends a terminal frame and closes the socket.

Full message contracts (topics, JSON shapes, HTTP status codes) are documented in the relevant version spec under `docs/versions/`.

---

## Versions

| Version | What it covers |
|---|---|
| V1 | Core dispense loop: web → server → AWS IoT → device (manual stand-in) → progress back to UI |
| V2+ | Auth, wallet, plant/tap catalogue, pricing, history, real firmware — TBD |

---

## Docs

| Document | Purpose |
|---|---|
| `docs/versions/V1.md` | Full V1 spec: scope, architecture, MQTT + HTTP contracts, error handling, build order |
| `docs/tech-stack/TECH_STACK.md` | All pinned dependency versions with rationale |
| `ui-mock/` | Design prototypes — visual reference for component styling |

---

## Quick start

Each sub-project has its own README with setup steps:

- [`smartflow.server/README.md`](smartflow.server/README.md)
- [`smartflow.web/README.md`](smartflow.web/README.md)
