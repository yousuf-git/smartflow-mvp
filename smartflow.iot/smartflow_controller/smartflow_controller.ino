/*
  SmartFlow IoT Controller | AWS IoT MQTT Firmware
  Author : Muahammad Yousuf
  Version: V1.4
  Last Updated: 2026-04-29 

  Connects to AWS IoT Core via MQTT over TLS, receives dispense commands
  from the SmartFlow backend, and streams real-time flow progress back.

  ── Hardware ──────────────────────────────────────────────────────────────────
  ESP32 (38-pin or 30-pin devkit)
  Relay  : GPIO 5   (HIGH = open, LOW = closed)
  YF-S201: GPIO 27  (FALLING edge pulse, INPUT_PULLUP)

  ── MQTT Topics (controller = DEV-001) ───────────────────────────────────────
  Subscribe : smartflow/cmd/DEV-001
  Publish   : smartflow/ack/DEV-001
              smartflow/progress/DEV-001

  ── Command payload (server → ESP32) ─────────────────────────────────────────
  START: { "id": <cane_id>, "tap_id": <int>, "action": "START", "litres": <float> }
  STOP : { "id": <cane_id>, "tap_id": <int>, "action": "STOP" }

  ── ACK payload (ESP32 → server) ─────────────────────────────────────────────
  { "id": <cane_id>, "status": "accepted"|"rejected", "reason": "<str>" }

  ── Progress payload (ESP32 → server) ────────────────────────────────────────
  { "id": <cane_id>, "litres": <float>, "status": "dispensing"|"complete"|"failed"|"stopped_early", "reason": "<str>" }

  ── Libraries (to install via Arduino Library Manager) ──────────────────────────
  • PubSubClient  by Nick O'Leary    (tested 2.8.0)
  • ArduinoJson   by Benoit Blanchon (tested 7.x)
*/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include "secrets.h"

// ─── Identity & Network ───────────────────────────────────────────────────────
#define CONTROLLER_NAME  "DEV-001"
#define MQTT_CLIENT_ID   "smartflow-esp32-v1"

#define WIFI_SSID        "Flash Fiber 4G"
#define WIFI_PASSWORD    "password"

// ─── AWS IoT ──────────────────────────────────────────────────────────────────
#define AWS_IOT_ENDPOINT "a2wpfjlsyv6clp-ats.iot.us-east-2.amazonaws.com"
#define AWS_IOT_PORT     8883

// ─── Topics ───────────────────────────────────────────────────────────────────
#define CMD_TOPIC      "smartflow/cmd/"      CONTROLLER_NAME
#define ACK_TOPIC      "smartflow/ack/"      CONTROLLER_NAME
#define PROGRESS_TOPIC "smartflow/progress/" CONTROLLER_NAME

// ─── Hardware pins ────────────────────────────────────────────────────────────
#define RELAY_PIN   25
#define SENSOR_PIN  27

// DB tap_id that maps to this physical tap
#define TAP_ID 1

// ─── Flow calibration ─────────────────────────────────────────────────────────
// YF-S201: measured 600 pulses for 1.5 L → 400 pulses/L. Recalibrate if needed.
// This factor converts pulse count to water volume: litres = pulses / CALIBRATION_FACTOR
#define CALIBRATION_FACTOR  350.0f  // 400.0f

// ─── Timing ───────────────────────────────────────────────────────────────────
#define PROGRESS_INTERVAL_MS  1000    // 1 sec
#define MQTT_RECONNECT_MS     5000

// ─── State ───────────────────────────────────────────────────────────────────
// g_cane_id: identifier for the current dispense job from backend
// g_target: total water volume (litres) to dispense for current job
// g_delivered: cumulative water volume (litres) dispensed so far in current job
// g_active: true when relay is open and actively dispensing
// g_last_report: timestamp of last progress update, used to throttle MQTT updates
// g_last_mqtt_try: timestamp of last connection attempt, used for exponential backoff
int           g_cane_id       = 0;
float         g_target        = 0.0f;
float         g_delivered     = 0.0f;
bool          g_active        = false;
unsigned long g_last_report   = 0;
unsigned long g_last_mqtt_try = 0;

// g_pulses: volatile counter of flow sensor pulses, incremented in ISR
// ISR reads pulses each loop cycle and converts to volume via CALIBRATION_FACTOR
volatile unsigned long g_pulses = 0;

// ISR fires on FALLING edge of flow sensor. Each pulse ≈ 1/CALIBRATION_FACTOR litres
void IRAM_ATTR onPulse() { g_pulses++; }

