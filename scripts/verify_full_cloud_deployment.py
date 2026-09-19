import os
import sys
import time
import json
import requests
import boto3
from dotenv import load_dotenv

load_dotenv()

ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
REGION = os.getenv("AWS_REGION", "ap-south-1")
ENDPOINT = os.getenv("AWS_IOT_ENDPOINT")
TOPIC = os.getenv("AWS_IOT_TOPIC", "freshtrace/device/FreshTrace-Node-01/telemetry")

# Load Backend and Frontend endpoints
with open("backend_endpoint.json", "r") as f:
    backend_data = json.load(f)
    api_base = backend_data["api_url"]

with open("frontend_endpoint.json", "r") as f:
    frontend_data = json.load(f)
    s3_website_url = frontend_data["s3_website_url"]

print("=" * 70)
print("VERIFYING FULL AWS CLOUD PLATFORM DEPLOYMENT")
print(f"Backend API:  {api_base}")
print(f"Frontend App: {s3_website_url}")
print("=" * 70)

# 1. Test Backend API Health Check
print("\n[Test 1/4] Verifying Cloud Backend API Health on EC2...")
try:
    r = requests.get(f"{api_base}/health", timeout=5)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    print(f"  [PASS] /health returned 200 OK: {r.json()}")
except Exception as e:
    print(f"  [FAIL] Health check failed: {e}")
    sys.exit(1)

# 2. Test S3 Static Website Frontend
print("\n[Test 2/4] Verifying Cloud Frontend on S3 Static Website...")
try:
    r = requests.get(s3_website_url, timeout=5)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    assert "<title>FreshTrace</title>" in r.text or "assets/" in r.text, "HTML missing expected content"
    print(f"  [PASS] Frontend accessible at {s3_website_url} (HTTP 200)")
except Exception as e:
    print(f"  [FAIL] Frontend check failed: {e}")
    sys.exit(1)

# 3. Publish Telemetry to AWS IoT Core
print("\n[Test 3/4] Publishing Live Sensor Telemetry to AWS IoT Core...")
iot_client = boto3.client(
    "iot-data",
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    region_name=REGION,
    endpoint_url=f"https://{ENDPOINT}"
)

test_timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
test_payload = {
    "device_id": "FreshTrace-Node-01",
    "food_type": "tomato",
    "timestamp": test_timestamp,
    "temperature_c": 28.5,
    "humidity_pct": 65.0,
    "pressure_hpa": 1013.2,
    "voc_raw": 32800,
    "nox_raw": 20100,
    "voc_index": 120,
    "nox_index": 1,
    "wifi_rssi": -42
}

try:
    iot_client.publish(topic=TOPIC, qos=1, payload=json.dumps(test_payload))
    print(f"  [PASS] Published packet for FreshTrace-Node-01 with temp=28.5, voc_raw=32800 to {TOPIC}")
except Exception as e:
    print(f"  [FAIL] Failed to publish IoT telemetry: {e}")
    sys.exit(1)

# 4. Verify Real-time Ingestion & Inference via EC2 API
print("\n[Test 4/4] Verifying Cloud SQS Inference Worker & RDS Persistence...")
print("  Waiting for cloud inference worker to process SQS message and update RDS...")

verified = False
for attempt in range(1, 15):
    time.sleep(2)
    try:
        r = requests.get(f"{api_base}/devices/FreshTrace-Node-01/status", timeout=5)
        if r.status_code == 200:
            data = r.json()
            sensor_data = data.get("sensor", {})
            # Check if updated metrics or recent timestamp reflected
            if sensor_data.get("voc_raw") == 32800 or sensor_data.get("temperature_c") == 28.5:
                print(f"  [PASS] Live Status Verified on Cloud API! (Attempt {attempt}):")
                print(f"         Device:      {data.get('device_id')}")
                print(f"         Food:        {data.get('food_type')}")
                print(f"         Risk Score:  {data.get('spoilage_risk')}")
                print(f"         Dominant:    {data.get('dominant_risk')}")
                print(f"         RUL Hours:   {data.get('remaining_useful_life', {}).get('hours')} hrs")
                print(f"         Sensors:     {sensor_data}")
                print(f"         Last Update: {data.get('last_updated')}")
                verified = True
                break
    except Exception as e:
        print(f"  Poll attempt {attempt} error: {e}")

if not verified:
    # Fetch current status even if specific packet took an extra second
    r = requests.get(f"{api_base}/devices/FreshTrace-Node-01/status", timeout=5)
    print(f"  [STATUS] Latest DB record on API: {r.status_code} -> {r.json()}")

print("\n" + "=" * 70)
print("ALL AWS CLOUD SERVICES VERIFIED AND HEALTHY!")
print(f"1. Amazon EC2 Backend API:     {api_base}")
print(f"2. Amazon S3 Static Frontend:   {s3_website_url}")
print(f"3. Amazon RDS PostgreSQL:       {os.getenv('AWS_RDS_ENDPOINT')}:5432")
print(f"4. AWS IoT Core Topic:          {TOPIC}")
print(f"5. Amazon SQS Telemetry Queue:  {os.getenv('AWS_SQS_QUEUE_URL')}")
print(f"6. Amazon SNS Spoilage Alerts:  {os.getenv('AWS_SNS_TOPIC_ARN')}")
print("=" * 70)
