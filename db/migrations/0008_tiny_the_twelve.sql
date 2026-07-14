ALTER TABLE `ai_probe_results` ADD `hedged` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_probe_results` ADD `unknown_admission` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `project_settings` ADD `brand_aliases` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `prompts` ADD `branded` integer DEFAULT false NOT NULL;