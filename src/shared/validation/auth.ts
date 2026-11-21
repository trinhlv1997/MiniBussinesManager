import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const usernameSchema = z
  .string("Vui lòng nhập tên đăng nhập")
  .trim()
  .toLowerCase()
  .min(1, "Vui lòng nhập tên đăng nhập")
  .max(64, "Tên đăng nhập quá dài");

export const newPasswordSchema = z
  .string("Vui lòng nhập mật khẩu mới")
  .min(PASSWORD_MIN_LENGTH, `Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`)
  .max(PASSWORD_MAX_LENGTH, `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự`);

export const loginSchema = z.object({
  username: usernameSchema,
  password: z
    .string("Vui lòng nhập mật khẩu")
    .min(1, "Vui lòng nhập mật khẩu")
    .max(PASSWORD_MAX_LENGTH, "Mật khẩu không hợp lệ"),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string("Vui lòng nhập mật khẩu hiện tại")
      .min(1, "Vui lòng nhập mật khẩu hiện tại")
      .max(PASSWORD_MAX_LENGTH, "Mật khẩu không hợp lệ"),
    newPassword: newPasswordSchema,
    confirmPassword: z.string("Vui lòng nhập lại mật khẩu mới"),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Mật khẩu nhập lại không khớp",
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
