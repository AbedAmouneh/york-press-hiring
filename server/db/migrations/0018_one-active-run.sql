-- Older code could start two runs for one role at once. Keep the newest active run and close the others first.
UPDATE "sourcing_runs" SET "status" = 'failed', "error" = 'Closed: another run for this role was already active.', "locked_until" = NULL, "finished_at" = now()
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "request_id" ORDER BY "created_at" DESC) AS rn
    FROM "sourcing_runs" WHERE "status" IN ('queued', 'running', 'waiting')
  ) x WHERE rn > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "sourcing_runs_one_active" ON "sourcing_runs" USING btree ("request_id") WHERE "sourcing_runs"."status" in ('queued', 'running', 'waiting');