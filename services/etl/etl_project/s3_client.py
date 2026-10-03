import boto3
from botocore.config import Config


def create_s3_client(
    endpoint_url: str | None,
    region_name: str,
    access_key_id: str | None,
    secret_access_key: str | None,
):
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        region_name=region_name,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        config=Config(
            connect_timeout=3,
            read_timeout=10,
            retries={"mode": "standard", "total_max_attempts": 3},
            s3={"addressing_style": "path"},
        ),
    )
