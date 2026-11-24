import { z } from "zod";
import { ROLES } from "../permissions";
import { newPasswordSchema, usernameSchema } from "./auth";
import { optionalId, requiredText } from "./common";

const username = usernameSchema.regex(/^[a-z0-9._-]+$/, "Chỉ dùng chữ thường không dấu, số, dấu chấm, gạch ngang");
const role = z.enum(ROLES, "Vai trò không hợp lệ");

export const userCreateSchema = z.object({
  username,
  displayName: requiredText("tên hiển thị", 120),
  password: newPasswordSchema,
  role,
  employeeId: optionalId,
});

export const userUpdateSchema = z.object({
  displayName: requiredText("tên hiển thị", 120),
  role,
  employeeId: optionalId,
  active: z.boolean("Trạng thái không hợp lệ"),
});

export const resetPasswordSchema = z.object({ password: newPasswordSchema });

export type UserCreateInput = z.output<typeof userCreateSchema>;
export type UserCreateValues = z.input<typeof userCreateSchema>;
export type UserUpdateInput = z.output<typeof userUpdateSchema>;
export type UserUpdateValues = z.input<typeof userUpdateSchema>;
