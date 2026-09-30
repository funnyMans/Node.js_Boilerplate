import json
from datetime import datetime, timezone
from typing import Any

import pyarrow as pa
import pyarrow.parquet as parquet

ORDER_EVENT_TYPE = "order.created.v1"
MAX_RAW_OBJECT_BYTES = 64 * 1024 * 1024

ORDERS_SCHEMA = pa.schema(
    [
        ("event_id", pa.string()),
        ("order_id", pa.string()),
        ("user_id", pa.string()),
        ("product_id", pa.string()),
        ("quantity", pa.int64()),
        ("order_created_at", pa.timestamp("us", tz="UTC")),
        ("correlation_id", pa.string()),
    ]
)


def _required_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()


def _event_date(value: Any) -> tuple[datetime, str]:
    timestamp = _required_string(value, "occurredAt")
    try:
        parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("occurredAt must be an ISO 8601 timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError("occurredAt must include a timezone")
    normalized = parsed.astimezone(timezone.utc)
    return normalized, normalized.date().isoformat()


def parse_order_events(objects: list[tuple[str, bytes]], partition_date: str) -> list[dict[str, Any]]:
    try:
        expected_date = datetime.strptime(partition_date, "%Y-%m-%d").date().isoformat()
    except ValueError as error:
        raise ValueError("partition_date must use YYYY-MM-DD format") from error

    rows: list[dict[str, Any]] = []
    event_fingerprints: dict[str, str] = {}

    for object_key, body in objects:
        if len(body) > MAX_RAW_OBJECT_BYTES:
            raise ValueError(f"Raw object exceeds 64 MiB: {object_key}")
        try:
            text = body.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError(f"Raw object is not UTF-8: {object_key}") from error

        for line_number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {object_key}:{line_number}") from error
            if not isinstance(event, dict):
                raise ValueError(f"Event must be a JSON object at {object_key}:{line_number}")
            if event.get("eventType") != ORDER_EVENT_TYPE:
                continue
            if event.get("version") != 1:
                raise ValueError(f"Unsupported order event version at {object_key}:{line_number}")

            event_id = _required_string(event.get("eventId"), "eventId")
            occurred_at, date = _event_date(event.get("occurredAt"))
            if date != expected_date:
                continue

            payload = event.get("payload")
            if not isinstance(payload, dict):
                raise ValueError(f"payload must be an object at {object_key}:{line_number}")
            order_id = _required_string(payload.get("orderId"), "payload.orderId")
            user_id = _required_string(payload.get("userId"), "payload.userId")
            correlation_id = _required_string(event.get("correlationId"), "correlationId")
            items = payload.get("items")
            if not isinstance(items, list) or not items:
                raise ValueError(f"payload.items must be a non-empty list at {object_key}:{line_number}")

            normalized_items: list[tuple[str, int]] = []
            for item in items:
                if not isinstance(item, dict):
                    raise ValueError(f"order item must be an object at {object_key}:{line_number}")
                product_id = _required_string(item.get("productId"), "item.productId")
                quantity = item.get("quantity")
                if isinstance(quantity, bool) or not isinstance(quantity, int) or quantity < 1:
                    raise ValueError(f"item.quantity must be a positive integer at {object_key}:{line_number}")
                normalized_items.append((product_id, quantity))

            fingerprint = json.dumps(
                [order_id, user_id, occurred_at.isoformat(), correlation_id, normalized_items],
                separators=(",", ":"),
            )
            previous = event_fingerprints.get(event_id)
            if previous is not None:
                if previous != fingerprint:
                    raise ValueError(f"Conflicting duplicate event ID: {event_id}")
                continue
            event_fingerprints[event_id] = fingerprint

            for product_id, quantity in normalized_items:
                rows.append(
                    {
                        "event_id": event_id,
                        "order_id": order_id,
                        "user_id": user_id,
                        "product_id": product_id,
                        "quantity": quantity,
                        "order_created_at": occurred_at,
                        "correlation_id": correlation_id,
                    }
                )

    return rows


def encode_orders_parquet(rows: list[dict[str, Any]]) -> bytes:
    table = pa.Table.from_pylist(rows, schema=ORDERS_SCHEMA)
    sink = pa.BufferOutputStream()
    parquet.write_table(table, sink, compression="zstd")
    return sink.getvalue().to_pybytes()
