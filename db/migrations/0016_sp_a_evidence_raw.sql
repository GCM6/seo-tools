CREATE TABLE `evidence_raw` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`evidence_id` text,
	`source_key` text NOT NULL,
	`http_status` integer,
	`content_type` text,
	`encoding` text DEFAULT 'gzip' NOT NULL,
	`content` blob NOT NULL,
	`byte_length` integer NOT NULL,
	`truncated` integer DEFAULT false NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence_artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "evidence_raw_encoding" CHECK("evidence_raw"."encoding" in ('gzip'))
);
--> statement-breakpoint
CREATE INDEX `evidence_raw_evidence_id` ON `evidence_raw` (`evidence_id`);