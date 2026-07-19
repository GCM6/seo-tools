PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_evidence_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
	`type` text NOT NULL,
	`claim_level` text NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`captured_at` text DEFAULT (current_timestamp) NOT NULL,
	`request` text,
	`payload` text,
	`raw_text` text DEFAULT '' NOT NULL,
	`raw_hash` text NOT NULL,
	`parser_version` text DEFAULT 'v0' NOT NULL,
	`site_page_id` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_page_id`) REFERENCES `site_pages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "evidence_type" CHECK("__new_evidence_artifacts"."type" in ('gsc','ai_answer','page_fetch','render_check','schema','serp_snapshot','manual','sitemap','site_audit','dataforseo_serp','dataforseo_labs','dataforseo_backlinks','psi','ua_probe','third_party_presence','serp_aio','social_presence')),
	CONSTRAINT "evidence_level" CHECK("__new_evidence_artifacts"."claim_level" in ('L1','L2','L3','L4'))
);
--> statement-breakpoint
INSERT INTO `__new_evidence_artifacts`("id", "project_id", "run_id", "type", "claim_level", "source", "captured_at", "request", "payload", "raw_text", "raw_hash", "parser_version", "site_page_id") SELECT "id", "project_id", "run_id", "type", "claim_level", "source", "captured_at", "request", "payload", "raw_text", "raw_hash", "parser_version", "site_page_id" FROM `evidence_artifacts`;--> statement-breakpoint
DROP TABLE `evidence_artifacts`;--> statement-breakpoint
ALTER TABLE `__new_evidence_artifacts` RENAME TO `evidence_artifacts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;