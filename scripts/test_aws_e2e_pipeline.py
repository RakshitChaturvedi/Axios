import os
import json
import time
import boto3
from dotenv import load_dotenv

load_dotenv()

ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
REGION = os.getenv("AWS_REGION", "ap-south-1")
ENDPOINT = os.getenv("AWS_IOT_ENDPOINT")
TOPIC = os.getenv("AWS_IOT_TOPIC")
QUEUE_URL = os.getenv("AWS_SQS_QUEUE_URL")
BUCKET = os.getenv("AWS_S3_BUCKET")

def test_pipeline():
    print(f"--- Testing End-to-End AWS IoT Flow ---")
    print(f"Target: https://{ENDPOINT} | Topic: {TOPIC}")

    iot_data = boto3.client(
        "iot-data",
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        region_name=REGION,
        endpoint_url=f"https://{ENDPOINT}"
    )

    test_payload = {
        "device_id": "FreshTrace-Node-01",
        "food_type": "paneer",
        "temperature_c": 29.75,
        "humidity_pct": 68.20,
        "pressure_hpa": 947.10,
        "voc_raw": 248,
        "nox_raw": 0,
        "voc_index": 0,
        "nox_index": 0,
        "wifi_rssi": -35
    }

    print("1. Publishing telemetry message to AWS IoT Core...")
    iot_data.publish(topic=TOPIC, qos=1, payload=json.dumps(test_payload))
    print("   -> Published successfully!")

    print("2. Waiting 3 seconds for AWS IoT Topic Rule to trigger...")
    time.sleep(3)

    print("3. Checking SQS Queue for message...")
    sqs = boto3.client("sqs", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
    res = sqs.receive_message(QueueUrl=QUEUE_URL, MaxNumberOfMessages=5, WaitTimeSeconds=5)
    messages = res.get("Messages", [])
    print(f"   -> SQS Messages Found: {len(messages)}")
    for m in messages:
        print("      Message content:", m["Body"])

    print("4. Checking S3 Cold-Chain Bucket...")
    s3 = boto3.client("s3", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
    objs = s3.list_objects_v2(Bucket=BUCKET, MaxKeys=5).get("Contents", [])
    print(f"   -> S3 Raw Archive Objects: {len(objs)}")
    for o in objs:
        print(f"      Key: {o['Key']} ({o['Size']} bytes)")

    print("\n=== End-to-End AWS Ingestion Test Complete! ===")

if __name__ == "__main__":
    test_pipeline()
