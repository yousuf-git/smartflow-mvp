## SmartFlow MVP — Server (V1)

FastAPI backend that mediates between the web UI and the MQTT device on AWS IoT Core. See `../docs/versions/V1.md` for the full spec and `../docs/tech-stack/TECH_STACK.md` for pinned versions.

### Layout

```
smartflow.server/
├── app/
│   ├── config.py      # pydantic-settings, env-driven
│   ├── main.py        # FastAPI app + lifespan
│   ├── mqtt.py        # aiomqtt TLS client + topic helpers
│   ├── routes.py      # /api/dispense + /api/ws/dispense/{id} + /api/health
│   ├── schemas.py     # pydantic request/response models
│   └── sessions.py    # in-memory session registry
├── certs/             # AWS IoT cert/key (gitignored — add your own)
├── .env.example
├── .env               # your local config (gitignored)
└── requirements.txt
```

### Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then edit AWS IoT values + cert paths
mkdir -p certs                # drop AmazonRootCA1.pem + server cert + key here
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The server starts even without AWS IoT configured — it logs `mqtt.disabled reason=not-configured` and every `POST /api/dispense` will return 502 until creds are filled in. Useful for frontend dev against a stub.

### MQTT topics

All scoped to `DEVICE_ID` (default `DEV-001`):

- `smartflow/cmd/{device_id}` — server publishes `{id, action:"START", litres}`
- `smartflow/ack/{device_id}` — device publishes `{id, status:"accepted"|"rejected", reason?}`
- `smartflow/progress/{device_id}` — device publishes `{id, litres, status:"dispensing"|"complete"|"failed", reason?}`

For V1, publish ack + progress messages manually via Postman or the AWS IoT MQTT test client.

### HTTP API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/dispense` | Start a dispense. Returns 202 on ack, 409 on rejection, 504 on timeout, 502 on MQTT failure. |
| `WS`   | `/api/ws/dispense/{id}` | Stream `progress` frames until `complete` or `failed`. |
| `GET`  | `/api/health` | Liveness probe. |
| `GET`  | `/` | Service info. |

### Config

All via `.env` (see `.env.example`). Key knobs:

| Var | Default | Purpose |
|---|---|---|
| `AWS_IOT_ENDPOINT` | — | AWS IoT Core endpoint host |
| `AWS_IOT_CA_PATH` | — | Amazon root CA file |
| `AWS_IOT_CERT_PATH` | — | Server X.509 cert |
| `AWS_IOT_KEY_PATH` | — | Server private key |
| `DEVICE_ID` | `DEV-001` | Hardcoded single device in V1 |
| `ACK_TIMEOUT_SECONDS` | `5` | How long to wait for `ack` before returning 504 |
| `MAX_LITRES` | `100` | Safety cap on per-request litres |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
