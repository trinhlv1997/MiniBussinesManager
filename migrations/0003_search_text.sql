ALTER TABLE `customers` ADD `search_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `search_text` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `search_text` text DEFAULT '' NOT NULL;