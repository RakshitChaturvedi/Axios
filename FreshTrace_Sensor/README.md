# FreshTrace IoT Sensor Node Firmware

Low-cost IoT Electronic Nose firmware running on the **ESP32-S3** microcontroller. It samples environmental and volatile gas telemetry, executes Sensirion's gas indexing algorithms, and securely streams structured JSON telemetry directly to **AWS IoT Core** over mutual TLS (MQTT).

---

## 1. Hardware Architecture & Pinout

### Microcontroller:
* **ESP32-S3** (Dual-core Xtensa LX7 @ 240 MHz, 2.4 GHz Wi-Fi)

### Sensors:
1. **Bosch Sensortec BME280**:
   * Measures Temperature (°C), Relative Humidity (% RH), and Barometric Pressure (hPa).
   * Used directly for dynamic environmental compensation of the gas sensors.
2. **Sensirion SGP41**:
   * Dual micro-hotplate MOx gas sensor measuring:
     * Raw VOC ticks & VOC Gas Index (1–500)
     * Raw NOx ticks & NOx Gas Index (1–500)

### I2C Bus Wiring (ESP32-S3 default):
| Sensor Pin | ESP32-S3 Pin | Function |
| :--- | :--- | :--- |
| **SDA** | **GPIO 8** | I2C Data line |
| **SCL** | **GPIO 9** | I2C Clock line |
| **VCC** | **3V3** | 3.3V Regulated Power |
| **GND** | **GND** | Ground |

---

## 2. Required Arduino Libraries

Install the following libraries via the Arduino IDE Library Manager:
* **PubSubClient** by Nick O'Leary
* **ArduinoJson** by Benoît Blanchon (v7.x recommended)
* **Adafruit BME280 Library** by Adafruit
* **Adafruit Unified Sensor** by Adafruit
* **Sensirion I2C SGP41** by Sensirion
* **Sensirion Gas Index Algorithm** by Sensirion

---

## 3. Configuration & Credentials

1. Ensure `secrets.h` is present in this directory (use `secrets.example.h` as a template).
2. Configure:
   * `WIFI_SSID` and `WIFI_PASSWORD`
   * `AWS_IOT_ENDPOINT` (e.g., `ak4ocz5tvo1yp-ats.iot.ap-south-1.amazonaws.com`)
   * `THING_NAME` (e.g., `FreshTrace-Node-01`)
   * `AWS_IOT_TOPIC` (e.g., `freshtrace/device/FreshTrace-Node-01/telemetry`)
   * AWS Root CA 1, Device X.509 Certificate, and RSA Private Key.

---

## 4. Telemetry Payload Format

The device publishes JSON payloads at a strict 1 Hz cadence:

```json
{
  "device_id": "FreshTrace-Node-01",
  "food_type": "tomato",
  "temperature_c": 24.85,
  "humidity_pct": 52.30,
  "pressure_hpa": 1012.45,
  "voc_raw": 28450,
  "nox_raw": 18200,
  "voc_index": 115,
  "nox_index": 1,
  "wifi_rssi": -62
}
```

---

## 5. Resilience & Features
* **Dual Port Strategy**: Attempts standard MQTT TLS on port `8883`. If blocked by corporate firewalls or mobile hotspots, automatically fails over to port `443` via AWS ALPN (`x-amzn-mqtt-ca`).
* **NTP Synchronization**: Automatically synchronizes system clock via NTP before TLS handshake to validate AWS X.509 certificate expiry dates.
* **On-the-fly Dynamic Compensation**: Feeds real-time temperature and relative humidity directly into Sensirion's SGP41 conditioning and measurement routines.
