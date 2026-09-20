#ifndef SECRETS_H
#define SECRETS_H

#include <pgmspace.h>

// Wi-Fi Configuration
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// AWS IoT Core Endpoint (Mumbai Region: ap-south-1)
#define AWS_IOT_ENDPOINT "your-endpoint-ats.iot.ap-south-1.amazonaws.com"

// MQTT Settings
#define THING_NAME "FreshTrace-Node-01"
#define AWS_IOT_TOPIC "freshtrace/device/FreshTrace-Node-01/telemetry"

// ==========================================
// 1. Amazon Root CA 1
// ==========================================
static const char AWS_CERT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF
ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6
b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv
b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj
ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM
9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw
IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6
VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L
93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm
jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC
AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA
A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI
U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs
trRMSNvCaWZsenqkUqrGoI3FsKA77/YLolACKybEx1988BsrqBzRw81aOP0PGoEB
mpigsBS3AlWQlSDHYbkV0lgUIWlNq9bZSEUT5Oevefq1ZdCMUD4PABJfV6LKsnkw
vxvfqbUkeRozvvlYfxnJUfMgsgUx9jex20lLT5Q44h+zkJa62tWBRA/NgISrE3Qh
5nFnunPml987pV4kJ35dupGzE5ak2R074APumTL3
-----END CERTIFICATE-----
)EOF";

// ==========================================
// 2. Device Certificate (Paste from your xxxx-certificate.pem.crt)
// ==========================================
static const char AWS_CERT_CRT[] PROGMEM = R"KEY(
-----BEGIN CERTIFICATE-----
PASTE_YOUR_DEVICE_CERTIFICATE_HERE
-----END CERTIFICATE-----
)KEY";

// ==========================================
// 3. Device Private Key (Paste from your xxxx-private.pem.key)
// ==========================================
static const char AWS_CERT_PRIVATE[] PROGMEM = R"KEY(
-----BEGIN RSA PRIVATE KEY-----
PASTE_YOUR_DEVICE_PRIVATE_KEY_HERE
-----END RSA PRIVATE KEY-----
)KEY";

#endif // SECRETS_H
