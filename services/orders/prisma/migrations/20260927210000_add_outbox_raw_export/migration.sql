ALTER TABLE "outbox_events"
    ADD COLUMN "raw_export_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "raw_export_available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "raw_export_locked_until" TIMESTAMP(3),
    ADD COLUMN "raw_export_last_error" TEXT,
    ADD COLUMN "raw_exported_at" TIMESTAMP(3);

CREATE INDEX "outbox_events_subject_raw_exported_at_raw_export_available_at_created_at_idx"
    ON "outbox_events"("subject", "raw_exported_at", "raw_export_available_at", "created_at");
