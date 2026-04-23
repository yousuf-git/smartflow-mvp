# SmartFlow MVP — Tech Stack

Living document. Every tool, library, runtime, or service adopted anywhere in the MVP (`smartflow.server/`, `smartflow.web/`, `smartflow.iot/`, infra) is pinned here with its version and the reason it was chosen. Add new entries as they are introduced; do not silently upgrade a pinned version — bump it here in the same change that bumps it in the lockfile.

- **Last updated**: 2026-04-23
- **Policy**: versions below are the latest stable releases at the time each row was added. "Latest stable" is a snapshot, not a promise — pin the version in `package.json` / `pyproject.toml` / `requirements.txt` and only change it deliberately.

---

## 1. Runtimes

| Runtime | Version | Notes |
|---|---|---|
| Python | 3.13.x | Used by `smartflow.server`. 3.13 is the current stable line. |
| Node.js | 22 LTS | Used to build/run `smartflow.web`. LTS keeps the toolchain stable. |

---

## 2. Backend (`smartflow.server/`)

| Package | Version | Purpose |
|---|---|---|
| `fastapi` | 0.136.0 | HTTP + WebSocket framework. |
| `uvicorn[standard]` | 0.45.0 | ASGI server used in dev and prod. |
| `aiomqtt` | 2.5.1 | Async MQTT 3.1.1 client with TLS; used to talk to AWS IoT Core. |
| `pydantic` | 2.13.3 | Request/response validation. |
| `pydantic-settings` | 2.14.0 | `.env`-driven config. |
| `python-dotenv` | 1.2.2 | Loads `.env` in local dev. |
| `httpx` | 0.28.1 | Any outbound HTTP (reserved — not required by V1 flow, but standard). |

**Not used in V1** (called out so nobody pulls them in by reflex): SQLAlchemy, alembic, asyncpg, redis, stripe, boto3. They will land in later versions when a DB / wallet / provisioning feature is introduced.

### Tooling

| Tool | Version | Purpose |
|---|---|---|
| `ruff` | latest | Lint + format (single tool, replaces black + flake8 + isort). |
| `mypy` | latest | Type checking. |
| `pytest` | latest | Tests. |

Tool versions are tracked in `pyproject.toml` once the project is scaffolded.

---

## 3. Web (`smartflow.web/`)

| Package | Version | Purpose |
|---|---|---|
| `react` | 19.2.0 | UI library. |
| `react-dom` | 19.2.0 | DOM renderer. |
| `typescript` | 6.0.3 | Type system. |
| `vite` | 8.0.9 | Dev server + build tool. |
| `@vitejs/plugin-react` | 6.0.1 | React Fast Refresh + JSX. |
| `tailwindcss` | 4.2.4 | Utility CSS. |
| `@tailwindcss/vite` | 4.2.4 | Tailwind v4's official Vite plugin (the v4 way — no PostCSS config needed). |
| `@mui/material` | 9.0.0 | Component library (inputs, buttons, snackbar). |
| `@mui/icons-material` | 9.0.0 | Material icons. |
| `@emotion/react` | 11.14.0 | Required peer dep for MUI styling. |
| `@emotion/styled` | 11.14.1 | Required peer dep for MUI styling. |
| `gsap` | 3.15.0 | Animation engine for the dispensing hero view. |
| `axios` | 1.15.2 | HTTP client for the REST endpoint. Native `WebSocket` for the WS endpoint — no extra dep. |

### Tooling

| Tool | Version | Purpose |
|---|---|---|
| `eslint` | latest | Lint. |
| `@typescript-eslint/*` | latest | TS-aware ESLint rules. |
| `prettier` | latest | Formatting. |

### Notes on combining Tailwind and MUI

- MUI owns interactive components (`TextField`, `Button`, `Snackbar`, etc.) and their a11y behaviour.
- Tailwind owns layout, spacing, and page-level styling.
- Do **not** try to restyle MUI internals with Tailwind classes; use MUI's `sx` prop or theme overrides for that. Tailwind classes on MUI root elements (for margin/width/grid placement) are fine.
- GSAP animates DOM nodes directly (via `useRef`); it does not fight either system.

---

## 4. IoT (`smartflow.iot/`)

Deferred in V1. The device is represented by manual MQTT publishes from Postman or the AWS IoT Core MQTT test client. A concrete toolchain (Arduino core, ESP-IDF, PlatformIO, libraries) will be recorded here when V2+ firmware work begins.

---

## 5. Infrastructure / services

| Service | Purpose | Notes |
|---|---|---|
| AWS IoT Core | Managed MQTT broker over TLS. | Mutual TLS with X.509 device certs. Topics scoped per device. |
| Postman (MQTT feature) | V1 device stand-in. | Used to hand-publish `ack` and `progress` messages during development. |
| AWS IoT Core MQTT test client | V1 device stand-in (alt). | Browser-based publisher inside the AWS console. |

---

## 6. Conventions

- **Pinning**: every dependency above must be an exact version in the lockfile (`package-lock.json`, `uv.lock` / `poetry.lock`, etc.). No caret/tilde ranges on production deps.
- **Adding a package**: append a row to the relevant section with version + one-sentence purpose. If it replaces something, remove the old row in the same change.
- **Upgrading a version**: update the row and bump "Last updated" at the top. Note the reason briefly in the `## 8. Changelog` section below.
- **Latest stable lookup**: confirm via the package registry (`npm view <pkg> version`, `pip index versions <pkg>`, or the package's GitHub releases) before pinning.

---

## 7. Out-of-scope for V1 (tracked here so we don't accidentally pull them in)

Auth servers, Redis, Postgres, SQLAlchemy, Alembic, Stripe SDK, AWS SDK (`boto3`), AWS Amplify, Next.js, Zustand, React Router, Radix UI, Shadcn. Each will be justified on a row of its own when the version that needs it arrives.

---

## 8. Changelog

| Date | Change |
|---|---|
| 2026-04-23 | Initial stack pinned for V1: FastAPI 0.136.0, aiomqtt 2.5.1, uvicorn 0.45.0 on the server; React 19.2.0 + Vite 8.0.9 + TypeScript 6.0.3 + Tailwind 4.2.4 + MUI 9.0.0 + GSAP 3.15.0 on the web. |
