CREATE TABLE `report_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`token` text NOT NULL,
	`locale` text DEFAULT 'zh' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`expires_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_shares_token` ON `report_shares` (`token`);