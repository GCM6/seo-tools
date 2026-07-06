CREATE TABLE `ai_probe_results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`run_idx` integer NOT NULL,
	`brand_present` integer DEFAULT false NOT NULL,
	`target_domain_cited` integer DEFAULT false NOT NULL,
	`competitors_mentioned` text DEFAULT '[]' NOT NULL,
	`cited_urls` text DEFAULT '[]' NOT NULL,
	`sentiment` text DEFAULT 'neutral' NOT NULL,
	`raw_answer_hash` text NOT NULL,
	`parser_version` text DEFAULT 'v0' NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence_artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `brand_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`fact_type` text NOT NULL,
	`fact_text` text NOT NULL,
	`source_url` text,
	`source_note` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "brand_facts_status" CHECK("brand_facts"."status" in ('verified','draft','retired'))
);
--> statement-breakpoint
CREATE TABLE `competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'serp_overlap' NOT NULL,
	`overlap_score` text,
	`shared_keywords_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`evidence_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence_artifacts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "competitors_source" CHECK("competitors"."source" in ('manual','serp_overlap')),
	CONSTRAINT "competitors_status" CHECK("competitors"."status" in ('candidate','confirmed','dismissed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitors_project_domain` ON `competitors` (`project_id`,`domain`);--> statement-breakpoint
CREATE TABLE `evidence_artifacts` (
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
	CONSTRAINT "evidence_type" CHECK("evidence_artifacts"."type" in ('gsc','ai_answer','page_fetch','render_check','schema','serp_snapshot','manual','sitemap','site_audit','dataforseo_serp','dataforseo_labs','dataforseo_backlinks','psi','ua_probe','third_party_presence')),
	CONSTRAINT "evidence_level" CHECK("evidence_artifacts"."claim_level" in ('L1','L2','L3','L4'))
);
--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`side` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`severity` text DEFAULT 'mid' NOT NULL,
	`claim_type` text NOT NULL,
	`confidence` text DEFAULT '' NOT NULL,
	`evidence_refs` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`fingerprint` text,
	`dismissed_at` text,
	`dismiss_reason` text,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "findings_side" CHECK("findings"."side" in ('seo','geo','technical')),
	CONSTRAINT "findings_claim" CHECK("findings"."claim_type" in ('hypothesis','inferred','measured_sample','measured_hard')),
	CONSTRAINT "findings_status" CHECK("findings"."status" in ('open','dismissed','converted')),
	CONSTRAINT "findings_evidence_nonempty" CHECK(json_array_length("findings"."evidence_refs") > 0)
);
--> statement-breakpoint
CREATE TABLE `generated_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`prompt_type` text NOT NULL,
	`prompt_text` text NOT NULL,
	`input_fact_refs` text DEFAULT '[]' NOT NULL,
	`evidence_refs` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "gp_type" CHECK("generated_prompts"."prompt_type" in ('content','technical','brief','cms'))
);
--> statement-breakpoint
CREATE TABLE `keyword_gaps` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`keyword_id` text NOT NULL,
	`gap_type` text NOT NULL,
	`our_position` text,
	`competitor_positions` text,
	`opportunity_score` text,
	`evidence_id` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence_artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "keyword_gaps_type" CHECK("keyword_gaps"."gap_type" in ('missing','weak','winning'))
);
--> statement-breakpoint
CREATE TABLE `keyword_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`keyword_id` text NOT NULL,
	`source` text NOT NULL,
	`impressions` integer,
	`clicks` integer,
	`ctr` text,
	`position` text,
	`serp_features` text,
	`evidence_id` text,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`keyword_id`) REFERENCES `keywords`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence_artifacts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "keyword_metrics_source" CHECK("keyword_metrics"."source" in ('gsc','dataforseo'))
);
--> statement-breakpoint
CREATE TABLE `keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`text` text NOT NULL,
	`market` text DEFAULT '' NOT NULL,
	`language` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'gsc' NOT NULL,
	`intent` text DEFAULT '' NOT NULL,
	`search_volume` integer,
	`difficulty` integer,
	`cpc` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "keywords_source" CHECK("keywords"."source" in ('gsc','dataforseo','manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keywords_project_text_market` ON `keywords` (`project_id`,`text`,`market`);--> statement-breakpoint
