import os
import sys
import time
import boto3
from pathlib import Path
from dotenv import load_dotenv

sys.path.append(str(Path(__file__).resolve().parent.parent / "src"))
load_dotenv()

ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
REGION = os.getenv("AWS_REGION", "ap-south-1")
DB_IDENTIFIER = os.getenv("AWS_RDS_IDENTIFIER", "axios-db")

print(f"Waiting for Amazon RDS instance '{DB_IDENTIFIER}' to reach 'available' status...")
rds = boto3.client("rds", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)

while True:
    dbs = rds.describe_db_instances(DBInstanceIdentifier=DB_IDENTIFIER)["DBInstances"]
    status = dbs[0]["DBInstanceStatus"]
    print(f"[{time.strftime('%X')}] RDS Status: {status}")
    if status == "available":
        endpoint = dbs[0]["Endpoint"]["Address"]
        port = str(dbs[0]["Endpoint"]["Port"])
        print(f"\nRDS IS ONLINE: {endpoint}:{port}")

        # Update .env with the RDS Endpoint
        with open(".env", "r") as f:
            env_content = f.read()

        updates = {
            "AWS_RDS_ENDPOINT": endpoint,
            "AWS_RDS_PORT": port
        }
        for k, v in updates.items():
            if f"{k}=" in env_content:
                lines = env_content.splitlines()
                new_lines = [f"{k}={v}" if line.startswith(f"{k}=") else line for line in lines]
                env_content = "\n".join(new_lines)
            else:
                env_content += f"\n{k}={v}"

        with open(".env", "w") as f:
            f.write(env_content + "\n")

        print("Updated .env with AWS_RDS_ENDPOINT.")

        # Re-initialize DB tables on the live RDS PostgreSQL
        from axios.persistence.db import init_db
        init_db()
        print("Schema successfully migrated to Amazon RDS PostgreSQL!")
        break

    time.sleep(15)
