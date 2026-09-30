from dagster import (
    AssetExecutionContext,
    Config,
    DailyPartitionsDefinition,
    MaterializeResult,
    MetadataValue,
    asset,
)

from etl_project.resources import S3Resource
from etl_project.transform import MAX_RAW_OBJECT_BYTES, encode_orders_parquet, parse_order_events

ORDER_PARTITIONS = DailyPartitionsDefinition(start_date="2025-01-01", timezone="UTC", end_offset=1)


class CuratedOrdersConfig(Config):
    raw_bucket: str = "raw"
    curated_bucket: str = "curated"
    raw_prefix: str = "orders/"


@asset(
    name="curated_orders",
    group_name="orders",
    partitions_def=ORDER_PARTITIONS,
    compute_kind="python",
    description="Flatten versioned order-created events into one curated Parquet file per UTC day.",
)
def curated_orders(
    context: AssetExecutionContext,
    s3: S3Resource,
    config: CuratedOrdersConfig,
) -> MaterializeResult:
    client = s3.get_client()

    objects: list[tuple[str, bytes]] = []
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=config.raw_bucket, Prefix=config.raw_prefix):
        for entry in page.get("Contents", []):
            key = entry["Key"]
            if not key.endswith(".jsonl"):
                continue
            size = entry.get("Size", 0)
            if size > MAX_RAW_OBJECT_BYTES:
                raise ValueError(f"Raw object exceeds 64 MiB: {key}")
            response = client.get_object(Bucket=config.raw_bucket, Key=key)
            body = response["Body"].read(MAX_RAW_OBJECT_BYTES + 1)
            if len(body) > MAX_RAW_OBJECT_BYTES:
                raise ValueError(f"Raw object exceeds 64 MiB: {key}")
            objects.append((key, body))

    partition_date = context.partition_key
    rows = parse_order_events(objects, partition_date)
    parquet_bytes = encode_orders_parquet(rows)
    output_key = f"orders/created_date={partition_date}/orders.parquet"
    client.put_object(
        Bucket=config.curated_bucket,
        Key=output_key,
        Body=parquet_bytes,
        ContentType="application/vnd.apache.parquet",
        Metadata={"partition-date": partition_date, "row-count": str(len(rows))},
    )

    context.log.info(
        "Wrote %s line items from %s raw objects to s3://%s/%s",
        len(rows),
        len(objects),
        config.curated_bucket,
        output_key,
    )
    return MaterializeResult(
        metadata={
            "partition_date": partition_date,
            "raw_objects": len(objects),
            "line_items": len(rows),
            "output_uri": MetadataValue.url(f"s3://{config.curated_bucket}/{output_key}"),
            "output_bytes": len(parquet_bytes),
        }
    )
