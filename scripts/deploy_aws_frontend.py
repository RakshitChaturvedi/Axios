import os
import sys
import json
import mimetypes
import subprocess
import time
import boto3
from dotenv import load_dotenv

load_dotenv()

ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
REGION = os.getenv("AWS_REGION", "ap-south-1")

print("=" * 60)
print(f"Deploying FreshTrace Frontend to AWS S3 & CloudFront [{REGION}]")
print("=" * 60)

sts = boto3.client("sts", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
account_id = sts.get_caller_identity()["Account"]
print(f"[AWS] Account ID: {account_id}")

s3 = boto3.client("s3", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)
cloudfront = boto3.client("cloudfront", aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY, region_name=REGION)

# 1. Determine Backend API URL
backend_api_url = "http://localhost:8080"
if os.path.exists("backend_endpoint.json"):
    with open("backend_endpoint.json", "r") as f:
        data = json.load(f)
        backend_api_url = data.get("api_url", backend_api_url)
print(f"[Config] Target Backend API URL: {backend_api_url}")

# 2. Build Frontend with Vite
print("\n[Step 1/4] Building Vite React production distribution...")
frontend_dir = os.path.abspath("frontend")
env = os.environ.copy()
env["VITE_API_BASE"] = backend_api_url

build_cmd = "npm run build"
print(f"  Running '{build_cmd}' in {frontend_dir} with VITE_API_BASE={backend_api_url}...")
proc = subprocess.run(build_cmd, cwd=frontend_dir, env=env, shell=True, capture_output=True, text=True)
if proc.returncode != 0:
    print(f"  [ERROR] Build failed:\n{proc.stderr}")
    sys.exit(1)
print("  -> Frontend build completed successfully!")

dist_dir = os.path.join(frontend_dir, "dist")
if not os.path.exists(dist_dir):
    print(f"  [ERROR] dist folder not found at {dist_dir}")
    sys.exit(1)

# 3. Create & Configure S3 Bucket for Static Website
bucket_name = f"freshtrace-dashboard-{account_id}"
print(f"\n[Step 2/4] Configuring S3 Bucket for Static Website: {bucket_name}...")

try:
    if REGION == "us-east-1":
        s3.create_bucket(Bucket=bucket_name)
    else:
        s3.create_bucket(
            Bucket=bucket_name,
            CreateBucketConfiguration={"LocationConstraint": REGION}
        )
    print(f"  -> S3 Bucket created: {bucket_name}")
except s3.exceptions.BucketAlreadyOwnedByYou:
    print(f"  -> S3 Bucket already exists: {bucket_name}")
except Exception as e:
    if "BucketAlreadyExists" in str(e):
        print(f"  -> S3 Bucket already exists globally: {bucket_name}")
    else:
        print(f"  -> Note: {e}")

# Disable Block Public Access
print("  -> Disabling Block Public Access for static website hosting...")
s3.put_public_access_block(
    Bucket=bucket_name,
    PublicAccessBlockConfiguration={
        "BlockPublicAcls": False,
        "IgnorePublicAcls": False,
        "BlockPublicPolicy": False,
        "RestrictPublicBuckets": False
    }
)

# Enable Website Configuration
print("  -> Enabling Static Website Hosting...")
s3.put_bucket_website(
    Bucket=bucket_name,
    WebsiteConfiguration={
        "IndexDocument": {"Suffix": "index.html"},
        "ErrorDocument": {"Key": "index.html"}
    }
)

# Set Public Read Bucket Policy
print("  -> Applying Public Read Bucket Policy...")
bucket_policy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": f"arn:aws:s3:::{bucket_name}/*"
        }
    ]
}
s3.put_bucket_policy(Bucket=bucket_name, Policy=json.dumps(bucket_policy))

# 4. Upload Files to S3
print("\n[Step 3/4] Uploading dist assets to S3...")
mime_overrides = {
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp"
}

total_files = 0
for root, _, files in os.walk(dist_dir):
    for f in files:
        full_path = os.path.join(root, f)
        rel_path = os.path.relpath(full_path, dist_dir).replace("\\", "/")
        
        _, ext = os.path.splitext(f)
        content_type = mime_overrides.get(ext.lower()) or mimetypes.guess_type(full_path)[0] or "application/octet-stream"
        
        extra_args = {"ContentType": content_type}
        if ext.lower() in [".js", ".css", ".png", ".jpg", ".webp", ".svg"]:
            extra_args["CacheControl"] = "public, max-age=31536000, immutable"
        elif ext.lower() == ".html":
            extra_args["CacheControl"] = "public, max-age=0, must-revalidate"
            
        s3.upload_file(full_path, bucket_name, rel_path, ExtraArgs=extra_args)
        total_files += 1
        print(f"  Uploaded: {rel_path} ({content_type})")

print(f"  -> Successfully uploaded {total_files} files.")
website_url = f"http://{bucket_name}.s3-website.{REGION}.amazonaws.com"

# 5. CloudFront CDN Distribution
print("\n[Step 4/4] Setting up CloudFront CDN Distribution...")
s3_website_endpoint = f"{bucket_name}.s3-website.{REGION}.amazonaws.com"
cf_domain = None

# Check existing distributions
distributions = cloudfront.list_distributions().get("DistributionList", {}).get("Items", [])
target_dist = next((d for d in distributions if any(bucket_name in o["DomainName"] for o in d.get("Origins", {}).get("Items", []))), None)

if target_dist:
    cf_domain = target_dist["DomainName"]
    print(f"  -> Found existing CloudFront Distribution: https://{cf_domain}")
else:
    caller_ref = f"freshtrace-cf-{int(time.time())}"
    print(f"  -> Creating new CloudFront Distribution for {s3_website_endpoint}...")
    try:
        cf_config = {
            "CallerReference": caller_ref,
            "Comment": "FreshTrace Spoilage Intelligence Dashboard CDN",
            "Enabled": True,
            "Origins": {
                "Quantity": 1,
                "Items": [
                    {
                        "Id": f"S3-{bucket_name}",
                        "DomainName": s3_website_endpoint,
                        "CustomOriginConfig": {
                            "HTTPPort": 80,
                            "HTTPSPort": 443,
                            "OriginProtocolPolicy": "http-only",
                            "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]}
                        }
                    }
                ]
            },
            "DefaultCacheBehavior": {
                "TargetOriginId": f"S3-{bucket_name}",
                "ViewerProtocolPolicy": "redirect-to-https",
                "AllowedMethods": {
                    "Quantity": 2,
                    "Items": ["GET", "HEAD"],
                    "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}
                },
                "ForwardedValues": {
                    "QueryString": False,
                    "Cookies": {"Forward": "none"}
                },
                "MinTTL": 0,
                "DefaultTTL": 86400,
                "MaxTTL": 31536000,
                "Compress": True
            }
        }
        cf_res = cloudfront.create_distribution(DistributionConfig=cf_config)
        cf_domain = cf_res["Distribution"]["DomainName"]
        print(f"  -> CloudFront Distribution created: https://{cf_domain}")
    except Exception as e:
        print(f"  -> CloudFront Note: {e}. Static Website Hosting on S3 is fully active!")

print("\n" + "=" * 60)
print("FRESH-TRACE CLOUD FRONTEND DEPLOYMENT COMPLETE!")
print(f"  S3 Static Website URL: {website_url}")
if cf_domain:
    print(f"  CloudFront HTTPS CDN:  https://{cf_domain}")
print(f"  Connected Backend:     {backend_api_url}")
print("=" * 60)

with open("frontend_endpoint.json", "w") as f:
    json.dump({
        "s3_website_url": website_url,
        "cloudfront_url": f"https://{cf_domain}" if cf_domain else None,
        "bucket_name": bucket_name,
        "backend_api_url": backend_api_url
    }, f, indent=2)
