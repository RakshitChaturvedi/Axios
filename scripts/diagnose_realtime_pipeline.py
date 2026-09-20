import os
import json
import time
import boto3
from dotenv import load_dotenv

load_dotenv()

ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
REGION = os.getenv("AWS_REGION", "ap-south-1")
QUEUE_URL = os.getenv("AWS_SQS_QUEUE_URL")
INSTANCE_ID = "i-01c71ae75b0f02743"

print("=" * 60)
print("Diagnosing AWS IoT -> SQS -> EC2 -> Database -> Frontend Pipeline")
print("=" * 60)

# 1. Check SQS Queue attributes and message count
sqs = boto3.client("sqs", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
if QUEUE_URL:
    try:
        attrs = sqs.get_queue_attributes(
            QueueUrl=QUEUE_URL,
            AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible", "ApproximateNumberOfMessagesDelayed"]
        )
        print(f"\n[SQS Queue Status] {QUEUE_URL}")
        for k, v in attrs.get("Attributes", {}).items():
            print(f"  {k}: {v}")
    except Exception as e:
        print(f"[SQS Error] {e}")

# 2. Check AWS IoT Topic Rules
iot = boto3.client("iot", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
try:
    rules = iot.list_topic_rules().get("rules", [])
    print(f"\n[AWS IoT Rules] Found {len(rules)} rule(s):")
    for r in rules:
        r_name = r["ruleName"]
        r_detail = iot.get_topic_rule(ruleName=r_name)
        sql = r_detail["rule"]["sql"]
        actions = r_detail["rule"]["actions"]
        disabled = r_detail["rule"].get("ruleDisabled", False)
        print(f"  - Rule: {r_name} (Disabled: {disabled})")
        print(f"    SQL: {sql}")
        print(f"    Actions: {json.dumps(actions)}")
except Exception as e:
    print(f"[IoT Error] {e}")

# 3. Check EC2 Systemd Services & Logs via SSM
ssm = boto3.client("ssm", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
commands = [
    "systemctl status axios-api --no-pager",
    "systemctl status axios-inference --no-pager || true",
    "journalctl -u axios-inference -n 30 --no-pager || true",
    "journalctl -u axios-api -n 20 --no-pager"
]

res = ssm.send_command(
    InstanceIds=[INSTANCE_ID],
    DocumentName="AWS-RunShellScript",
    Parameters={"commands": commands}
)
cmd_id = res["Command"]["CommandId"]
print(f"\n[SSM Diagnostic Command Sent] {cmd_id}")

for attempt in range(15):
    time.sleep(2)
    inv = ssm.get_command_invocation(CommandId=cmd_id, InstanceId=INSTANCE_ID)
    if inv["Status"] in ["Success", "Failed"]:
        print(f"  -> SSM Status: {inv['Status']}\n")
        print("=== STDOUT ===")
        print(inv.get("StandardOutputContent", "").encode("ascii", "replace").decode("ascii"))
        print("=== STDERR ===")
        print(inv.get("StandardErrorContent", "").encode("ascii", "replace").decode("ascii"))
        break
