import os
import json
import secrets
import string
import time
import boto3
from dotenv import load_dotenv

load_dotenv()

ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
REGION = os.getenv("AWS_REGION", "ap-south-1")

print(f"--- Deploying Axios AWS Cloud Infrastructure [{REGION}] ---")

# Clients
sts = boto3.client("sts", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
account_id = sts.get_caller_identity()["Account"]
print(f"Connected to AWS Account: {account_id}")

sns = boto3.client("sns", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
sqs = boto3.client("sqs", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
s3 = boto3.client("s3", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
iam = boto3.client("iam", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
iot = boto3.client("iot", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
ec2 = boto3.client("ec2", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
rds = boto3.client("rds", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)

# 1. Amazon SNS Topic for Spoilage Alerts
print("\n[1/5] Provisioning Amazon SNS Alert Topic...")
topic_name = "AxiosSpoilageAlerts"
res = sns.create_topic(Name=topic_name)
sns_topic_arn = res["TopicArn"]
print(f"  -> SNS Topic Created: {sns_topic_arn}")

# 2. Amazon S3 Raw Cold-Chain Archive Bucket
bucket_name = f"axios-raw-archive-{account_id}"
print(f"\n[2/5] Provisioning Amazon S3 Raw Archive Bucket: {bucket_name}...")
try:
    if REGION == "us-east-1":
        s3.create_bucket(Bucket=bucket_name)
    else:
        s3.create_bucket(
            Bucket=bucket_name,
            CreateBucketConfiguration={"LocationConstraint": REGION}
        )
    print(f"  -> S3 Bucket Created: {bucket_name}")
except s3.exceptions.BucketAlreadyOwnedByYou:
    print(f"  -> S3 Bucket already exists: {bucket_name}")
except Exception as e:
    print(f"  -> S3 Note: {e}")

# 3. Amazon SQS Telemetry Queue & IAM Role for IoT Rule
print("\n[3/5] Provisioning SQS Stream Buffer & IoT Rules Engine...")
queue_name = "AxiosTelemetryQueue"
queue_res = sqs.create_queue(QueueName=queue_name)
queue_url = queue_res["QueueUrl"]
queue_attrs = sqs.get_queue_attributes(QueueUrl=queue_url, AttributeNames=["QueueArn"])
queue_arn = queue_attrs["Attributes"]["QueueArn"]
print(f"  -> SQS Queue Created: {queue_arn}")

# IAM Role for IoT Core Rule to write to SQS and S3
role_name = "AxiosIoTRuleRole"
trust_policy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {"Service": "iot.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }
    ]
}

try:
    iam_role = iam.create_role(
        RoleName=role_name,
        AssumeRolePolicyDocument=json.dumps(trust_policy),
        Description="IAM role for Axios IoT Core Rule actions"
    )
    role_arn = iam_role["Role"]["Arn"]
    print(f"  -> IAM Role Created: {role_arn}")
    time.sleep(5)  # Wait for IAM propagation
except iam.exceptions.EntityAlreadyExistsException:
    role_arn = iam.get_role(RoleName=role_name)["Role"]["Arn"]
    print(f"  -> IAM Role already exists: {role_arn}")

rule_policy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": ["sqs:SendMessage"],
            "Resource": queue_arn
        },
        {
            "Effect": "Allow",
            "Action": ["s3:PutObject"],
            "Resource": f"arn:aws:s3:::{bucket_name}/*"
        }
    ]
}
iam.put_role_policy(
    RoleName=role_name,
    PolicyName="AxiosIoTRulePolicy",
    PolicyDocument=json.dumps(rule_policy)
)

# IoT Topic Rule
rule_name = "AxiosSensorRule"
sql_query = "SELECT * FROM 'freshtrace/device/+/telemetry'"
rule_payload = {
    "sql": sql_query,
    "description": "Forward FreshTrace sensor telemetry to SQS and S3 archive",
    "actions": [
        {
            "sqs": {
                "roleArn": role_arn,
                "queueUrl": queue_url,
                "useBase64": False
            }
        },
        {
            "s3": {
                "roleArn": role_arn,
                "bucketName": bucket_name,
                "key": "raw/${topic(3)}/${parse_time(\"yyyy/MM/dd\", timestamp())}/${timestamp()}.json"
            }
        }
    ],
    "ruleDisabled": False,
    "awsIotSqlVersion": "2016-03-23"
}

for attempt in range(6):
    try:
        iot.create_topic_rule(ruleName=rule_name, topicRulePayload=rule_payload)
        print(f"  -> IoT Topic Rule '{rule_name}' Created on: {sql_query}")
        break
    except iot.exceptions.ResourceAlreadyExistsException:
        iot.replace_topic_rule(ruleName=rule_name, topicRulePayload=rule_payload)
        print(f"  -> IoT Topic Rule '{rule_name}' Updated on: {sql_query}")
        break
    except iot.exceptions.InvalidRequestException as e:
        if "unable to assume role" in str(e) and attempt < 5:
            print(f"  -> Waiting for IAM role propagation to AWS IoT Core (attempt {attempt+1}/5)...")
            time.sleep(5)
        else:
            raise e

# 4. Amazon RDS PostgreSQL Database Instance
print("\n[4/5] Provisioning Amazon RDS PostgreSQL Database...")
db_identifier = "axios-db"

# Find default VPC and create a Security Group for RDS
vpcs = ec2.describe_vpcs(Filters=[{"Name": "isDefault", "Values": ["true"]}])["Vpcs"]
default_vpc_id = vpcs[0]["VpcId"] if vpcs else ec2.describe_vpcs()["Vpcs"][0]["VpcId"]
print(f"  -> Default VPC: {default_vpc_id}")

sg_name = "axios-rds-sg"
try:
    sg_res = ec2.create_security_group(
        GroupName=sg_name,
        Description="Security Group for Axios RDS PostgreSQL",
        VpcId=default_vpc_id
    )
    sg_id = sg_res["GroupId"]
    print(f"  -> Created Security Group: {sg_id}")
    # Allow port 5432 from anywhere (for local dev access and container access)
    ec2.authorize_security_group_ingress(
        GroupId=sg_id,
        IpPermissions=[
            {
                "IpProtocol": "tcp",
                "FromPort": 5432,
                "ToPort": 5432,
                "IpRanges": [{"CidrIp": "0.0.0.0/0", "Description": "Allow PostgreSQL access"}]
            }
        ]
    )
except ec2.exceptions.ClientError as e:
    if "InvalidGroup.Duplicate" in str(e):
        sgs = ec2.describe_security_groups(
            Filters=[{"Name": "group-name", "Values": [sg_name]}, {"Name": "vpc-id", "Values": [default_vpc_id]}]
        )["SecurityGroups"]
        sg_id = sgs[0]["GroupId"]
        print(f"  -> Security Group already exists: {sg_id}")
    else:
        raise e

# Check if RDS instance already exists
existing_dbs = rds.describe_db_instances().get("DBInstances", [])
db_found = next((d for d in existing_dbs if d["DBInstanceIdentifier"] == db_identifier), None)

chars = string.ascii_letters + string.digits
db_password = "".join(secrets.choice(chars) for _ in range(16)) + "A1!"

if not db_found:
    print(f"  -> Launching RDS PostgreSQL instance '{db_identifier}' (db.t4g.micro)...")
    rds.create_db_instance(
        DBInstanceIdentifier=db_identifier,
        DBName="axios",
        AllocatedStorage=20,
        DBInstanceClass="db.t4g.micro",
        Engine="postgres",
        MasterUsername="axiosadmin",
        MasterUserPassword=db_password,
        VpcSecurityGroupIds=[sg_id],
        PubliclyAccessible=True,
        BackupRetentionPeriod=1,
        StorageType="gp3",
        AutoMinorVersionUpgrade=True
    )
    print(f"  -> RDS instance creation started successfully!")
    print(f"  -> Master User: axiosadmin")
    print(f"  -> Master Password: {db_password}")
else:
    print(f"  -> RDS instance '{db_identifier}' already exists (Status: {db_found['DBInstanceStatus']})")

# 5. Update .env with new AWS ARNs and Queue URLs
print("\n[5/5] Updating .env with provisioned infrastructure...")
with open(".env", "r") as f:
    env_content = f.read()

updates = {
    "AWS_SNS_TOPIC_ARN": sns_topic_arn,
    "AWS_S3_BUCKET": bucket_name,
    "AWS_SQS_QUEUE_URL": queue_url,
    "AWS_RDS_IDENTIFIER": db_identifier,
    "AWS_RDS_USER": "axiosadmin",
}
if not db_found:
    updates["AWS_RDS_PASSWORD"] = db_password

for k, v in updates.items():
    if f"{k}=" in env_content:
        # replace line
        lines = env_content.splitlines()
        new_lines = []
        for line in lines:
            if line.startswith(f"{k}="):
                new_lines.append(f"{k}={v}")
            else:
                new_lines.append(line)
        env_content = "\n".join(new_lines)
    else:
        env_content += f"\n{k}={v}"

with open(".env", "w") as f:
    f.write(env_content + "\n")

print("=== AWS Infrastructure Successfully Provisioned! ===")
print("All resource ARNs, Queue URLs, and S3 bucket names saved to .env.")
