import type { AdminProfile } from "@shared/api";

export type Bindings = Omit<Env, "APP_ENV" | "PASSWORD_PEPPER"> & {
  APP_ENV: string;
  PASSWORD_PEPPER: string;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    admin: AdminProfile;
    sessionId: string;
  };
};
