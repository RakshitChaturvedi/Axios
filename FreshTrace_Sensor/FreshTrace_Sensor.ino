#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <SensirionI2CSgp41.h>
#include <VOCGasIndexAlgorithm.h>
#include <NOxGasIndexAlgorithm.h>

#include "secrets.h"

// ESP32-S3 Default I2C GPIOs
#define I2C_SDA 8
#define I2C_SCL 9

// Sensor Instances
Adafruit_BME280 bme;
SensirionI2CSgp41 sgp41;
VOCGasIndexAlgorithm voc_algorithm;
NOxGasIndexAlgorithm nox_algorithm;

// Networking
WiFiClientSecure netClient;
PubSubClient mqttClient(netClient);

bool bmeFound = false;
bool sgpFound = false;
uint8_t bmeAddress = 0x76;

uint16_t conditioning_s = 10;
uint16_t algorithm_warmup_s = 45;

unsigned long lastMqttPublish = 0;
const unsigned long MQTT_PUBLISH_INTERVAL_MS = 1000; // Publish to AWS every 1 second

void scanI2C() {
  Serial.println("\n-------------------------------------------");
  Serial.println("Scanning I2C bus (SDA: GPIO8, SCL: GPIO9)...");
  byte count = 0;
  for (byte address = 1; address < 127; ++address) {
    Wire.beginTransmission(address);
    byte error = Wire.endTransmission();
    if (error == 0) {
      Serial.printf(" [OK] Device detected at address 0x%02X", address);
      if (address == 0x76 || address == 0x77) {
        Serial.printf(" -> BME280 detected!\n");
        bmeAddress = address;
      } else if (address == 0x59) {
        Serial.printf(" -> SGP41 VOC/NOx sensor detected!\n");
        sgpFound = true;
      } else {
        Serial.printf(" -> Other I2C device\n");
      }
      count++;
    }
  }
  Serial.printf("Scan complete. Found %d device(s).\n", count);
  Serial.println("-------------------------------------------\n");
}

void connectToWiFi() {
  Serial.printf("\n[Wi-Fi] Connecting to SSID: '%s'...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 15000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[Wi-Fi] SUCCESS! Connected. IP: %s (Signal RSSI: %d dBm)\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());

    // CRITICAL: Synchronize real-world time via NTP.
    // AWS IoT X.509 certificates reject the connection if the ESP32 clock is at default 1970!
    Serial.print("[Time] Syncing clock with NTP for AWS TLS validation");
    configTime(19800, 0, "pool.ntp.org", "time.google.com");
    time_t now = time(nullptr);
    unsigned long ntpStart = millis();
    while (now < 1700000000 && millis() - ntpStart < 6000) {
      delay(500);
      Serial.print(".");
      now = time(nullptr);
    }
    if (now > 1700000000) {
      Serial.println(" Synchronized!");
    } else {
      Serial.println(" Timeout (Proceeding...)");
    }
  } else {
    wl_status_t st = WiFi.status();
    Serial.printf("\n[Wi-Fi] FAILED to connect (Status code: %d). ", st);
    if (st == WL_NO_SSID_AVAIL) {
      Serial.println("Reason: SSID NOT FOUND. If using a phone hotspot, make sure 'Maximize Compatibility' (2.4 GHz) is ON!");
    } else if (st == WL_CONNECT_FAILED) {
      Serial.println("Reason: Incorrect password.");
    } else {
      Serial.println("Reason: Check router band (must be 2.4 GHz, not 5 GHz only).");
    }
  }
}