CREATE TABLE `project_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`gsc_connected` integer DEFAULT false NOT NULL,
	`gsc_refresh_token` text,
	`gsc_site_url` text,
	`dataforseo_configured` integer DEFAULT false NOT NULL,
	`seed_keyword_limit` integer DEFAULT 100 NOT NULL,
	`competitor_serp_top_n` integer DEFAULT 10 NOT NULL,
	`prompt_template_version` text DEFAULT 'template_v1' NOT NULL,
	`default_models` text DEFAULT '[]' NOT NULL,
	`probe_n` integer DEFAULT 5 NOT NULL,
	`market_location` text DEFAULT '' NOT NULL,
	`cache_policy` text DEFAULT 'default' NOT NULL,
	`crawl_enabled` integer DEFAULT true NOT NULL,
	`crawl_max_pages` integer DEFAULT 200 NOT NULL,
	`crawl_max_depth` integer DEFAULT 3 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`industry` text DEFAULT '' NOT NULL,
	`market` text DEFAULT '' NOT NULL,
	`language` text DEFAULT '' NOT NULL,
	`competitors` text DEFAULT '[]' NOT NULL,
	`owner_id` text DEFAULT 'local' NOT NULL,
	`next_retest_due_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`text` text NOT NULL,
	`intent` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`market` text DEFAULT '' NOT NULL,
	`language` text DEFAULT '' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`finding_id` text NOT NULL,
	`what` text NOT NULL,
	`why` text DEFAULT '' NOT NULL,
	`expected_impact` text DEFAULT '' NOT NULL,
	`effort` text DEFAULT '' NOT NULL,
	`risk` text DEFAULT '' NOT NULL,
	`validation_method` text DEFAULT '' NOT NULL,
	`priority` text DEFAULT 'P2' NOT NULL,
	`confidence` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`edited_payload` text,
	`evidence_refs` text NOT NULL,
	`validation_spec` text,
	`applied_at` text,
	`applied_note` text,
	`outcome` text DEFAULT 'unknown' NOT NULL,
	`outcome_evidence_id` text,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`finding_id`) REFERENCES `findings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rec_status" CHECK("recommendations"."status" in ('draft','accepted','edited','rejected')),
	CONSTRAINT "rec_outcome" CHECK("recommendations"."outcome" in ('unknown','effective','ineffective','regressed'))
);
--> statement-breakpoint
CREATE TABLE `reference_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_key` text NOT NULL,
	`version` text DEFAULT 'v1' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`last_verified_at` text,
	`refresh_cadence_days` integer DEFAULT 90 NOT NULL,
	`payload` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reference_artifacts_key` ON `reference_artifacts` (`artifact_key`);--> statement-breakpoint
CREATE TABLE `retest_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`baseline_run_id` text NOT NULL,
	`retest_run_id` text,
	`metric_name` text NOT NULL,
	`baseline_value` text DEFAULT '' NOT NULL,
	`retest_value` text DEFAULT '' NOT NULL,
	`delta` text DEFAULT '' NOT NULL,
	`interpretation` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`baseline_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`retest_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rule_change_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`source` text NOT NULL,
	`change_type` text NOT NULL,
	`target` text DEFAULT '' NOT NULL,
	`evidence_refs` text DEFAULT '[]' NOT NULL,
	`diff` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_at` text,
	`released_in_rules_version` text,
	CONSTRAINT "rcp_source" CHECK("rule_change_proposals"."source" in ('scheduled_research','effectiveness_stats','dismissal_stats','manual')),
	CONSTRAINT "rcp_change" CHECK("rule_change_proposals"."change_type" in ('new_rule','modify_threshold','deprecate','update_artifact')),
	CONSTRAINT "rcp_status" CHECK("rule_change_proposals"."status" in ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_type` text DEFAULT 'baseline' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`protocol_version` text DEFAULT 'v2' NOT NULL,
	`started_at` text,
	`finished_at` text,
	`failure_reason` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "runs_type" CHECK("runs"."run_type" in ('baseline','retest')),
	CONSTRAINT "runs_status" CHECK("runs"."status" in ('draft','collecting','collected','diagnosing','reviewing','output','failed'))
);
--> statement-breakpoint
CREATE TABLE `site_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`first_seen_run_id` text NOT NULL,
	`url` text NOT NULL,
	`discovered_via` text NOT NULL,
	`depth` integer,
	`http_status` integer,
	`final_url` text,
	`title` text,
	`canonical_url` text,
	`meta_robots` text,
	`main_text_chars` integer,
	`content_hash` text,
	`inbound_link_count` integer DEFAULT 0 NOT NULL,
	`light_check_extra` text,
	`check_status` text DEFAULT 'discovered_only' NOT NULL,
	`error_reason` text,
	`template_id` text,
	`is_key_page` integer DEFAULT false NOT NULL,
	`last_checked_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`first_seen_run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "site_pages_via" CHECK("site_pages"."discovered_via" in ('entry','sitemap','crawl','both')),
	CONSTRAINT "site_pages_status" CHECK("site_pages"."check_status" in ('checked','discovered_only','blocked_by_robots','error'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_pages_project_url` ON `site_pages` (`project_id`,`url`);--> statement-breakpoint
CREATE TABLE `url_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`pattern` text NOT NULL,
	`page_count` integer DEFAULT 0 NOT NULL,
	`representative_page_id` text,
	`source` text DEFAULT 'heuristic' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`representative_page_id`) REFERENCES `site_pages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "url_templates_source" CHECK("url_templates"."source" in ('heuristic','user'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `url_templates_project_pattern` ON `url_templates` (`project_id`,`pattern`);