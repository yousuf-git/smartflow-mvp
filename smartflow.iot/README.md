# SmartFlow IoT Controller — Firmware Guide

ESP32 firmware that connects to **AWS IoT Core** via MQTT over TLS, receives dispense commands from the SmartFlow backend, and streams real-time flow progress back.

---

## Directory layout

```
smartflow.iot/
├── smartflow_controller/              ← Arduino sketch folder (name must match .ino)
│   ├── smartflow_controller.ino       ← main firmware
│   ├── secrets.h                      ← TLS credentials (gitignored)
│   └── certs/                         ← raw cert files from AWS Console
│       ├── AmazonRootCA1.pem
│       ├── *-certificate.pem.crt
│       └── *-private.pem.key
├── control_waterflow_via_websocket.ino  ← original prototype (WebSocket, single tap)
├── .gitignore
└── README.md
```

---

## 1 · Hardware

| Component | Part | Notes |
|---|---|---|
| Microcontroller | ESP32 (30-pin or 38-pin devkit) | Dual-core, Wi-Fi built-in |
| Flow sensor | YF-S201 | Hall-effect, 400 pulses/litre |
| Relay module | 5 V single-channel relay | Normally-open |
| Water pump | Any 12 V submersible pump | Controlled via relay |

### GPIO wiring

| ESP32 GPIO | Connected to | Purpose |
|---|---|---|
| **5** | Relay IN | Open/close valve |
| **27** | YF-S201 signal | Pulse count |
| 3V3 | Relay VCC (logic) | |
| 5V (VIN) | YF-S201 VCC | Sensor requires 5 V |
| GND | Relay GND + Sensor GND | Common ground |

> **Relay logic:** `HIGH` opens the valve, `LOW` closes it. If your relay
> module is active-low, swap `HIGH`/`LOW` for `RELAY_PIN` in the sketch.

---

## 2 · Software prerequisites

### Arduino IDE

