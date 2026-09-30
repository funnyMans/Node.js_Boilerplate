from typing import Any

import boto3
from dagster import ConfigurableResource


class S3Resource(ConfigurableResource):
    endpoint_url: str | None = None
    region_name: str = "us-east-1"
    access_key_id: str | None = None
    secret_access_key: str | None = None

    def get_client(self) -> Any:
        return boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            region_name=self.region_name,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
        )
