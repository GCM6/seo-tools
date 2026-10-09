-- drizzle-kit 为 SQLite 生成 ADD COLUMN 时丢掉了 ON DELETE（快照里是 cascade），这里手动补齐。
CREATE TABLE `check_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`rule_version` integer NOT NULL,
	`outcome` text NOT NULL,
	`reason_kind` text,
	`reason` text,
	`hit_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chk_outcome" CHECK("check_results"."outcome" in ('hit','clear','not_checked','error')),
	CONSTRAINT "chk_reason_kind" CHECK("check_results"."reason_kind" is null or "check_results"."reason_kind" in ('data_gap','site_condition','unsupported','error')),
	CONSTRAINT "chk_not_checked_reason" CHECK("check_results"."outcome" <> 'not_checked' or "check_results"."reason_kind" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `check_results_run_rule` ON `check_results` (`run_id`,`rule_id`);--> statement-breakpoint
CREATE TABLE `issue_events` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`run_id` text,
	`kind` text NOT NULL,
	`checked` integer,
	`hit` integer,
	`severity` text,
	`affected_count` integer,
	`from_status` text,
	`to_status` text NOT NULL,
	`flags` text DEFAULT '[]' NOT NULL,
	`note` text,
	`actor` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issues`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "iev_kind" CHECK("issue_events"."kind" in ('observed','decision','execution')),
	CONSTRAINT "iev_actor" CHECK("issue_events"."actor" in ('system','operator','owner'))
);
--> statement-breakpoint
CREATE TABLE `issues` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`rule_id` text NOT NULL,
	`rule_version` integer DEFAULT 1 NOT NULL,
	`pillar` text,
	`side` text NOT NULL,
	`title` text NOT NULL,
	`severity` text NOT NULL,
	`affected_count` integer,
	`latest_finding_id` text,
	`decision` text DEFAULT 'pending' NOT NULL,
	`decision_reason` text,
	`decided_at` text,
	`decided_by` text,
	`executed_at` text,
	`executed_note` text,
	`executed_by` text,
	`detection` text DEFAULT 'present' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`flags` text DEFAULT '[]' NOT NULL,
	`unverified_reason` text,
	`retired_reason` text,
	`protocol_hash` text,
	`first_seen_run_id` text,
	`last_seen_run_id` text,
	`last_checked_run_id` text,
	`last_checked_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`latest_finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`first_seen_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`last_seen_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`last_checked_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "issues_severity" CHECK("issues"."severity" in ('high','mid','ok')),
	CONSTRAINT "issues_decision" CHECK("issues"."decision" in ('pending','included','deferred','false_positive')),
	CONSTRAINT "issues_detection" CHECK("issues"."detection" in ('present','gone')),
	CONSTRAINT "issues_status" CHECK("issues"."status" in ('pending','to_execute','executed_awaiting','fixed','not_effective','self_resolved','excluded','retired')),
	CONSTRAINT "issues_decided_by" CHECK("issues"."decided_by" is null or "issues"."decided_by" in ('operator','owner')),
	CONSTRAINT "issues_executed_by" CHECK("issues"."executed_by" is null or "issues"."executed_by" in ('operator','owner')),
	CONSTRAINT "issues_unverified_reason" CHECK("issues"."unverified_reason" is null or "issues"."unverified_reason" in ('data_gap','site_condition','unsupported','error','history_no_ledger')),
	CONSTRAINT "issues_retired_reason" CHECK("issues"."retired_reason" is null or "issues"."retired_reason" in ('protocol_changed','rule_changed')),
	CONSTRAINT "issues_reason_required" CHECK("issues"."decision" not in ('deferred','false_positive') or length(trim(coalesce("issues"."decision_reason", ''))) > 0),
	CONSTRAINT "issues_exec_requires_included" CHECK("issues"."executed_at" is null or "issues"."decision" = 'included')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issues_project_fingerprint` ON `issues` (`project_id`,`fingerprint`);--> statement-breakpoint
ALTER TABLE `findings` ADD `detail` text;--> statement-breakpoint
ALTER TABLE `generated_prompts` ADD `issue_id` text REFERENCES issues(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `runs` ADD `protocol_hash` text;