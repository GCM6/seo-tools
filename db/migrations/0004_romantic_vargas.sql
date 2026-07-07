CREATE TABLE `provider_credentials` (
	`credential_key` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
