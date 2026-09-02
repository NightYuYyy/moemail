ALTER TABLE `message` ADD `ingress_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `message_ingress_key_idx` ON `message` (`ingress_key`);