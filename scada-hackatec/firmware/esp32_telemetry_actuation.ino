#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// Credenciales de Red Wi-Fi
const char* ssid = "TU_RED_WIFI";
const char* password = "TU_PASSWORD";

// Broker MQTT Público (HiveMQ)
const char* mqtt_server = "broker.hivemq.com";
const int mqtt_port = 1883;
const char* TOPIC_TELEMETRY = "hackatec/2026/scada/telemetry";
const char* TOPIC_COMMANDS = "hackatec/2026/scada/commands";
const char* TOPIC_ACK = "hackatec/2026/scada/ack";

// Definición de Pines de Actuadores y Sensores
const int PIN_RELAY_MOTOR = 26;
const int PIN_BUZZER = 27;
const int PIN_EXHAUST = 14;
const int PIN_MQ2_ANALOG = 34;

WiFiClient espClient;
PubSubClient client(espClient);
unsigned long lastMsg = 0;

void setup_wifi() {
  delay(10);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

void callback(char* topic, byte* message, unsigned int length) {
  StaticJsonDocument<256> doc;
  deserializeJson(doc, message, length);

  const char* actuator = doc["actuator"];
  const char* action = doc["action"];

  // Actuación: Caso 1 (Relevador Husillo)
  if (strcmp(actuator, "RELAY_CUTOFF") == 0) {
    if (strcmp(action, "TRIGGER") == 0) {
      digitalWrite(PIN_RELAY_MOTOR, LOW); // Corte de energía
    } else {
      digitalWrite(PIN_RELAY_MOTOR, HIGH);
    }
  }

  // Actuación: Caso 3 (Buzzer y Extractor)
  if (strcmp(actuator, "BUZZER") == 0) {
    digitalWrite(PIN_BUZZER, strcmp(action, "ACTIVATE") == 0 ? HIGH : LOW);
  }
  if (strcmp(actuator, "EXHAUST") == 0) {
    digitalWrite(PIN_EXHAUST, strcmp(action, "START") == 0 ? HIGH : LOW);
  }

  // Confirmación Sensorial / Teleproceso (Verificar)
  StaticJsonDocument<128> ackDoc;
  ackDoc["ack"] = true;
  ackDoc["actuator"] = actuator;
  ackDoc["status"] = action;
  char buffer[128];
  serializeJson(ackDoc, buffer);
  client.publish(TOPIC_ACK, buffer);
}

void reconnect() {
  while (!client.connected()) {
    String clientId = "ESP32_SCADA_" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      client.subscribe(TOPIC_COMMANDS);
    } else {
      delay(2000);
    }
  }
}

void setup() {
  pinMode(PIN_RELAY_MOTOR, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_EXHAUST, OUTPUT);
  digitalWrite(PIN_RELAY_MOTOR, HIGH);

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  unsigned long now = millis();
  // Transmitir cada 1.5 segundos
  if (now - lastMsg > 1500) {
    lastMsg = now;

    // 1. Medir
    int rawMq2 = analogRead(PIN_MQ2_ANALOG);
    float ppm = (rawMq2 / 4095.0) * 500.0;

    StaticJsonDocument<256> doc;
    doc["motorRpm"] = random(1750, 1850);
    doc["motorTemp"] = 32.5 + (random(0, 20) / 10.0);
    doc["relayCutoff"] = (digitalRead(PIN_RELAY_MOTOR) == LOW);
    doc["waterLevelMm"] = 45.0 + random(-2, 3);
    doc["secondaryLevelMm"] = 44.5 + random(-2, 3);
    doc["mq2Ppm"] = ppm;
    doc["buzzerActive"] = (digitalRead(PIN_BUZZER) == HIGH);
    doc["exhaustActive"] = (digitalRead(PIN_EXHAUST) == HIGH);

    // 2. Transmitir vía MQTT
    char jsonBuffer[256];
    serializeJson(doc, jsonBuffer);
    client.publish(TOPIC_TELEMETRY, jsonBuffer);
  }
}