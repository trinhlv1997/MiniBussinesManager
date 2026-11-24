-- Viết tay thay cho bản drizzle-kit sinh ra.
--
-- Phần 1: nhiều tài khoản + vai trò. Bảng admin_users có CHECK (id = 1) nên phải dựng lại.
-- Khi DROP TABLE admin_users, SQLite chạy các hành động khoá ngoại: admin_sessions bị xoá
-- (ON DELETE CASCADE) và audit_logs.actor_id bị đặt NULL (ON DELETE SET NULL). Vì vậy sao lưu
-- hai thứ đó trước và khôi phục sau, để không ai bị đăng xuất và nhật ký không mất người thực hiện.
CREATE TABLE `_backup_audit_actor` AS SELECT `id`, `actor_id` FROM `audit_logs` WHERE `actor_id` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `_backup_sessions` AS SELECT * FROM `admin_sessions`;--> statement-breakpoint
CREATE TABLE `__new_admin_users` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_changed_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`employee_id` integer REFERENCES `employees`(`id`) ON DELETE SET NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "admin_users_role_check" CHECK (`role` IN ('admin', 'employee'))
);--> statement-breakpoint
INSERT INTO `__new_admin_users` (`id`, `username`, `display_name`, `password_hash`, `password_changed_at`, `role`, `created_at`, `updated_at`)
SELECT `id`, `username`, `display_name`, `password_hash`, `password_changed_at`, 'admin', `created_at`, `updated_at` FROM `admin_users`;--> statement-breakpoint
DROP TABLE `admin_users`;--> statement-breakpoint
ALTER TABLE `__new_admin_users` RENAME TO `admin_users`;--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_username_unique` ON `admin_users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_employee_unique` ON `admin_users` (`employee_id`) WHERE "admin_users"."employee_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO `admin_sessions` SELECT * FROM `_backup_sessions`;--> statement-breakpoint
UPDATE `audit_logs` SET `actor_id` = (SELECT b.`actor_id` FROM `_backup_audit_actor` b WHERE b.`id` = `audit_logs`.`id`)
WHERE `id` IN (SELECT `id` FROM `_backup_audit_actor`);--> statement-breakpoint
DROP TABLE `_backup_audit_actor`;--> statement-breakpoint
DROP TABLE `_backup_sessions`;--> statement-breakpoint

-- Phần 2: người tạo / người sửa cuối (và người xác nhận phiếu kho). Thêm cột sau khi dựng lại
-- admin_users, để DROP TABLE ở trên không đặt NULL các cột này.
ALTER TABLE `employees` ADD `created_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `updated_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `created_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD `updated_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `customers_created_by_idx` ON `customers` (`created_by`);--> statement-breakpoint
ALTER TABLE `customer_notes` ADD `created_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `product_categories` ADD `created_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `product_categories` ADD `updated_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `created_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `updated_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD `confirmed_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD `created_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD `updated_by` integer REFERENCES `admin_users`(`id`) ON DELETE SET NULL;--> statement-breakpoint

-- Phần 3: điền lại từ nhật ký cho dữ liệu đã có (không có nhật ký thì để NULL, hiển thị "—").
UPDATE `employees` SET
  `created_by` = (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'employee' AND a.`action` = 'employee.create' AND a.`entity_id` = CAST(`employees`.`id` AS TEXT) ORDER BY a.`id` LIMIT 1),
  `updated_by` = (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'employee' AND a.`action` IN ('employee.create', 'employee.update') AND a.`entity_id` = CAST(`employees`.`id` AS TEXT) ORDER BY a.`id` DESC LIMIT 1);--> statement-breakpoint
UPDATE `customers` SET
  `created_by` = (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'customer' AND a.`action` = 'customer.create' AND a.`entity_id` = CAST(`customers`.`id` AS TEXT) ORDER BY a.`id` LIMIT 1),
  `updated_by` = (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'customer' AND a.`action` IN ('customer.create', 'customer.update') AND a.`entity_id` = CAST(`customers`.`id` AS TEXT) ORDER BY a.`id` DESC LIMIT 1);--> statement-breakpoint
UPDATE `products` SET
  `created_by` = (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'product' AND a.`action` = 'product.create' AND a.`entity_id` = CAST(`products`.`id` AS TEXT) ORDER BY a.`id` LIMIT 1),
  `updated_by` = (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'product' AND a.`action` IN ('product.create', 'product.update') AND a.`entity_id` = CAST(`products`.`id` AS TEXT) ORDER BY a.`id` DESC LIMIT 1);--> statement-breakpoint
UPDATE `product_categories` SET
  `created_by` = (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'product_category' AND a.`action` = 'category.create' AND a.`entity_id` = CAST(`product_categories`.`id` AS TEXT) ORDER BY a.`id` LIMIT 1),
  `updated_by` = (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'product_category' AND a.`action` IN ('category.create', 'category.update') AND a.`entity_id` = CAST(`product_categories`.`id` AS TEXT) ORDER BY a.`id` DESC LIMIT 1);--> statement-breakpoint
-- Phiếu đã xác nhận / huỷ bị trigger khoá không cho UPDATE: tạm bỏ trigger để điền lại người thực hiện
-- (chỉ ghi vào các cột mới), rồi tạo lại y nguyên như migrations/0005_export_recipient.sql.
DROP TRIGGER `trg_tx_locked_update`;--> statement-breakpoint
-- Phiếu thường: tạo bằng inventory.import/export/adjust. Phiếu đảo ngược: nhật ký ghi theo id phiếu gốc.
UPDATE `inventory_transactions` SET `created_by` = CASE
  WHEN `type` = 'reversal' THEN (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'inventory_transaction' AND a.`action` = 'inventory.reverse' AND a.`entity_id` = CAST(`inventory_transactions`.`reversal_of_id` AS TEXT) ORDER BY a.`id` LIMIT 1)
  ELSE (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'inventory_transaction' AND a.`action` IN ('inventory.import', 'inventory.export', 'inventory.adjust') AND a.`entity_id` = CAST(`inventory_transactions`.`id` AS TEXT) ORDER BY a.`id` LIMIT 1)
END;--> statement-breakpoint
UPDATE `inventory_transactions` SET `updated_by` = COALESCE(
  (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'inventory_transaction' AND a.`action` IN ('inventory.draft_update', 'inventory.confirm', 'inventory.cancel') AND a.`entity_id` = CAST(`inventory_transactions`.`id` AS TEXT) ORDER BY a.`id` DESC LIMIT 1),
  `created_by`
);--> statement-breakpoint
-- Phiếu xác nhận ngay khi tạo (và phiếu đảo ngược) không có dòng inventory.confirm riêng: người xác nhận là người tạo.
UPDATE `inventory_transactions` SET `confirmed_by` = COALESCE(
  (SELECT a.`actor_id` FROM `audit_logs` a WHERE a.`entity_type` = 'inventory_transaction' AND a.`action` = 'inventory.confirm' AND a.`entity_id` = CAST(`inventory_transactions`.`id` AS TEXT) ORDER BY a.`id` DESC LIMIT 1),
  `created_by`
) WHERE `status` = 'confirmed';--> statement-breakpoint
CREATE TRIGGER trg_tx_locked_update
BEFORE UPDATE ON inventory_transactions
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_TRANSACTION_LOCKED');
END;
