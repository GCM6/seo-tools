CREATE TABLE `data_source_statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`source_key` text NOT NULL,
	`configured` integer DEFAULT false NOT NULL,
	`authorized` integer DEFAULT false NOT NULL,
	`attempted` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'not_configured' NOT NULL,
	`failure_reason` text,
	`captured_evidence_count` integer DEFAULT 0 NOT NULL,
	`protocol_snapshot` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "dss_status" CHECK("data_source_statuses"."status" in ('not_configured','not_authorized','not_attempted','collected','partial','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_source_statuses_run_source` ON `data_source_statuses` (`run_id`,`source_key`);