// ─── MQTT client ─────────────────────────────────────────────────────────────
WiFiClientSecure net;
PubSubClient     mqtt(net);

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Publish JSON ACK to backend acknowledging command receipt and status
void publishAck(int cane_id, const char* status, const char* reason = nullptr) {
  StaticJsonDocument<128> doc;
  doc["id"]     = cane_id;
  doc["status"] = status;
  if (reason != nullptr) doc["reason"] = reason;
  char buf[128];
  serializeJson(doc, buf);
  mqtt.publish(ACK_TOPIC, buf);
  Serial.printf("[ACK] cane=%d  status=%s  reason=%s\n",
                cane_id, status, reason ? reason : "-");
}

// Publish real-time progress of current dispense job: volume delivered & status
void publishProgress(int cane_id, float litres, const char* status,
                     const char* reason = nullptr) {
  StaticJsonDocument<128> doc;
  doc["id"]     = cane_id;
  doc["litres"] = litres;
  doc["status"] = status;
  if (reason != nullptr) doc["reason"] = reason;
  char buf[128];
  serializeJson(doc, buf);
  mqtt.publish(PROGRESS_TOPIC, buf);
  Serial.printf("[PROGRESS] cane=%d  litres=%.3f  status=%s\n",
                cane_id, litres, status);
}

// Close relay (stop water flow), send final progress report, and reset state machine
void closeRelay(bool sendFinal, const char* finalStatus,
                const char* reason = nullptr) {
  digitalWrite(RELAY_PIN, LOW);
  if (sendFinal) {
    publishProgress(g_cane_id, g_delivered, finalStatus, reason);
  }
  Serial.printf("[RELAY] closed  cane=%d  delivered=%.3f  final=%s\n",
                g_cane_id, g_delivered, finalStatus ? finalStatus : "-");
  // Reset all dispense state for next job
  g_active    = false;
  g_cane_id   = 0;
  g_target    = 0.0f;
  g_delivered = 0.0f;
  g_pulses    = 0;
}

// ─── MQTT callback ────────────────────────────────────────────────────────────
// Handles incoming START/STOP commands from backend
void onMqttMessage(char* topic, byte* payload, unsigned int len) {
  if (len >= 256) {
    Serial.println("[CMD] payload too large — ignored");
    return;
  }
  char buf[257];
  memcpy(buf, payload, len);
  buf[len] = '\0';
  Serial.printf("[CMD] raw=%s\n", buf);

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, buf) != DeserializationError::Ok) {
    Serial.println("[CMD] JSON parse error — ignored");
    return;
  }

  if (!doc.containsKey("id") || !doc.containsKey("tap_id") ||
      !doc.containsKey("action")) {
    Serial.println("[CMD] missing id/tap_id/action — ignored");
    return;
  }

  int         cane_id = doc["id"].as<int>();
  int         tap_id  = doc["tap_id"].as<int>();
  const char* action  = doc["action"].as<const char*>();

  // Reject command if not destined for this physical tap
  if (tap_id != TAP_ID) {
    Serial.printf("[CMD] tap_id=%d not handled — rejected\n", tap_id);
    publishAck(cane_id, "rejected", "unknown_tap");
    return;
  }

  // ── START: Open relay and begin dispensing to target volume ─────────────────
  if (strcmp(action, "START") == 0) {
    // Reject if already dispensing (prevent overlapping jobs)
    if (g_active) {
      publishAck(cane_id, "rejected", "tap_busy");
      return;
    }
    // Extract target volume from command
    float litres = doc["litres"] | 0.0f;
    if (litres <= 0.0f) {
      publishAck(cane_id, "rejected", "invalid_litres");
      return;
    }

    // Initialize dispense job: set target, reset pulse/volume counters, open relay
    g_cane_id     = cane_id;
    g_target      = litres;
    g_delivered   = 0.0f;
    g_pulses      = 0;
    g_last_report = millis();
    g_active      = true;
    digitalWrite(RELAY_PIN, HIGH);

    publishAck(cane_id, "accepted");
    Serial.printf("[RELAY] open  cane=%d  target=%.2fL\n", cane_id, litres);

  // ── STOP: Interrupt dispensing early (e.g., manual stop, error condition) ───
  } else if (strcmp(action, "STOP") == 0) {
    // Ignore STOP if not currently dispensing or if job ID doesn't match
    if (!g_active || g_cane_id != cane_id) {
      Serial.printf("[CMD] STOP ignored: idle or cane mismatch\n");
      return;
    }
    // Read and clear pulse counter atomically (ISR might fire during read)
    noInterrupts();
    unsigned long p = g_pulses;
    g_pulses = 0;
    interrupts();
    // Convert remaining pulses to volume and add to cumulative delivered
    g_delivered += p / CALIBRATION_FACTOR;

    closeRelay(true, "stopped_early", "server_stop");

  } else {
    Serial.printf("[CMD] unknown action=%s — ignored\n", action);
  }
}