void connectToAWS() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  // Configure TLS X.509 mutual authentication
  netClient.setCACert(AWS_CERT_CA);
  netClient.setCertificate(AWS_CERT_CRT);
  netClient.setPrivateKey(AWS_CERT_PRIVATE);
  netClient.setTimeout(25);

  mqttClient.setBufferSize(512);
  mqttClient.setSocketTimeout(25);

  // 1. Try standard MQTT port 8883 first
  Serial.printf("[AWS IoT] Connecting to %s:8883 as '%s'...", AWS_IOT_ENDPOINT, THING_NAME);
  mqttClient.setServer(AWS_IOT_ENDPOINT, 8883);

  uint8_t retries = 0;
  while (!mqttClient.connected() && retries < 3) {
    Serial.print(".");
    if (mqttClient.connect(THING_NAME)) {
      Serial.println(" CONNECTED TO AWS IOT CORE!");
      Serial.printf("[AWS IoT] Streaming to topic: %s\n", AWS_IOT_TOPIC);
      return;
    }
    retries++;
    delay(1000);
  }

  // 2. If port 8883 timed out (frequent on mobile carriers/hotspots blocking 8883),
  // fallback to Port 443 using AWS ALPN (Application-Layer Protocol Negotiation)
  if (!mqttClient.connected()) {
    Serial.printf("\n[AWS IoT] Port 8883 failed. Trying Port 443 (ALPN bypass)...");
    static const char *alpnProtocols[] = {"x-amzn-mqtt-ca", NULL};
    netClient.setAlpnProtocols(alpnProtocols);
    mqttClient.setServer(AWS_IOT_ENDPOINT, 443);

    retries = 0;
    while (!mqttClient.connected() && retries < 3) {
      Serial.print(".");
      if (mqttClient.connect(THING_NAME)) {
        Serial.println(" CONNECTED TO AWS IOT CORE (via Port 443)!");
        Serial.printf("[AWS IoT] Streaming to topic: %s\n", AWS_IOT_TOPIC);
        return;
      }
      retries++;
      delay(1000);
    }
  }

  int st = mqttClient.state();
  Serial.printf("\n[AWS IoT] Connect failed (Error state %d: ", st);
  switch (st) {
    case -4: Serial.println("CONNECTION_TIMEOUT: Check endpoint & hotspot firewall)"); break;
    case -3: Serial.println("CONNECTION_LOST)"); break;
    case -2: Serial.println("CONNECT_FAILED: Check TLS certificates & NTP time)"); break;
    case -1: Serial.println("DISCONNECTED)"); break;
    case 1:  Serial.println("BAD_PROTOCOL)"); break;
    case 2:  Serial.println("BAD_CLIENT_ID: ThingName conflict)"); break;
    case 5:  Serial.println("UNAUTHORIZED: Check AWS IoT Policy attached to Cert)"); break;
    default: Serial.println("Unknown error)"); break;
  }
}

void publishTelemetryToAWS(float temp, float hum, float press, uint16_t vocRaw, uint16_t noxRaw, int32_t vocIdx, int32_t noxIdx) {
  if (!mqttClient.connected()) {
    return;
  }

  JsonDocument doc;
  doc["device_id"] = THING_NAME;
  doc["food_type"] = "tomato";
  doc["temperature_c"] = serialized(String(temp, 2));
  doc["humidity_pct"] = serialized(String(hum, 2));
  doc["pressure_hpa"] = serialized(String(press, 2));
  doc["voc_raw"] = vocRaw;
  doc["nox_raw"] = noxRaw;
  doc["voc_index"] = vocIdx;
  doc["nox_index"] = noxIdx;
  doc["wifi_rssi"] = WiFi.RSSI();

  char jsonBuffer[512];
  serializeJson(doc, jsonBuffer);

  if (mqttClient.publish(AWS_IOT_TOPIC, jsonBuffer)) {
    Serial.printf("[AWS MQTT PUB -> %s] %s\n", AWS_IOT_TOPIC, jsonBuffer);
  } else {
    Serial.println("[AWS MQTT PUB FAILED]");
  }
}

