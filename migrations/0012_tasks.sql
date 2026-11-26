-- Quản lý công việc, giai đoạn 1: vai trò Quản lý, nhóm, công việc và lịch sử thay đổi.
--
-- Phần admin_users viết tay thay cho bản drizzle-kit sinh ra. drizzle-kit muốn dựng lại bảng để thêm
-- CHECK cho vai trò mới, nhưng DROP TABLE admin_users sẽ chạy ON DELETE SET NULL trên created_by /
-- confirmed_by của phiếu kho đã xác nhận, và trigger trg_tx_locked_update chặn việc đó. Vì vậy thêm
-- cột mới `user_role` (CHECK mức cột, ALTER TABLE ADD COLUMN được phép) và chép vai trò cũ sang.
-- Cột cũ `role` giữ nguyên làm cột "legacy": admin → admin, manager / employee → employee.
ALTER TABLE `admin_users` ADD `user_role` text DEFAULT 'admin' NOT NULL CONSTRAINT "admin_users_user_role_check" CHECK (`user_role` IN ('admin', 'manager', 'employee'));--> statement-breakpoint
UPDATE `admin_users` SET `user_role` = `role`;--> statement-breakpoint
CREATE TABLE `task_history` (
	`id` integer PRIMARY KEY NOT NULL,
	`task_id` integer NOT NULL,
	`actor_id` integer,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_history_task_idx` ON `task_history` (`task_id`,`id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`assignee_id` integer NOT NULL,
	`assigner_id` integer,
	`priority` text DEFAULT 'medium' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`start_date` text,
	`due_date` text NOT NULL,
	`requires_review` integer DEFAULT false NOT NULL,
	`cancel_requested_at` text,
	`cancel_request_reason` text,
	`cancel_requested_by` integer,
	`completed_at` text,
	`search_text` text DEFAULT '' NOT NULL,
	`created_by` integer,
	`updated_by` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`assignee_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigner_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`cancel_requested_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "tasks_priority_check" CHECK("tasks"."priority" IN ('low', 'medium', 'high', 'urgent')),
	CONSTRAINT "tasks_status_check" CHECK("tasks"."status" IN ('open', 'in_progress', 'review', 'done', 'cancelled')),
	CONSTRAINT "tasks_dates_check" CHECK("tasks"."start_date" IS NULL OR "tasks"."start_date" <= "tasks"."due_date")
);
--> statement-breakpoint
CREATE INDEX `tasks_assignee_status_idx` ON `tasks` (`assignee_id`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_due_date_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE TABLE `team_members` (
	`team_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_user_unique` ON `team_members` (`user_id`);--> statement-breakpoint
CREATE INDEX `team_members_team_idx` ON `team_members` (`team_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`manager_id` integer,
	`created_by` integer,
	`updated_by` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`manager_id`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `admin_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_name_unique` ON `teams` (`name`);--> statement-breakpoint
