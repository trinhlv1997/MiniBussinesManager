CREATE TABLE `admin_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_sessions_expires_idx` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_changed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "admin_users_single_row" CHECK("admin_users"."id" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_username_unique` ON `admin_users` (`username`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY NOT NULL,
	`actor_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`window_started_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_rate_limits_window_idx` ON `auth_rate_limits` (`window_started_at`);--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`logo` text,
	`address` text,
	`phone` text,
	`email` text,
	`tax_code` text,
	`app_name` text DEFAULT 'Mini Business Manager' NOT NULL,
	`date_format` text DEFAULT 'DD/MM/YYYY' NOT NULL,
	`currency` text DEFAULT 'VND' NOT NULL,
	`timezone` text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "company_settings_single_row" CHECK("company_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `customer_notes` (
	`id` integer PRIMARY KEY NOT NULL,
	`customer_id` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `customer_notes_customer_idx` ON `customer_notes` (`customer_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`contact_name` text,
	`phone` text,
	`email` text,
	`address` text,
	`tax_code` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	CONSTRAINT "customers_type_check" CHECK("customers"."type" IN ('individual', 'business'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_code_unique` ON `customers` (`code`) WHERE "customers"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `customers_type_idx` ON `customers` (`type`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `customers_created_idx` ON `customers` (`created_at`);--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`name`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`email` text,
	`position` text,
	`hire_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`address` text,
	`note` text,
	`avatar` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	CONSTRAINT "employees_status_check" CHECK("employees"."status" IN ('active', 'on_leave', 'resigned'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_code_unique` ON `employees` (`code`) WHERE "employees"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `employees_status_idx` ON `employees` (`status`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `employees_name_idx` ON `employees` (`full_name`);--> statement-breakpoint
CREATE TABLE `inventory_balances` (
	`product_id` integer PRIMARY KEY NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "inventory_balances_non_negative" CHECK("inventory_balances"."quantity" >= 0)
);
--> statement-breakpoint
CREATE INDEX `inventory_balances_quantity_idx` ON `inventory_balances` (`quantity`);--> statement-breakpoint
CREATE TABLE `inventory_transaction_items` (
	`id` integer PRIMARY KEY NOT NULL,
	`transaction_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity_delta` integer NOT NULL,
	`unit_price` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `inventory_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "inventory_items_delta_check" CHECK("inventory_transaction_items"."quantity_delta" <> 0),
	CONSTRAINT "inventory_items_price_check" CHECK("inventory_transaction_items"."unit_price" IS NULL OR "inventory_transaction_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_items_tx_product_unique` ON `inventory_transaction_items` (`transaction_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `inventory_items_product_idx` ON `inventory_transaction_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `inventory_transactions` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`transaction_date` text NOT NULL,
	`reference` text,
	`reason` text,
	`note` text,
	`reversal_of_id` integer,
	`confirmed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`reversal_of_id`) REFERENCES `inventory_transactions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "inventory_tx_type_check" CHECK("inventory_transactions"."type" IN ('import', 'export', 'adjust', 'reversal')),
	CONSTRAINT "inventory_tx_status_check" CHECK("inventory_transactions"."status" IN ('draft', 'confirmed', 'cancelled')),
	CONSTRAINT "inventory_tx_reversal_check" CHECK(("inventory_transactions"."type" = 'reversal') = ("inventory_transactions"."reversal_of_id" IS NOT NULL)),
	CONSTRAINT "inventory_tx_reason_check" CHECK("inventory_transactions"."type" <> 'adjust' OR "inventory_transactions"."reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_transactions_code_unique` ON `inventory_transactions` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_transactions_reversal_of_id_unique` ON `inventory_transactions` (`reversal_of_id`);--> statement-breakpoint
CREATE INDEX `inventory_tx_list_idx` ON `inventory_transactions` (`status`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `inventory_tx_type_idx` ON `inventory_transactions` (`type`,`transaction_date`);--> statement-breakpoint
CREATE TABLE `product_categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_categories_code_unique` ON `product_categories` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `product_categories_name_unique` ON `product_categories` (`name`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`category_id` integer NOT NULL,
	`unit` text NOT NULL,
	`cost_price` integer DEFAULT 0 NOT NULL,
	`sale_price` integer DEFAULT 0 NOT NULL,
	`min_stock` integer DEFAULT 0 NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`image` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `product_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "products_cost_price_check" CHECK("products"."cost_price" >= 0),
	CONSTRAINT "products_sale_price_check" CHECK("products"."sale_price" >= 0),
	CONSTRAINT "products_min_stock_check" CHECK("products"."min_stock" >= 0),
	CONSTRAINT "products_status_check" CHECK("products"."status" IN ('active', 'discontinued'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`) WHERE "products"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `products_category_idx` ON `products` (`category_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `products_status_idx` ON `products` (`status`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `products_name_idx` ON `products` (`name`);