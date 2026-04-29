/*
  SmartFlow IoT Controller — AWS IoT MQTT Firmware
  Author : M. Yousuf
  Version: V1.3

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

  ── Libraries (install via Arduino Library Manager) ──────────────────────────
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

#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"

// ─── AWS IoT ──────────────────────────────────────────────────────────────────
#define AWS_IOT_ENDPOINT "a2wpfjlsyv6clp-ats.iot.us-east-2.amazonaws.com"
#define AWS_IOT_PORT     8883

// ─── Topics ───────────────────────────────────────────────────────────────────
#define CMD_TOPIC      "smartflow/cmd/"      CONTROLLER_NAME
#define ACK_TOPIC      "smartflow/ack/"      CONTROLLER_NAME
#define PROGRESS_TOPIC "smartflow/progress/" CONTROLLER_NAME

// ─── Hardware pins ────────────────────────────────────────────────────────────
#define RELAY_PIN   5
#define SENSOR_PIN  27

// DB tap_id that maps to this physical tap
#define TAP_ID 1

// ─── Flow calibration ─────────────────────────────────────────────────────────
// YF-S201: measured 600 pulses for 1.5 L → 400 pulses/L. Recalibrate if needed.
#define CALIBRATION_FACTOR 400.0f

// ─── Timing ───────────────────────────────────────────────────────────────────
#define PROGRESS_INTERVAL_MS  1000
#define MQTT_RECONNECT_MS     5000

// ─── State ───────────────────────────────────────────────────────────────────
int           g_cane_id       = 0;
float         g_target        = 0.0f;
float         g_delivered     = 0.0f;
bool          g_active        = false;
unsigned long g_last_report   = 0;
unsigned long g_last_mqtt_try = 0;

volatile unsigned long g_pulses = 0;

void IRAM_ATTR onPulse() { g_pulses++; }

// ─── MQTT client ─────────────────────────────────────────────────────────────
WiFiClientSecure net;
PubSubClient     mqtt(net);

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

void closeRelay(bool sendFinal, const char* finalStatus,
                const char* reason = nullptr) {
  digitalWrite(RELAY_PIN, LOW);
  if (sendFinal) {
    publishProgress(g_cane_id, g_delivered, finalStatus, reason);
  }
  Serial.printf("[RELAY] closed  cane=%d  delivered=%.3f  final=%s\n",
                g_cane_id, g_delivered, finalStatus ? finalStatus : "-");
  g_active    = false;
  g_cane_id   = 0;
  g_target    = 0.0f;
  g_delivered = 0.0f;
  g_pulses    = 0;
}

// ─── MQTT callback ────────────────────────────────────────────────────────────
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

  if (tap_id != TAP_ID) {
    Serial.printf("[CMD] tap_id=%d not handled — rejected\n", tap_id);
    publishAck(cane_id, "rejected", "unknown_tap");
    return;
  }

  // ── START ──────────────────────────────────────────────────────────────────
  if (strcmp(action, "START") == 0) {
    if (g_active) {
      publishAck(cane_id, "rejected", "tap_busy");
      return;
    }
    float litres = doc["litres"] | 0.0f;
    if (litres <= 0.0f) {
      publishAck(cane_id, "rejected", "invalid_litres");
      return;
    }

    g_cane_id     = cane_id;
    g_target      = litres;
    g_delivered   = 0.0f;
    g_pulses      = 0;
    g_last_report = millis();
    g_active      = true;
    digitalWrite(RELAY_PIN, HIGH);

    publishAck(cane_id, "accepted");
    Serial.printf("[RELAY] open  cane=%d  target=%.2fL\n", cane_id, litres);

  // ── STOP ───────────────────────────────────────────────────────────────────
  } else if (strcmp(action, "STOP") == 0) {
    if (!g_active || g_cane_id != cane_id) {
      Serial.printf("[CMD] STOP ignored: idle or cane mismatch\n");
      return;
    }
    noInterrupts();
    unsigned long p = g_pulses;
    g_pulses = 0;
    interrupts();
    g_delivered += p / CALIBRATION_FACTOR;

    closeRelay(true, "stopped_early", "server_stop");

  } else {
    Serial.printf("[CMD] unknown action=%s — ignored\n", action);
  }
}

// ─── WiFi ─────────────────────────────────────────────────────────────────────
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
    Serial.printf("failed  rc=%d\n", mqtt.state());
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[BOOT] SmartFlow Controller starting...");

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);

  pinMode(SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(SENSOR_PIN), onPulse, FALLING);

  connectWifi();
  syncTime();

  net.setCACert(AWS_CA_CERT);
  net.setCertificate(AWS_DEVICE_CERT);
  net.setPrivateKey(AWS_PRIVATE_KEY);
  net.setHandshakeTimeout(30);   // default 10 s is too tight for AWS IoT TLS

  mqtt.setServer(AWS_IOT_ENDPOINT, AWS_IOT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setKeepAlive(60);
  mqtt.setSocketTimeout(30);     // wait up to 30 s for CONNACK
  mqtt.setBufferSize(512);

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
void loop() {
  tryConnectMqtt();
  mqtt.loop();

  if (!g_active) return;

  noInterrupts();
  unsigned long pulses = g_pulses;
  g_pulses = 0;
  interrupts();

  g_delivered += pulses / CALIBRATION_FACTOR;

  if (g_delivered >= g_target) {
    g_delivered = g_target;
    closeRelay(true, "complete");
    return;
  }

  unsigned long now = millis();
  if (now - g_last_report >= PROGRESS_INTERVAL_MS) {
    publishProgress(g_cane_id, g_delivered, "dispensing");
    g_last_report = now;
  }
}
