ALTER TABLE `products` ADD `brand` text;--> statement-breakpoint
ALTER TABLE `products` ADD `specifications` text;--> statement-breakpoint
ALTER TABLE `products` ADD `warranty_months` integer DEFAULT 0 NOT NULL;