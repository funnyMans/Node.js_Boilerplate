import json
import unittest
from datetime import datetime, timezone

from etl_project.assets import ORDER_PARTITIONS
from etl_project.transform import encode_orders_parquet, parse_order_events


def event(event_id: str, occurred_at: str, items: list[dict[str, object]]) -> dict[str, object]:
    return {
        "eventId": event_id,
        "eventType": "order.created.v1",
        "sourceService": "orders-service",
        "version": 1,
        "occurredAt": occurred_at,
        "correlationId": f"corr-{event_id}",
        "payload": {
            "orderId": f"order-{event_id}",
            "userId": "user-1",
            "items": items,
        },
    }


def jsonl(*events: dict[str, object]) -> bytes:
    return ("\n".join(json.dumps(item) for item in events) + "\n").encode()


class ParseOrderEventsTests(unittest.TestCase):
    def test_daily_partitions_include_the_current_utc_day(self) -> None:
        current_utc_day = datetime.now(timezone.utc).date().isoformat()

        self.assertIn(current_utc_day, ORDER_PARTITIONS.get_partition_keys())

    def test_flattens_order_items_and_filters_by_utc_partition(self) -> None:
        body = jsonl(
            event(
                "event-1",
                "2026-09-27T23:30:00-02:00",
                [{"productId": "sku-1", "quantity": 2}, {"productId": "sku-2", "quantity": 1}],
            ),
            event("event-2", "2026-09-27T20:00:00Z", [{"productId": "sku-3", "quantity": 1}]),
        )

        rows = parse_order_events([("orders/events.jsonl", body)], "2026-09-28")

        self.assertEqual(len(rows), 2)
        self.assertEqual({row["event_id"] for row in rows}, {"event-1"})
        self.assertEqual([row["product_id"] for row in rows], ["sku-1", "sku-2"])
        self.assertEqual(rows[0]["order_created_at"].isoformat(), "2026-09-28T01:30:00+00:00")

    def test_deduplicates_identical_delivery_of_same_event(self) -> None:
        duplicate = event("event-1", "2026-09-27T10:00:00Z", [{"productId": "sku-1", "quantity": 1}])

        rows = parse_order_events(
            [("first.jsonl", jsonl(duplicate)), ("redelivery.jsonl", jsonl(duplicate))],
            "2026-09-27",
        )

        self.assertEqual(len(rows), 1)

    def test_fails_on_invalid_event_or_conflicting_duplicate(self) -> None:
        with self.assertRaisesRegex(ValueError, "positive integer"):
            parse_order_events(
                [
                    (
                        "bad.jsonl",
                        jsonl(
                            event(
                                "event-1",
                                "2026-09-27T10:00:00Z",
                                [{"productId": "sku-1", "quantity": 0}],
                            )
                        ),
                    )
                ],
                "2026-09-27",
            )

        first = event("event-1", "2026-09-27T10:00:00Z", [{"productId": "sku-1", "quantity": 1}])
        conflicting = event(
            "event-1", "2026-09-27T10:00:00Z", [{"productId": "sku-1", "quantity": 2}]
        )
        with self.assertRaisesRegex(ValueError, "Conflicting duplicate"):
            parse_order_events(
                [("conflict.jsonl", jsonl(first, conflicting))],
                "2026-09-27",
            )

    def test_creates_parquet_with_the_expected_columns(self) -> None:
        rows = parse_order_events(
            [
                (
                    "orders/events.jsonl",
                    jsonl(
                        event(
                            "event-1",
                            "2026-09-27T10:00:00Z",
                            [{"productId": "sku-1", "quantity": 3}],
                        )
                    ),
                )
            ],
            "2026-09-27",
        )

        parquet_bytes = encode_orders_parquet(rows)

        self.assertTrue(parquet_bytes.startswith(b"PAR1"))
        self.assertGreater(len(parquet_bytes), 4)


if __name__ == "__main__":
    unittest.main()
