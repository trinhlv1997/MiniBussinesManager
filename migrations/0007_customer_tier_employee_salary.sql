-- Viết tay thay cho bản drizzle-kit sinh ra. Bản sinh tự động dựng lại bảng
-- (DROP TABLE customers/employees) để thêm CHECK: trên D1 PRAGMA foreign_keys=OFF
-- không có tác dụng nên DROP TABLE customers sẽ xoá dây chuyền customer_notes.
-- ADD COLUMN kèm CHECK ở mức cột cho cùng ràng buộc mà không đụng dữ liệu cũ.
ALTER TABLE `customers` ADD `tier` text DEFAULT 'normal' NOT NULL CHECK (`tier` IN ('normal', 'vip'));--> statement-breakpoint
CREATE INDEX `customers_tier_idx` ON `customers` (`tier`,`deleted_at`);--> statement-breakpoint
ALTER TABLE `employees` ADD `base_salary` integer CHECK (`base_salary` IS NULL OR `base_salary` >= 0);