// ─── WiFi ─────────────────────────────────────────────────────────────────────
// Establish WiFi connection to access point (blocking)
void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WIFI] connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[WIFI] connected  IP=%s\n",
                WiFi.localIP().toString().c_str());
}

// ─── NTP time sync ────────────────────────────────────────────────────────────
// TLS cert validation requires an accurate clock. ESP32 boots at epoch 0
// (Jan 1 1970) which is before the cert issuance date — causing silent
// TLS failure (rc=-4). Must sync before opening any TLS connection.
void syncTime() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("[TIME] syncing");
  time_t now = time(nullptr);
  while (now < 1000000000UL) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
  }
  Serial.printf("\n[TIME] synced  epoch=%lu\n", (unsigned long)now);
}

// ─── MQTT connect (non-blocking retry) ───────────────────────────────────────
// Attempt MQTT connection with backoff throttling; succeeds silently if already connected
void tryConnectMqtt() {
  if (mqtt.connected()) return;
  unsigned long now = millis();
  if (now - g_last_mqtt_try < MQTT_RECONNECT_MS) return;
  g_last_mqtt_try = now;

  Serial.print("[MQTT] connecting...");
  if (mqtt.connect(MQTT_CLIENT_ID)) {
    mqtt.subscribe(CMD_TOPIC, 1);
    Serial.printf("connected  subscribed=%s\n", CMD_TOPIC);
  } else {
    Serial.printf("[MQTT] connection failed  rc=%d\n", mqtt.state());
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[BOOT] SmartFlow Controller starting...");

  // Configure relay output (LOW = valve closed, HIGH = valve open)
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  // Configure flow sensor input with ISR on FALLING edge (each pulse = ~1/350 L)
  pinMode(SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(SENSOR_PIN), onPulse, FALLING);

  connectWifi();
  syncTime();

  // Load AWS certificates and keys from secrets.h for TLS handshake
  net.setCACert(AWS_CA_CERT);
  net.setCertificate(AWS_DEVICE_CERT);
  net.setPrivateKey(AWS_PRIVATE_KEY);
  net.setHandshakeTimeout(30);   // default 10 s is too tight for AWS IoT TLS
  net.setHandshakeTimeout(30);   // default 10 s is too tight for AWS IoT TLS

  // Initialize MQTT client with AWS IoT broker
  mqtt.setServer(AWS_IOT_ENDPOINT, AWS_IOT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(60);
  mqtt.setSocketTimeout(30);     // wait up to 30 s for CONNACK
  mqtt.setBufferSize(512);

  // Block until initial MQTT connection succeeds (required before loop())
  Serial.print("[MQTT] initial connect...");
  while (!mqtt.connect(MQTT_CLIENT_ID)) {
    Serial.printf("failed rc=%d, retry in 5s\n", mqtt.state());
    delay(5000);
  }
  mqtt.subscribe(CMD_TOPIC, 1);
  Serial.printf("connected  subscribed=%s\n", CMD_TOPIC);

  Serial.println("[BOOT] ready.");
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
// Main state machine: maintain MQTT connection, accumulate flow, and report progress
void loop() {
  tryConnectMqtt();
  mqtt.loop();

  // Exit early if not dispensing
  if (!g_active) return;

  // ── Volume Calculation from Pulses ──────────────────────────────────────────
  // 1. Read pulse counter atomically (ISR increments this ~350 times per litre)
  // 2. Clear counter to measure next batch of pulses in next loop cycle
  // 3. Convert pulses to litres: volume = pulses / CALIBRATION_FACTOR (350 pulses/L)
  // 4. Accumulate into g_delivered for total volume dispensed so far
  noInterrupts();
  unsigned long pulses = g_pulses;
  g_pulses = 0;
  interrupts();

  g_delivered += pulses / CALIBRATION_FACTOR;

  // ── Completion Check: Stop if target reached ──────────────────────────────

  if (g_delivered >= g_target) {
    g_delivered = g_target;
    closeRelay(true, "complete");
    return;
  }

  // ── Throttled Progress Reporting: Update backend every ~1 second ───────────
  unsigned long now = millis();
  if (now - g_last_report >= PROGRESS_INTERVAL_MS) {
    publishProgress(g_cane_id, g_delivered, "dispensing");
    g_last_report = now;
  }
}
