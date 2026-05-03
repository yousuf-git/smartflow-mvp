# MQTT Connection — Setup, Flow & Issues

## Stack

| Component | Detail |
|---|---|
| Broker | AWS IoT Core |
| Client lib | aiomqtt 2.5.1 (wraps paho-mqtt) |
| Protocol | MQTT 3.1.1 over TLS |
| Auth | Mutual TLS (X.509 certificates) |
| Module | `app/mqtt.py` → `MQTTClient` class |
| Client ID | `smartflow-server-v1` (local), `smartflow-server-heroku` (Heroku) |

## Topics

| Topic | Direction | Payload |
|---|---|---|
| `smartflow/cmd/{controller}` | server → device | `{id, tap_id, action, litres?}` |
| `smartflow/ack/{controller}` | device → server | `{id, status, reason?}` |
| `smartflow/progress/{controller}` | device → server | `{id, litres, status, reason?}` |

`id` = `Purchase.id` (integer). `controller` = `CONTROLLER_NAME` env var (e.g. `DEV-001`).

## Connection Flow

```
startup (lifespan)
  → init_mqtt_client(settings)
  → mqtt.start()
    → asyncio.create_task(_run())

_run() loop:
  1. Build SSL context (CA + cert + key)
  2. Set ALPN if port 443
  3. Create aiomqtt.Client(keepalive=30)
  4. async with client:
       subscribe to ack + progress topics
       set _ready event
       async for message in client.messages → _dispatch()
  5. On disconnect: exponential backoff (5s → 60s, reset after 30s uptime)
  6. On CancelledError: exit cleanly
```

## TLS / Certificate Setup

### Local

Certs live in `smartflow.server/certs/local/`:
- `AmazonRootCA1.pem` — CA
- `*-certificate.pem.crt` — device cert
- `*-private.pem.key` — private key

Paths set in `.env`:
```
AWS_IOT_CA_PATH=certs/local/AmazonRootCA1.pem
AWS_IOT_CERT_PATH=certs/local/...-certificate.pem.crt
AWS_IOT_KEY_PATH=certs/local/...-private.pem.key
```

### Heroku

Heroku has no persistent filesystem. Certs are base64-encoded into config vars:

```
AWS_IOT_CA_B64=<base64 of AmazonRootCA1.pem>
AWS_IOT_CERT_B64=<base64 of certificate.pem.crt>
AWS_IOT_KEY_B64=<base64 of private.pem.key>
```

At startup, `config.py:materialize_certs()` decodes these into `/tmp/` files and sets `AWS_IOT_CA_PATH`, `AWS_IOT_CERT_PATH`, `AWS_IOT_KEY_PATH` on the Settings object.

Heroku certs are in `smartflow.server/certs/heroku/` (not deployed — only used to generate the base64 values).

## Port 443 + ALPN

AWS IoT Core listens on ports 8883 (standard MQTTS) and 443 (HTTPS/MQTT multiplexed). Heroku's outbound firewall blocks 8883, so we use port 443 with ALPN protocol `x-amzn-mqtt-ca` to tell AWS IoT we want MQTT, not HTTPS.

```python
if s.AWS_IOT_PORT == 443:
    ssl_ctx.set_alpn_protocols(["x-amzn-mqtt-ca"])
```

Config: `AWS_IOT_PORT=443`.

## AWS IoT Policy

Policy must allow both client IDs and all relevant topics:

```json
{
  "Effect": "Allow",
  "Action": "iot:Connect",
  "Resource": [
    "arn:aws:iot:us-east-2:*:client/smartflow-server-v1",
    "arn:aws:iot:us-east-2:*:client/smartflow-server-heroku"
  ]
}
```

Plus `iot:Subscribe`, `iot:Receive`, `iot:Publish` on `smartflow/*` topics.

## Heroku Config Vars (MQTT-related)

```
AWS_IOT_ENDPOINT=a2wpfjlsyv6clp-ats.iot.us-east-2.amazonaws.com
AWS_IOT_PORT=443
AWS_IOT_CLIENT_ID=smartflow-server-heroku
AWS_IOT_CA_B64=...
AWS_IOT_CERT_B64=...
AWS_IOT_KEY_B64=...
CONTROLLER_NAME=DEV-001
```

---

## Issues Encountered & Fixes

### 1. Port 8883 Blocked on Heroku

**Symptom:** MQTT connection timeout on Heroku, works locally.

**Cause:** Heroku's outbound NAT/firewall blocks non-standard ports. Port 8883 (MQTTS) is blocked.

**Fix:** Switch to port 443 with ALPN protocol `x-amzn-mqtt-ca`.

**Commit:** `a0c1d46 feat(server): support MQTT over port 443 with ALPN for Heroku`

---

### 2. SSL Context Misconfigured

