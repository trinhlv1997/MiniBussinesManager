import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "../tasks";
import { newPasswordSchema } from "./auth";
import { accountUsername } from "./users";
import { dateString, idParam, optionalDate, optionalText, queryDate, queryEnum, queryId, queryText, requiredText } from "./common";

const priority = z.enum(TASK_PRIORITIES, "Độ ưu tiên không hợp lệ");

/** Tạo / sửa task. Ngày bắt đầu không bắt buộc nhưng không được sau hạn chót. */
export const taskSchema = z
  .object({
    title: requiredText("tiêu đề", 200),
    description: optionalText(5000),
    assigneeId: idParam,
    priority,
    startDate: optionalDate,
    dueDate: dateString,
    requiresReview: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.startDate && value.startDate > value.dueDate) {
      context.addIssue({ code: "custom", path: ["dueDate"], message: "Hạn chót phải sau hoặc bằng ngày bắt đầu" });
    }
  });

export const taskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES, "Trạng thái không hợp lệ"),
  /** Trạng thái người dùng nhìn thấy lúc bấm: khác trạng thái hiện tại nghĩa là ai đó vừa đổi trước. */
  from: z.enum(TASK_STATUSES).optional(),
  /** Lý do / ghi chú khi đổi trạng thái, không bắt buộc. Lưu vào lịch sử thay đổi. */
  note: optionalText(500),
});

export const cancelRequestSchema = z.object({ reason: requiredText("lý do muốn hủy", 500) });

/** Danh sách cho Kanban: lọc theo người nhận, trạng thái, ưu tiên và khoảng ngày (giao với [bắt đầu, hạn chót]). */
export const taskListQuery = z
  .object({
    search: queryText,
    assigneeId: queryId,
    status: queryEnum(TASK_STATUSES),
    priority: queryEnum(TASK_PRIORITIES),
    from: queryDate,
    to: queryDate,
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    path: ["from"],
    message: "Từ ngày phải trước đến ngày",
  });

/** Số tài khoản mới tối đa tạo trong một lần lưu nhóm (mỗi mật khẩu băm PBKDF2 tốn CPU của Worker). */
export const MAX_NEW_MEMBER_ACCOUNTS = 3;

const memberIds = z.array(idParam).max(200).default([]);

/**
 * Tạo / sửa nhóm (chỉ Quản trị). `newMembers`: hồ sơ nhân viên chưa có tài khoản được thêm vào nhóm;
 * hệ thống tạo tài khoản vai trò Nhân viên cho họ trong cùng lần lưu.
 */
export const teamSchema = z.object({
  name: requiredText("tên nhóm", 100),
  description: optionalText(500),
  managerId: z.preprocess((value) => (value === "" || value === undefined ? null : value), idParam.nullable()),
  memberIds,
  newMembers: z
    .array(z.object({ employeeId: idParam, username: accountUsername, password: newPasswordSchema }))
    .max(MAX_NEW_MEMBER_ACCOUNTS, `Mỗi lần lưu tạo tối đa ${MAX_NEW_MEMBER_ACCOUNTS} tài khoản mới`)
    .default([]),
});

/** Quản lý (và Quản trị) thêm / bớt thành viên đã có tài khoản cho nhóm mình. */
export const teamMembersSchema = z.object({ memberIds });

export type TaskInput = z.output<typeof taskSchema>;
export type TaskFormValues = z.input<typeof taskSchema>;
export type TaskListQuery = z.output<typeof taskListQuery>;
export type TeamInput = z.output<typeof teamSchema>;
export type TeamFormValues = z.input<typeof teamSchema>;
export type TeamMembersInput = z.output<typeof teamMembersSchema>;
export type TeamMembersValues = z.input<typeof teamMembersSchema>;
