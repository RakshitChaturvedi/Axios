import os
import tarfile
import tempfile
import time
import boto3
from dotenv import load_dotenv

load_dotenv()

ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
REGION = os.getenv("AWS_REGION", "ap-south-1")
BUCKET = os.getenv("AWS_S3_BUCKET", "axios-raw-archive-246568717405")

print("=" * 60)
print("Packaging and Deploying Frontend & Cloudflare HTTPS Tunnel to EC2")
print("=" * 60)

# 1. Package bundle
tar_dir = os.path.join(tempfile.gettempdir(), "axios_update")
os.makedirs(tar_dir, exist_ok=True)
tar_path = os.path.join(tar_dir, "axios-backend.tar.gz")

def exclude_filter(tarinfo):
    if any(x in tarinfo.name for x in ["__pycache__", ".pytest_cache", ".git", "venv", "node_modules"]):
        return None
    return tarinfo

with tarfile.open(tar_path, "w:gz") as tar:
    for item in ["src", "config", "requirements.txt", "pyproject.toml", ".env", "frontend/dist"]:
        if os.path.exists(item):
            print("  Adding:", item)
            tar.add(item, arcname=item, filter=exclude_filter)

s3 = boto3.client("s3", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
s3.upload_file(tar_path, BUCKET, "deploy/axios-backend.tar.gz")
print("  -> Uploaded bundle to S3.")

# Also sync the updated frontend to S3 website bucket 'freshtrace' and 'freshtrace-dashboard-246568717405'
print("  -> Updating S3 website buckets with new frontend build...")
dist_dir = os.path.abspath("frontend/dist")
for b in ["freshtrace"]:
    for root, _, files in os.walk(dist_dir):
        for f in files:
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, dist_dir).replace("\\", "/")
            ct = "application/javascript" if f.endswith(".js") else "text/css" if f.endswith(".css") else "text/html" if f.endswith(".html") else "image/png" if f.endswith(".png") else "image/jpeg"
            s3.upload_file(full_path, b, rel_path, ExtraArgs={"ContentType": ct})

# 2. SSM to update EC2 and start tunnel
ssm = boto3.client("ssm", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
commands = [
    f"aws s3 cp s3://{BUCKET}/deploy/axios-backend.tar.gz /tmp/axios-backend.tar.gz --region {REGION}",
    "tar -xzf /tmp/axios-backend.tar.gz -C /opt/axios",
    "source /opt/axios/venv/bin/activate && pip install -r /opt/axios/requirements.txt",
    "systemctl restart axios-api",
    "systemctl restart axios-inference",
    # Setup cloudflared systemd service
    """cat << 'EOF' > /etc/systemd/system/axios-tunnel.service
[Unit]
Description=Axios Cloudflare HTTPS Tunnel
After=network.target axios-api.service

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/cloudflared tunnel --url http://localhost:8080 --no-autoupdate
Restart=always
RestartSec=3
StandardOutput=append:/var/log/cloudflared.log
StandardError=append:/var/log/cloudflared.log

[Install]
WantedBy=multi-user.target
EOF
""",
    "which cloudflared >/dev/null 2>&1 || cp /usr/bin/cloudflared /usr/local/bin/cloudflared 2>/dev/null || true",
    "systemctl daemon-reload",
    "systemctl enable axios-tunnel",
    "> /var/log/cloudflared.log",
    "systemctl restart axios-tunnel",
    "sleep 6",
    "grep -o 'https://[a-zA-Z0-9-]*\\.trycloudflare\\.com' /var/log/cloudflared.log | tail -n 1"
]

res = ssm.send_command(
    InstanceIds=["i-01c71ae75b0f02743"],
    DocumentName="AWS-RunShellScript",
    Parameters={"commands": commands}
)
cmd_id = res["Command"]["CommandId"]
print("  -> Sent SSM update command:", cmd_id)

tunnel_url = None
for attempt in range(20):
    time.sleep(3)
    inv = ssm.get_command_invocation(CommandId=cmd_id, InstanceId="i-01c71ae75b0f02743")
    if inv["Status"] in ["Success", "Failed"]:
        print("  -> Execution Status:", inv["Status"])
        stdout = inv.get("StandardOutputContent", "")
        stderr = inv.get("StandardErrorContent", "")
        print("STDOUT:\n", stdout)
        if stderr:
            print("STDERR:\n", stderr.encode("ascii", errors="replace").decode("ascii"))
        lines = [line.strip() for line in stdout.splitlines() if "trycloudflare.com" in line]
        if lines:
            tunnel_url = lines[-1]
        break

if not tunnel_url:
    # Check log again if needed
    time.sleep(2)
    res2 = ssm.send_command(
        InstanceIds=["i-01c71ae75b0f02743"],
        DocumentName="AWS-RunShellScript",
        Parameters={"commands": ["grep -o 'https://[a-zA-Z0-9-]*\\.trycloudflare\\.com' /var/log/cloudflared.log | tail -n 1"]}
    )
    time.sleep(3)
    inv2 = ssm.get_command_invocation(CommandId=res2["Command"]["CommandId"], InstanceId="i-01c71ae75b0f02743")
    out = inv2.get("StandardOutputContent", "").strip()
    if "trycloudflare.com" in out:
        tunnel_url = out

print("\n" + "=" * 60)
print("DEPLOYMENT COMPLETE!")
print(f"1. DIRECT EC2 WEB (Port 80):     http://13.233.158.144/")
if tunnel_url:
    print(f"2. SECURE MOBILE HTTPS URL:      {tunnel_url}")
print(f"3. S3 STATIC WEBSITE:            http://freshtrace.s3-website.ap-south-1.amazonaws.com")
print("=" * 60)
