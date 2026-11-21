import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../env";
import { SESSION_TTL_SECONDS } from "../services/auth";

const isProduction = (c: Context<AppEnv>) => c.env.APP_ENV === "production";

// The __Host- prefix makes browsers require Secure, Path=/ and no Domain attribute.
const cookieName = (c: Context<AppEnv>) =>
  isProduction(c) ? "__Host-mbm_session" : "mbm_session";

const cookieOptions = (c: Context<AppEnv>) => ({
  path: "/",
  httpOnly: true,
  secure: isProduction(c),
  sameSite: "Strict" as const,
});

export function readSessionCookie(c: Context<AppEnv>): string | undefined {
  return getCookie(c, cookieName(c));
}

export function writeSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, cookieName(c), token, { ...cookieOptions(c), maxAge: SESSION_TTL_SECONDS });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, cookieName(c), cookieOptions(c));
}
