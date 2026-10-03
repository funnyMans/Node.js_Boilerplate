import json
import os
import sys
import time
from pathlib import Path

from botocore.exceptions import BotoCoreError, ClientError

from etl_project.s3_client import create_s3_client

SAMPLE_FILE = Path("/opt/dagster/sample_data/orders.jsonl")
SAMPLE_KEY = "orders/created_date=2026-09-27/events.jsonl"
BUCKETS = ("raw", "curated")


def main() -> None:
    client = create_s3_client(
        endpoint_url=os.getenv("S3_ENDPOINT_URL", "http://s3-mock:9000"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
        access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )

    last_error: Exception | None = None
    for _ in range(60):
        try:
            client.list_buckets()
            break
        except (BotoCoreError, ClientError) as error:
            last_error = error
            time.sleep(1)
    else:
        raise RuntimeError("S3 mock did not become ready before the timeout") from last_error

    existing = {bucket["Name"] for bucket in client.list_buckets().get("Buckets", [])}
    for bucket in BUCKETS:
        if bucket not in existing:
            client.create_bucket(Bucket=bucket)

    sample_records = [
        json.loads(line)
        for line in SAMPLE_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    client.put_object(
        Bucket="raw",
        Key=SAMPLE_KEY,
        Body=SAMPLE_FILE.read_bytes(),
        ContentType="application/x-ndjson",
    )
    print(f"Created buckets {', '.join(BUCKETS)} and seeded {len(sample_records)} sample events")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"S3 mock initialization failed: {error}", file=sys.stderr)
        raise
