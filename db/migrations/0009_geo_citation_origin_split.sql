ALTER TABLE `ai_probe_results` ADD `retrieved_urls` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_probe_results` ADD `target_domain_retrieved` integer DEFAULT false NOT NULL;