import os

from dagster import Definitions, define_asset_job

from etl_project.assets import curated_orders
from etl_project.resources import S3Resource

curated_orders_job = define_asset_job(
    name="curated_orders_job",
    selection=[curated_orders],
    description="Build the partitioned curated order line-item dataset from raw order events.",
)

defs = Definitions(
    assets=[curated_orders],
    jobs=[curated_orders_job],
    resources={
        "s3": S3Resource(
            endpoint_url=os.getenv("S3_ENDPOINT_URL") or None,
            region_name=os.getenv("AWS_REGION", "us-east-1"),
            access_key_id=os.getenv("AWS_ACCESS_KEY_ID") or None,
            secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY") or None,
        )
    },
)
