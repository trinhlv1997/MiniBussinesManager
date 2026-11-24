-- Viết tay thay cho bản drizzle-kit sinh ra (bản đó dựng lại bảng customers bằng DROP TABLE:
-- trên D1 việc này xoá dây chuyền customer_notes và vướng khoá ngoại của inventory_transactions).
--
-- 1) Thêm hạng 'basic' (Khách lẻ). CHECK cũ chỉ cho 'normal'/'vip' và SQLite không sửa được CHECK,
--    nên tạo cột mới có CHECK mới, chép dữ liệu, xoá cột cũ rồi đổi tên. DROP COLUMN được phép vì
--    CHECK cũ chỉ gắn với chính cột đó; RENAME COLUMN tự cập nhật tên cột trong CHECK mới.
ALTER TABLE `customers` ADD `tier_new` text DEFAULT 'normal' NOT NULL CHECK (`tier_new` IN ('basic', 'normal', 'vip'));--> statement-breakpoint
UPDATE `customers` SET `tier_new` = `tier`;--> statement-breakpoint
DROP INDEX `customers_tier_idx`;--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `tier`;--> statement-breakpoint
ALTER TABLE `customers` RENAME COLUMN `tier_new` TO `tier`;--> statement-breakpoint
CREATE INDEX `customers_tier_idx` ON `customers` (`tier`,`deleted_at`);--> statement-breakpoint
-- 2) Nhân viên chăm sóc khách hàng (không bắt buộc).
ALTER TABLE `customers` ADD `care_employee_id` integer REFERENCES `employees`(`id`) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `customers_care_employee_idx` ON `customers` (`care_employee_id`);
