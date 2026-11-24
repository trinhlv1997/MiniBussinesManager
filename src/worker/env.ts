import type { AdminProfile } from "@shared/api";

export type Bindings = Omit<Env, "APP_ENV" | "PASSWORD_PEPPER"> & {
  APP_ENV: string;
  PASSWORD_PEPPER: string;
};

/** Người đang thao tác: dùng để ghi created_by / updated_by và giới hạn phạm vi dữ liệu. */
export type Actor = AdminProfile;

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    admin: AdminProfile;
    sessionId: string;
  };
};
