-- Lần đăng nhập cuối lưu trên tài khoản (trước đây tính từ audit_logs). Nhật ký giờ chỉ giữ 30 ngày,
-- nên điền sẵn từ nhật ký hiện có trước khi tác vụ dọn dẹp xoá phần cũ.
ALTER TABLE `admin_users` ADD `last_login_at` text;--> statement-breakpoint
UPDATE `admin_users` SET `last_login_at` = (
  SELECT MAX(a.`created_at`) FROM `audit_logs` a WHERE a.`actor_id` = `admin_users`.`id` AND a.`action` = 'auth.login'
);
