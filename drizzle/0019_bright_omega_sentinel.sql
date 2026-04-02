ALTER TABLE `email` ADD `pinned_at` integer;--> statement-breakpoint
CREATE INDEX `email_pinned_at_idx` ON `email` (`pinned_at`);