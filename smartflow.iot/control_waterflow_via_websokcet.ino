#include <WiFi.h>
#include <ArduinoWebsockets.h>

#define RELAY_PIN 5
#define FLOW_SENSOR_PIN 27

using namespace websockets;

const char* ssid = "Team FCS RF 2.4G";
const char* password = "<pass>";

const char* websocket_server = "ws://192.168.1.42:8080/websocket";

WebsocketsClient client;

// ============== Flow sensor variable ==============
volatile unsigned long pulseCount = 0;

// ============== To Print Data ==============
unsigned long lastPrintTime = 0;
unsigned long previousMillis = 0;
const unsigned long interval = 1000; // 1 second

// ============== Flow measurement variables ==============
float flowRate = 0; // L/min
float flowMilliLitres = 0; // mL/s
float totalLitersPassed = 0;
float targetLiters = 0;
bool trackingVolume = false;

// Calibration (measured manually): 600 pulses for 1.5L = 400 pulses per liter
const float calibrationFactor = 350;   // 400.0; // pulses per liter

void IRAM_ATTR onFlowPulse() {
  pulseCount++;
}

void setup() {
  Serial.begin(115200);

  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);     // Initially turn off the relay

  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), onFlowPulse, FALLING);

  // ============== WiFi setup ==============
  WiFi.begin(ssid, password, 6);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected to WiFi");

  // ============== WebSocket setup ==============
  while (!client.connect(websocket_server)) {
    delay(500);
    Serial.println("Trying to connect to server.....");
  }
  Serial.println("WebSocket connection established!");
  client.send("ESP32_INITIAL_MESSAGE");

  // ============== Handling socket messages ==============
  
  client.onMessage([](WebsocketsMessage message) {
    Serial.print("Received Command: ");
    Serial.println(message.data());

    String command = message.data();
    command.trim();
    command.toLowerCase();

    if (command == "green") {
      digitalWrite(RELAY_PIN, HIGH);
      trackingVolume = false;
    } else if (command == "off") {
      digitalWrite(RELAY_PIN, LOW);
      trackingVolume = false;
    } else {
      // Handle float values like 0.5, 1.3 etc.
      float parsedValue = command.toFloat();
      if (parsedValue > 0) {
        targetLiters = parsedValue;
        pulseCount = 0;
        totalLitersPassed = 0;
        trackingVolume = true;
        digitalWrite(RELAY_PIN, HIGH);
        Serial.printf("Tracking started: target %.2f liters\n", targetLiters);
      }
    }
  });

  // ============== Handling socket events ==============
  client.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      Serial.println("Connected to server");
      client.send("ESP32_CONNECTED");
    } else if (event == WebsocketsEvent::ConnectionClosed) {
      Serial.println("Disconnected from server");
    }
  });

  previousMillis = millis();
}

void loop() {
  client.poll();    // Keep checking for message from socket

  // ============== Reporting Data every 1 second ==============
  if (trackingVolume) {
    unsigned long now = millis();
    
    if (now - lastPrintTime >= interval) {
      // Get pulses from last second
      unsigned long pulsesThisSecond = pulseCount;
      pulseCount = 0; // Reset counter
      
      // Calculate actual time elapsed for precision
      unsigned long actualInterval = now - previousMillis;
      previousMillis = now;
      
      // Calculate flow rate (L/min)
      // Scale for actual time interval and convert to L/min
      flowRate = ((1000.0 / actualInterval) * pulsesThisSecond * 60.0) / calibrationFactor;
      
      // Calculate flow in mL/s
      flowMilliLitres = (flowRate * 1000.0) / 60.0; // Convert L/min to mL/s
      
      // Update total liters passed
      totalLitersPassed += (pulsesThisSecond / calibrationFactor);
      
      // Print flow data every second
      Serial.print("Flow rate: ");
      Serial.print(flowMilliLitres, 1);
      Serial.print(" mL/s, ");
      Serial.print(flowRate, 2);
      Serial.print(" L/min");
      Serial.print(" | Total: ");
      Serial.print(totalLitersPassed, 3);
      Serial.println(" L");
      
      lastPrintTime = now;
    }
  }

  // Check if target volume reached
  if (trackingVolume && totalLitersPassed >= targetLiters) {
    Serial.println("Target liters reached. Turning off relay.");
    digitalWrite(RELAY_PIN, LOW);
    trackingVolume = false;
  }
}





/* 
============== Reference Notes ==============

------- GPIO Pins Modes -------

void pinMode(uint8_t pin, uint8_t mode);

The following modes are supported for the basic input and output:

- INPUT sets the GPIO as input without pullup or pulldown (high impedance).
- OUTPUT sets the GPIO as output/read mode.
- INPUT_PULLDOWN sets the GPIO as input with the internal pulldown.
- INPUT_PULLUP sets the GPIO as input with the internal pullup.






============== Reference Links ==============
1. https://docs.espressif.com/projects/arduino-esp32/en/latest/api/gpio.html
2. https://wiki.seeedstudio.com/Water-Flow-Sensor/

*/