**Symptom:** `ssl.SSLError` or connection refused after switching to port 443.

**Cause:** Used `ssl.SSLContext()` (empty) instead of `ssl.create_default_context()`. Missing CA verification chain.

**Fix:** Use `ssl.create_default_context(cafile=...)` which loads system CAs and sets proper verification.

**Commit:** `e980aa3 fix(server): use default SSL context for MQTT, add timeout param`

---

### 3. aiomqtt `timeout` Parameter Error

**Symptom:** `TypeError` on `aiomqtt.Client()` — unexpected keyword argument `timeout`.

**Cause:** aiomqtt 2.5.1 doesn't accept a `timeout` parameter in constructor. Keepalive is the mechanism for connection liveness, not a separate timeout.

**Fix:** Remove `timeout` parameter. Increase `keepalive` instead.

**Commit:** `e207385 fix(server): remove timeout param and increase keepalive to prevent DUPLICATE_CLIENTID`

---

### 4. Paho Auto-Reconnect (Red Herring)

**Symptom:** Suspected paho-mqtt's internal reconnect was racing with aiomqtt's reconnect loop.

**Cause:** Investigation showed aiomqtt already sets `reconnect_on_failure=False` on the underlying paho client (aiomqtt/client.py line 294). Manual override was redundant.

**Fix:** Removed redundant `reconnect_on_failure=False` override since aiomqtt handles it.

**Commit:** `40a7f02 fix(server): disable paho auto-reconnect causing DUPLICATE_CLIENTID loop`  
**Followup:** `3b34b02 fix(server): set reconnect_on_failure=False before connection, not after` (also removed in final cleanup)

---

### 5. Keepalive Too High (1200s)

**Symptom:** Connection drops after ~60s on Heroku. Reconnect succeeds but drops again.

**Cause:** Heroku terminates idle outbound TCP connections after ~55-60s. With `keepalive=1200`, no PINGREQ is sent for 20 minutes — Heroku kills the connection long before that.

**Fix:** Set `keepalive=30`. MQTT sends PINGREQ every 30s, keeping TCP alive through Heroku's NAT.

---

### 6. Uvicorn Multiple Workers — THE ROOT CAUSE

**Symptom:** MQTT connection cycles healthy → down → healthy → down endlessly. Logs show two `mqtt.connected` messages within milliseconds, two different `self=` addresses, two `Application startup complete` lines.

**Cause:** Uvicorn on Heroku (Python 3.12) defaulted to 2 workers when no `--workers` flag was set. Each worker ran its own FastAPI lifespan → its own `MQTTClient` → its own `_run()` task. Both connected with the same `AWS_IOT_CLIENT_ID`. AWS IoT enforces unique client IDs — when the second connection arrives, it disconnects the first (`DUPLICATE_CLIENTID`). The first reconnects, disconnecting the second. Infinite loop.

**Diagnosis clues:**
- Two different `self=` memory addresses in `mqtt.start` logs
- Two `Application startup complete` messages
- Sleep wasn't being "bypassed" — two tasks interleaved their logs
- 9ms between "reconnecting" and "connected" logs = second task connecting, not first task skipping sleep

**Fix:** Add `--workers 1` to Procfile:
```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
```

This was the definitive fix. All other changes (keepalive, SSL context) were prerequisites, but the disconnect loop was caused entirely by duplicate workers.

---

## Final Working Configuration

```python
# mqtt.py — _run() core
ssl_ctx = ssl.create_default_context(cafile=s.AWS_IOT_CA_PATH)
ssl_ctx.load_cert_chain(s.AWS_IOT_CERT_PATH, s.AWS_IOT_KEY_PATH)
if s.AWS_IOT_PORT == 443:
    ssl_ctx.set_alpn_protocols(["x-amzn-mqtt-ca"])

mqtt_client = aiomqtt.Client(
    hostname=s.AWS_IOT_ENDPOINT,
    port=s.AWS_IOT_PORT,
    identifier=s.AWS_IOT_CLIENT_ID,
    tls_context=ssl_ctx,
    keepalive=30,
)
```

```
# Procfile
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
```

## Debugging Commands

```bash
# Check Heroku logs for MQTT
heroku logs --tail --app smartflow-mvp | grep mqtt

# Verify single worker
heroku logs --app smartflow-mvp | grep "Application startup complete"
# Should show exactly ONE line per deploy

# Check AWS IoT connection
heroku logs --app smartflow-mvp | grep "mqtt.connected"

# Test MQTT locally
mosquitto_pub -h <endpoint> -p 443 --cafile certs/local/AmazonRootCA1.pem \
  --cert certs/local/*-certificate.pem.crt --key certs/local/*-private.pem.key \
  --alpn x-amzn-mqtt-ca -t "smartflow/ack/DEV-001" -m '{"id":1,"status":"accepted"}'
```
