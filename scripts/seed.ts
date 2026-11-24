import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vnToday } from "../src/shared/format";
import { newPasswordSchema, usernameSchema } from "../src/shared/validation/auth";
import { hashPassword } from "../src/worker/lib/password";
import { buildDemoSql } from "./demo-data";

/**
 * --local           development admin, company and demo data. Safe to run repeatedly.
 * --remote          creates or resets the production admin from environment variables.
 * --remote --demo   adds demo business data only, for a customer demo environment.
 */
const DEMO_USERNAME = "admin";
const DEMO_PASSWORD = "admin";
const DEMO_STAFF_USERNAME = "nhanvien";
const DEMO_STAFF_PASSWORD = "nhanvien";

const remote = process.argv.includes("--remote");
const demoOnly = remote && process.argv.includes("--demo");
if (remote === process.argv.includes("--local")) {
  throw new Error("Hãy chọn đúng một tùy chọn: --local hoặc --remote");
}
const target = remote ? "--remote" : "--local";

function readEnvFile(file: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Thiếu biến ${name}`);
  return value;
}

const sqlText = (value: string) => `'${value.replaceAll("'", "''")}'`;

function executeSql(sql: string) {
  const directory = mkdtempSync(join(tmpdir(), "mbm-seed-"));
  const file = join(directory, "seed.sql");
  try {
    writeFileSync(file, sql, { mode: 0o600 });
    execFileSync("npx", ["wrangler", "d1", "execute", "DB", target, "--yes", `--file=${file}`], {
      stdio: ["ignore", "ignore", "inherit"],
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Ledger rows cannot be overwritten, so demo data is only added to an empty database. */
function hasBusinessData(): boolean {
  const output = execFileSync(
    "npx",
    [
      "wrangler", "d1", "execute", "DB", target, "--json", "--command",
      `SELECT (SELECT COUNT(*) FROM products) + (SELECT COUNT(*) FROM inventory_transactions)
        + (SELECT COUNT(*) FROM employees) + (SELECT COUNT(*) FROM customers) AS total`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const [result] = JSON.parse(output) as { results: { total: number }[] }[];
  return (result?.results[0]?.total ?? 0) > 0;
}

function seedDemoData() {
  if (hasBusinessData()) {
    console.log("Database đã có dữ liệu nghiệp vụ, bỏ qua dữ liệu demo.");
    return;
  }
  executeSql(buildDemoSql(vnToday()));
  console.log("Đã tạo dữ liệu demo: 10 nhân viên, 20 khách hàng, 5 danh mục, 30 sản phẩm, 20 phiếu kho.");
}

const COMPANY_SQL = `
INSERT OR IGNORE INTO company_settings (id, company_name, app_name, address, phone, email, tax_code)
VALUES (1, 'Công ty TNHH Thiết bị Điện An Phát', 'Điện An Phát', '25 Nguyễn Chí Thanh, Đống Đa, Hà Nội',
  '02437751234', 'lienhe@anphat.example', '0109876543');`;

if (demoOnly) {
  executeSql(COMPANY_SQL);
  seedDemoData();
} else {
  const fileEnv = readEnvFile(remote ? ".env" : ".dev.vars");
  const setting = (name: string) => process.env[name] ?? fileEnv[name];

  const username = usernameSchema.parse(
    remote ? required(setting("ADMIN_USERNAME"), "ADMIN_USERNAME") : DEMO_USERNAME,
  );
  // The length rule protects real accounts; the local demo password is deliberately short.
  const password = remote
    ? newPasswordSchema.parse(required(setting("ADMIN_PASSWORD"), "ADMIN_PASSWORD"))
    : DEMO_PASSWORD;
  if (remote && password === DEMO_PASSWORD) {
    throw new Error("Không được dùng mật khẩu demo trên môi trường production");
  }
  const displayName = setting("ADMIN_DISPLAY_NAME") || "Quản trị viên";
  const passwordHash = await hashPassword(password, required(setting("PASSWORD_PEPPER"), "PASSWORD_PEPPER"));

  executeSql(`
INSERT INTO admin_users (id, username, display_name, password_hash, role, active)
VALUES (1, ${sqlText(username)}, ${sqlText(displayName)}, ${sqlText(passwordHash)}, 'admin', 1)
ON CONFLICT (id) DO UPDATE SET
  username = excluded.username,
  display_name = excluded.display_name,
  password_hash = excluded.password_hash,
  -- Đường cứu hộ: tài khoản số 1 luôn trở lại là Admin đang hoạt động (kể cả khi lỡ bị khoá / hạ quyền).
  role = 'admin',
  active = 1,
  password_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
DELETE FROM admin_sessions;
${remote ? "INSERT OR IGNORE INTO company_settings (id, company_name) VALUES (1, 'Công ty của tôi');" : COMPANY_SQL}
`);

  console.log(`Đã tạo tài khoản quản trị "${username}".`);
  if (!remote) {
    console.log(`Mật khẩu demo (chỉ dùng khi phát triển): ${DEMO_PASSWORD}`);
    seedDemoData();
    // Tài khoản vai trò Nhân viên để thử phân quyền: gắn với NV0006 (Kinh doanh đại lý) trong dữ liệu demo.
    const staffHash = await hashPassword(DEMO_STAFF_PASSWORD, required(setting("PASSWORD_PEPPER"), "PASSWORD_PEPPER"));
    executeSql(`
INSERT INTO admin_users (username, display_name, password_hash, role, employee_id)
SELECT ${sqlText(DEMO_STAFF_USERNAME)}, full_name, ${sqlText(staffHash)}, 'employee', id FROM employees
WHERE code = 'NV0006' AND deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM admin_users WHERE username = ${sqlText(DEMO_STAFF_USERNAME)} OR employee_id = employees.id);`);
    console.log(`Tài khoản Nhân viên demo: ${DEMO_STAFF_USERNAME} / ${DEMO_STAFF_PASSWORD}`);
  }
}
