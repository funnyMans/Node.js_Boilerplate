ALTER TABLE "outbox_events"
    ADD COLUMN "trace_context" JSONB,
    ADD COLUMN "workflow_failed_at" TIMESTAMP(3),
    ADD COLUMN "raw_export_failed_at" TIMESTAMP(3);

CREATE INDEX "outbox_events_completed_retention_idx"
    ON "outbox_events"("created_at")
    WHERE "status" = 'PUBLISHED'
      AND "workflow_started_at" IS NOT NULL
      AND "raw_exported_at" IS NOT NULL;