void setup() {
  Serial.begin(115200);

  unsigned long start = millis();
  while (!Serial && (millis() - start < 3000)) {
    delay(10);
  }

  Serial.println("\n==================================================");
  Serial.println("FreshTrace: ESP32-S3 + SGP41 + BME280 -> AWS IoT");
  Serial.println("==================================================");

  // Initialize I2C
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);
  Wire.setTimeOut(100);

  scanI2C();

  // Initialize BME280
  Serial.printf("Initializing BME280 at 0x%02X... ", bmeAddress);
  if (bme.begin(bmeAddress, &Wire)) {
    bmeFound = true;
    Serial.println("SUCCESS!");
  } else {
    uint8_t altAddr = (bmeAddress == 0x76) ? 0x77 : 0x76;
    if (bme.begin(altAddr, &Wire)) {
      bmeAddress = altAddr;
      bmeFound = true;
      Serial.println("SUCCESS (on alt address)!");
    } else {
      Serial.println("FAILED! (Will use default 25°C / 50% RH compensation)");
    }
  }

  // Initialize SGP41
  Serial.print("Initializing SGP41 at 0x59... ");
  sgp41.begin(Wire);
  uint16_t serialNumber[3] = {0};
  uint16_t error = sgp41.getSerialNumber(serialNumber);
  if (error) {
    char errMsg[128];
    errorToString(error, errMsg, sizeof(errMsg));
    Serial.printf("FAILED! (%s)\n", errMsg);
  } else {
    sgpFound = true;
    Serial.printf("SUCCESS! Serial: 0x%04X%04X%04X\n", serialNumber[0], serialNumber[1], serialNumber[2]);
    uint16_t testResult = 0;
    sgp41.executeSelfTest(testResult);
    Serial.printf(" -> SGP41 Self-Test: 0x%04X\n", testResult);
  }

  // Connect to Wi-Fi and AWS IoT
  connectToWiFi();
  connectToAWS();

  Serial.println("\nStarting telemetry acquisition loop...\n");
}

void loop() {
  // Keep MQTT client active
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      static unsigned long lastReconnect = 0;
      if (millis() - lastReconnect > 5000) {
        lastReconnect = millis();
        connectToAWS();
      }
    } else {
      mqttClient.loop();
    }
  }

  float temperature = 25.0f;
  float humidity = 50.0f;
  float pressure = 1013.25f;

  // 1. Read BME280
  if (bmeFound) {
    float t = bme.readTemperature();
    float h = bme.readHumidity();
    float p = bme.readPressure();

    if (!isnan(t) && !isnan(h) && !isnan(p) && h > 0.0f) {
      temperature = t;
      humidity = h;
      pressure = p / 100.0F;
    }
  }

  // 2. Read SGP41 with dynamic compensation
  uint16_t srawVoc = 0;
  uint16_t srawNox = 0;
  int32_t vocIndex = 0;
  int32_t noxIndex = 0;

  if (sgpFound) {
    uint16_t compRh = static_cast<uint16_t>(humidity * 65535.0f / 100.0f);
    uint16_t compT  = static_cast<uint16_t>((temperature + 45.0f) * 65535.0f / 175.0f);

    if (conditioning_s > 0) {
      sgp41.executeConditioning(compRh, compT, srawVoc);
      conditioning_s--;
    } else {
      sgp41.measureRawSignals(compRh, compT, srawVoc, srawNox);
    }

    if (srawVoc > 0) {
      vocIndex = voc_algorithm.process(srawVoc);
    }
    if (srawNox > 0 && conditioning_s == 0) {
      noxIndex = nox_algorithm.process(srawNox);
    }

    if (algorithm_warmup_s > 0) {
      algorithm_warmup_s--;
    }
  }

  // 3. Local Serial Logging
  Serial.printf("[SENSORS] T: %.2f°C | RH: %.2f%% | P: %.1fhPa | VOC: %5u | NOx: %5u | VOC_Idx: %3d | NOx_Idx: %3d\n",
                temperature, humidity, pressure, srawVoc, srawNox, vocIndex, noxIndex);

  // 4. Publish to AWS IoT Core
  if (millis() - lastMqttPublish >= MQTT_PUBLISH_INTERVAL_MS) {
    lastMqttPublish = millis();
    publishTelemetryToAWS(temperature, humidity, pressure, srawVoc, srawNox, vocIndex, noxIndex);
  }

  delay(1000); // 1 Hz sampling cadence strictly required for Gas Index Algorithm
}
