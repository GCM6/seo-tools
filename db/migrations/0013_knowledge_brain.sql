CREATE TABLE `analysis_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`goal` text NOT NULL,
	`domain` text,
	`project_id` text,
	`run_id` text,
	`scenario` text,
	`site_stage` text,
	`detected_symptoms` text DEFAULT '[]' NOT NULL,
	`classification_confidence` text,
	`missing_fields` text DEFAULT '[]' NOT NULL,
	`intake_context` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'classifying' NOT NULL,
	`knowledge_release_version` text,
	`workflow_version` text,
	`rules_version` text,
	`rule_config_version` text,
	`classifier_snapshot` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "analysis_sessions_scenario" CHECK("analysis_sessions"."scenario" is null or "analysis_sessions"."scenario" in ('new_build','diagnose','optimize','learn')),
	CONSTRAINT "analysis_sessions_status" CHECK("analysis_sessions"."status" in ('classifying','waiting_input','ready','running','reviewing','completed','failed'))
);
--> statement-breakpoint
CREATE INDEX `analysis_sessions_status_created` ON `analysis_sessions` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `claim_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`document_version_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`input_hash` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`error` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`document_version_id`) REFERENCES `source_document_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "claim_batches_status" CHECK("claim_batches"."status" in ('running','completed','failed','invalid'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `claim_batches_input_provider_prompt` ON `claim_batches` (`input_hash`,`provider`,`model`,`prompt_version`);--> statement-breakpoint
CREATE TABLE `claim_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`exact_quote` text NOT NULL,
	`start_offset` integer NOT NULL,
	`end_offset` integer NOT NULL,
	`source_url` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `knowledge_claims`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_version_id`) REFERENCES `source_document_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `claim_evidence_claim` ON `claim_evidence` (`claim_id`);--> statement-breakpoint
CREATE TABLE `knowledge_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`claim_type` text NOT NULL,
	`topic` text NOT NULL,
	`statement_zh` text NOT NULL,
	`statement_en` text DEFAULT '' NOT NULL,
	`applicability` text DEFAULT '{}' NOT NULL,
	`confidence` text DEFAULT 'hypothesis' NOT NULL,
	`official_conflict` integer DEFAULT false NOT NULL,
	`consensus_key` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`reviewer_note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`batch_id`) REFERENCES `claim_batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_version_id`) REFERENCES `source_document_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "knowledge_claims_type" CHECK("knowledge_claims"."claim_type" in ('principle','diagnostic_check','decision_rule','remediation','blocker','validation','explanation','hypothesis')),
	CONSTRAINT "knowledge_claims_confidence" CHECK("knowledge_claims"."confidence" in ('observation','hypothesis','community_practice_candidate','inferred','measured','official')),
	CONSTRAINT "knowledge_claims_status" CHECK("knowledge_claims"."status" in ('pending_review','approved','edited','rejected','superseded'))
);
--> statement-breakpoint
CREATE INDEX `knowledge_claims_status_topic` ON `knowledge_claims` (`status`,`topic`);--> statement-breakpoint
CREATE INDEX `knowledge_claims_consensus` ON `knowledge_claims` (`consensus_key`);--> statement-breakpoint
CREATE TABLE `knowledge_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`stable_key` text NOT NULL,
	`knowledge_type` text NOT NULL,
	`topic` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT "knowledge_entries_status" CHECK("knowledge_entries"."status" in ('draft','published','retired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_entries_stable_key` ON `knowledge_entries` (`stable_key`);--> statement-breakpoint