1. Download **Arduino IDE 2.x** from [arduino.cc](https://www.arduino.cc/en/software).
2. Add ESP32 board support:
   - `File → Preferences → Additional boards manager URLs`:
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - `Tools → Board → Boards Manager` → search **esp32** by Espressif → Install.
3. Select board: `Tools → Board → esp32 → ESP32 Dev Module`
4. Select port: `Tools → Port → COMx` (Windows) or `/dev/ttyUSB0` (Linux/Mac)

### Libraries

Install from `Sketch → Include Library → Manage Libraries`:

| Library | Author | Version |
|---|---|---|
| **PubSubClient** | Nick O'Leary | 2.8.0 |
| **ArduinoJson** | Benoit Blanchon | 7.x |

---

## 3 · Credentials

Device certificates are stored in `smartflow_controller/certs/` and already
embedded in `secrets.h` (the three `R"(...)"` string constants).

| Constant in `secrets.h` | Source file |
|---|---|
| `AWS_CA_CERT` | `AmazonRootCA1.pem` |
| `AWS_DEVICE_CERT` | `*-certificate.pem.crt` |
| `AWS_PRIVATE_KEY` | `*-private.pem.key` |

No manual steps needed — `secrets.h` is ready to use.

---

## 4 · Configuration

Edit the `#define` block at the top of `smartflow_controller.ino`:

| Constant | Default | Description |
|---|---|---|
| `CONTROLLER_NAME` | `"DEV-001"` | Must match `CONTROLLER_NAME` in server `.env` |
| `MQTT_CLIENT_ID` | `"smartflow-esp32-v1"` | Unique device identifier |
| `WIFI_SSID` | `"YOUR_WIFI_SSID"` | 2.4 GHz network name |
| `WIFI_PASSWORD` | `"YOUR_WIFI_PASSWORD"` | Wi-Fi password |
| `TAP_ID` | `1` | DB tap ID this device handles (matches the seeded `Tap.id`) |
| `RELAY_PIN` | `5` | GPIO pin connected to relay IN |
| `SENSOR_PIN` | `27` | GPIO pin connected to YF-S201 signal wire |
| `CALIBRATION_FACTOR` | `400.0` | Pulses per litre for YF-S201 |
| `PROGRESS_INTERVAL_MS` | `1000` | Milliseconds between `dispensing` progress frames |

---

## 5 · Uploading the sketch

1. Open Arduino IDE.
2. `File → Open` → navigate to `smartflow.iot/smartflow_controller/` → open `smartflow_controller.ino`.
   `secrets.h` is in the same folder and is included automatically.
3. Click **Verify** (✓) — fix any missing-library errors via §2.
4. Connect ESP32 via USB.
5. Select the correct **Port** under `Tools → Port`.
6. Click **Upload** (→).
7. Open `Tools → Serial Monitor`, set baud to **115200**.

Expected boot output:

```
[BOOT] SmartFlow Controller starting...
[WIFI] connecting.....
[WIFI] connected  IP=192.168.x.x
[MQTT] initial connect...connected  subscribed=smartflow/cmd/DEV-001
[BOOT] ready.
```

---

## 6 · MQTT Protocol Reference

### Topics

| Topic | Direction | Description |
|---|---|---|
| `smartflow/cmd/DEV-001` | Server → ESP32 | Dispense commands |
| `smartflow/ack/DEV-001` | ESP32 → Server | Command acknowledgement |
| `smartflow/progress/DEV-001` | ESP32 → Server | Real-time flow progress |

### Command payload (server → ESP32)

```json
{ "id": 42, "tap_id": 1, "action": "START", "litres": 2.5 }
{ "id": 42, "tap_id": 1, "action": "STOP" }
```

| Field | Type | Notes |
|---|---|---|
| `id` | int | `Purchase.id` (cane ID) |
| `tap_id` | int | DB tap ID — 1 = Tap 1, 2 = Tap 2 |
| `action` | string | `"START"` or `"STOP"` |
| `litres` | float | Target volume — START only |

### ACK payload (ESP32 → server)

```json
{ "id": 42, "status": "accepted" }
{ "id": 42, "status": "rejected", "reason": "tap_busy" }
```

ACK must arrive within `ACK_TIMEOUT_SECONDS` (server `.env`, default 15 s).

| `status` | `reason` | Meaning |
|---|---|---|
| `accepted` | — | Relay opened, volume tracking started |
| `rejected` | `tap_busy` | Tap already running another cane |
| `rejected` | `unknown_tap` | `tap_id` not in firmware's tap map |
| `rejected` | `invalid_litres` | `litres ≤ 0` |

### Progress payload (ESP32 → server)

```json
{ "id": 42, "litres": 1.23, "status": "dispensing" }
{ "id": 42, "litres": 2.5,  "status": "complete" }
{ "id": 42, "litres": 1.23, "status": "stopped_early", "reason": "server_stop" }
{ "id": 42, "litres": 0.0,  "status": "failed",        "reason": "sensor_error" }
```

| `status` | Server result | Wallet effect |
|---|---|---|
| `dispensing` | Updates `litres_delivered` | None |
| `complete` | `Purchase → completed` | Debit written on ACK |
| `stopped_early` | `Purchase → partial_completed` | Credit for undelivered |
| `failed` | `Purchase → failed` | Credit for undelivered |

---

## 7 · Flow calibration

YF-S201 default: **400 pulses/litre** (measured at actual pump pressure).

To recalibrate:
1. Measure exactly 1 litre into a jug.
2. Dispense it and note the total pulse count in Serial Monitor.
3. Set `CALIBRATION_FACTOR = measured_pulses` and re-upload.

---

## 8 · Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `[MQTT] failed rc=-2` | No route to AWS | Check Wi-Fi; outbound port 8883 must be open |
| `[MQTT] failed rc=4` | Bad cert/key in `secrets.h` | Re-paste cert content; no trailing spaces |
| ACK timeout on server | MQTT publish dropped (QoS 0) | Retry the Start button — within `RETRY_LIMIT` window |
| Flow reads 0 L | Sensor wiring issue | Confirm sensor VCC = 5 V, signal wire on correct GPIO |
| Relay doesn't open | Active-low module | Swap `HIGH`/`LOW` for `relay_pin` in sketch |
| Serial garbled | Wrong baud rate | Set Serial Monitor to **115200** |