CREATE INDEX `knowledge_entries_topic_status` ON `knowledge_entries` (`topic`,`status`);--> statement-breakpoint
CREATE TABLE `knowledge_entry_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`version` integer NOT NULL,
	`title_zh` text NOT NULL,
	`title_en` text NOT NULL,
	`body_zh` text NOT NULL,
	`body_en` text NOT NULL,
	`diagnostic_instruction` text DEFAULT '{}' NOT NULL,
	`claim_ids` text DEFAULT '[]' NOT NULL,
	`source_urls` text DEFAULT '[]' NOT NULL,
	`confidence` text NOT NULL,
	`change_summary` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT 'human_review' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `knowledge_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_entry_versions_entry_version` ON `knowledge_entry_versions` (`entry_id`,`version`);--> statement-breakpoint
CREATE TABLE `knowledge_ingest_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text DEFAULT 'scheduled' NOT NULL,
	`source_id` text,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text DEFAULT (current_timestamp) NOT NULL,
	`finished_at` text,
	`fetched_count` integer DEFAULT 0 NOT NULL,
	`changed_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`coverage` text DEFAULT '{}' NOT NULL,
	`error_summary` text,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "knowledge_ingest_runs_status" CHECK("knowledge_ingest_runs"."status" in ('running','completed','partial','failed')),
	CONSTRAINT "knowledge_ingest_runs_trigger" CHECK("knowledge_ingest_runs"."trigger" in ('scheduled','manual','backfill','retry'))
);
--> statement-breakpoint
CREATE INDEX `knowledge_ingest_runs_source_started` ON `knowledge_ingest_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `knowledge_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`entry_version_ids` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`published_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT "knowledge_releases_status" CHECK("knowledge_releases"."status" in ('published','superseded','rolled_back'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_releases_version` ON `knowledge_releases` (`version`);--> statement-breakpoint
CREATE TABLE `knowledge_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`action` text NOT NULL,
	`reviewer` text DEFAULT 'local' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`edited_payload` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT "knowledge_reviews_target_type" CHECK("knowledge_reviews"."target_type" in ('claim','knowledge_entry','workflow_proposal')),
	CONSTRAINT "knowledge_reviews_action" CHECK("knowledge_reviews"."action" in ('approve','edit','reject','retire','release'))
);
--> statement-breakpoint
CREATE INDEX `knowledge_reviews_target` ON `knowledge_reviews` (`target_type`,`target_id`);--> statement-breakpoint
CREATE TABLE `knowledge_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`name` text NOT NULL,
	`canonical_url` text NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`authority_level` text DEFAULT 'community' NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_cursor` text,
	`last_success_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT "knowledge_sources_type" CHECK("knowledge_sources"."source_type" in ('google_docs','google_news','reddit_community','reddit_search','legacy_seed')),
	CONSTRAINT "knowledge_sources_authority" CHECK("knowledge_sources"."authority_level" in ('official','measured','community','legacy'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_sources_url` ON `knowledge_sources` (`canonical_url`);--> statement-breakpoint
CREATE TABLE `rule_config_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`config` text NOT NULL,
	`checksum` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`published_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rule_config_releases_version` ON `rule_config_releases` (`version`);--> statement-breakpoint
CREATE TABLE `source_document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`ingest_run_id` text,
	`content_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`raw_text` text DEFAULT '' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`captured_at` text DEFAULT (current_timestamp) NOT NULL,
	`http_etag` text,
	`http_last_modified` text,
	`parser_version` text DEFAULT 'knowledge_parser_v1' NOT NULL,
	`status` text DEFAULT 'stored' NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `source_documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ingest_run_id`) REFERENCES `knowledge_ingest_runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "source_document_versions_status" CHECK("source_document_versions"."status" in ('stored','distilling','distilled','failed','superseded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_document_versions_doc_hash` ON `source_document_versions` (`document_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `source_document_versions_captured` ON `source_document_versions` (`captured_at`);--> statement-breakpoint
CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text NOT NULL,
	`canonical_url` text NOT NULL,
	`document_type` text DEFAULT 'article' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`author_hash` text,
	`community` text,
	`published_at` text,
	`last_observed_at` text DEFAULT (current_timestamp) NOT NULL,
	`deleted_at` text,
	`current_version_id` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "source_documents_type" CHECK("source_documents"."document_type" in ('article','release_note','post','comment','thread','legacy_rule'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_documents_source_external` ON `source_documents` (`source_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `source_documents_published` ON `source_documents` (`published_at`);--> statement-breakpoint
CREATE TABLE `workflow_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`step_run_id` text,
	`artifact_type` text NOT NULL,
	`payload` text NOT NULL,
	`evidence_refs` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `analysis_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`step_run_id`) REFERENCES `workflow_step_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workflow_artifacts_session` ON `workflow_artifacts` (`session_id`);--> statement-breakpoint
CREATE TABLE `workflow_change_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`base_workflow_version` text,
	`knowledge_release_version` text NOT NULL,
	`title` text NOT NULL,
	`rationale` text NOT NULL,
	`diff` text NOT NULL,
	`evidence_refs` text NOT NULL,
	`provider_snapshot` text,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`reviewed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT "workflow_change_proposals_status" CHECK("workflow_change_proposals"."status" in ('pending_review','approved','rejected','released'))
);
--> statement-breakpoint
CREATE INDEX `workflow_change_proposals_status` ON `workflow_change_proposals` (`status`);--> statement-breakpoint
CREATE TABLE `workflow_step_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`step_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`route_reason` text DEFAULT '' NOT NULL,
	`knowledge_version_refs` text DEFAULT '[]' NOT NULL,
	`rule_ids` text DEFAULT '[]' NOT NULL,
	`required_sources` text DEFAULT '[]' NOT NULL,
	`output_summary` text,
	`started_at` text,
	`finished_at` text,
	`error` text,
	FOREIGN KEY (`session_id`) REFERENCES `analysis_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workflow_step_runs_status" CHECK("workflow_step_runs"."status" in ('pending','running','waiting_input','completed','skipped','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_step_runs_session_step` ON `workflow_step_runs` (`session_id`,`step_id`);--> statement-breakpoint
CREATE TABLE `workflow_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`knowledge_release_version` text NOT NULL,
	`definition` text NOT NULL,
	`checksum` text NOT NULL,
	`source_proposal_ids` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`published_at` text DEFAULT (current_timestamp) NOT NULL,
	CONSTRAINT "workflow_versions_status" CHECK("workflow_versions"."status" in ('published','superseded','rolled_back'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_versions_version` ON `workflow_versions` (`version`);--> statement-breakpoint
ALTER TABLE `findings` ADD `workflow_step_run_id` text;--> statement-breakpoint
ALTER TABLE `findings` ADD `knowledge_version_refs` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `findings` ADD `knowledge_release_version` text;--> statement-breakpoint
ALTER TABLE `findings` ADD `workflow_version` text;--> statement-breakpoint
ALTER TABLE `findings` ADD `rule_config_version` text;--> statement-breakpoint
ALTER TABLE `runs` ADD `analysis_session_id` text;--> statement-breakpoint
CREATE TRIGGER `findings_attach_knowledge_trace`
AFTER INSERT ON `findings`
WHEN EXISTS (
	SELECT 1 FROM `runs`
	JOIN `analysis_sessions` ON `analysis_sessions`.`id` = `runs`.`analysis_session_id`
	WHERE `runs`.`id` = NEW.`run_id`
)
BEGIN
	UPDATE `findings`
	SET
		`knowledge_release_version` = (
			SELECT `analysis_sessions`.`knowledge_release_version`
			FROM `runs` JOIN `analysis_sessions` ON `analysis_sessions`.`id` = `runs`.`analysis_session_id`
			WHERE `runs`.`id` = NEW.`run_id`
		),
		`workflow_version` = (
			SELECT `analysis_sessions`.`workflow_version`
			FROM `runs` JOIN `analysis_sessions` ON `analysis_sessions`.`id` = `runs`.`analysis_session_id`
			WHERE `runs`.`id` = NEW.`run_id`
		),
		`rule_config_version` = (
			SELECT `analysis_sessions`.`rule_config_version`
			FROM `runs` JOIN `analysis_sessions` ON `analysis_sessions`.`id` = `runs`.`analysis_session_id`
			WHERE `runs`.`id` = NEW.`run_id`
		),
		`workflow_step_run_id` = COALESCE(
			(
				SELECT `workflow_step_runs`.`id`
				FROM `runs`
				JOIN `workflow_step_runs` ON `workflow_step_runs`.`session_id` = `runs`.`analysis_session_id`
				WHERE `runs`.`id` = NEW.`run_id`
				AND EXISTS (SELECT 1 FROM json_each(`workflow_step_runs`.`rule_ids`) WHERE value = NEW.`rule_id`)
				LIMIT 1
			),
			(
				SELECT `workflow_step_runs`.`id`
				FROM `runs`
				JOIN `workflow_step_runs` ON `workflow_step_runs`.`session_id` = `runs`.`analysis_session_id`
				WHERE `runs`.`id` = NEW.`run_id` AND `workflow_step_runs`.`step_id` = 'S9'
				LIMIT 1
			)
		),
		`knowledge_version_refs` = COALESCE(
			(
				SELECT `workflow_step_runs`.`knowledge_version_refs`
				FROM `workflow_step_runs`
				WHERE `workflow_step_runs`.`id` = `findings`.`workflow_step_run_id`
			),
			'[]'
		)
	WHERE `id` = NEW.`id`;
	UPDATE `findings`
	SET `knowledge_version_refs` = COALESCE(
		(SELECT `workflow_step_runs`.`knowledge_version_refs` FROM `workflow_step_runs` WHERE `workflow_step_runs`.`id` = `findings`.`workflow_step_run_id`),
		'[]'
	)
	WHERE `id` = NEW.`id`;
END;
