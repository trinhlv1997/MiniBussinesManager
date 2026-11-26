import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vnToday } from "../src/shared/format";
import { toSearchText } from "../src/shared/text";
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
INSERT INTO admin_users (id, username, display_name, password_hash, role, user_role, active)
VALUES (1, ${sqlText(username)}, ${sqlText(displayName)}, ${sqlText(passwordHash)}, 'admin', 'admin', 1)
ON CONFLICT (id) DO UPDATE SET
  username = excluded.username,
  display_name = excluded.display_name,
  password_hash = excluded.password_hash,
  -- Đường cứu hộ: tài khoản số 1 luôn trở lại là Admin đang hoạt động (kể cả khi lỡ bị khoá / hạ quyền).
  role = 'admin',
  user_role = 'admin',
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
INSERT INTO admin_users (username, display_name, password_hash, role, user_role, employee_id)
SELECT ${sqlText(DEMO_STAFF_USERNAME)}, full_name, ${sqlText(staffHash)}, 'employee', 'employee', id FROM employees
WHERE code = 'NV0006' AND deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM admin_users WHERE username = ${sqlText(DEMO_STAFF_USERNAME)} OR employee_id = employees.id);
${resetDemoAccountSql(DEMO_STAFF_USERNAME, staffHash, "employee")}`);
    console.log(`Tài khoản Nhân viên demo: ${DEMO_STAFF_USERNAME} / ${DEMO_STAFF_PASSWORD}`);
    await seedTaskDemo(required(setting("PASSWORD_PEPPER"), "PASSWORD_PEPPER"));
  }
}

/**
 * Tài khoản demo (chỉ --local) luôn về mật khẩu mặc định, đúng vai trò và đang hoạt động mỗi lần seed lại,
 * như tài khoản admin số 1; nhờ vậy nút "Đăng nhập nhanh" ở trang login (chỉ có khi chạy dev) luôn dùng được.
 */
function resetDemoAccountSql(username: string, passwordHash: string, role: "manager" | "employee") {
  return `UPDATE admin_users SET password_hash = ${sqlText(passwordHash)}, user_role = ${sqlText(role)}, role = 'employee', active = 1,
  password_changed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE username = ${sqlText(username)};
DELETE FROM admin_sessions WHERE user_id = (SELECT id FROM admin_users WHERE username = ${sqlText(username)});`;
}

/**
 * Dữ liệu demo cho "Quản lý công việc" (chỉ chạy --local): 1 Quản lý, 2 nhân viên nữa, nhóm
 * "Phòng kinh doanh" và ~14 công việc đủ các trạng thái, có việc quá hạn và yêu cầu hủy.
 * Mật khẩu = tên đăng nhập (đặt lại mỗi lần seed). Chỉ thêm công việc khi bảng tasks còn trống.
 */
async function seedTaskDemo(pepper: string) {
  const accounts: [username: string, role: "manager" | "employee", employeeCode: string][] = [
    ["quanly", "manager", "NV0003"],
    ["nhanvien2", "employee", "NV0004"],
    ["nhanvien3", "employee", "NV0008"],
  ];
  const statements: string[] = [];
  for (const [username, role, code] of accounts) {
    const hash = await hashPassword(username, pepper);
    statements.push(`
INSERT INTO admin_users (username, display_name, password_hash, role, user_role, employee_id)
SELECT ${sqlText(username)}, full_name, ${sqlText(hash)}, 'employee', ${sqlText(role)}, id FROM employees
WHERE code = ${sqlText(code)} AND deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM admin_users WHERE username = ${sqlText(username)} OR employee_id = employees.id);
${resetDemoAccountSql(username, hash, role)}`);
  }
  const user = (username: string) => `(SELECT id FROM admin_users WHERE username = ${sqlText(username)})`;
  statements.push(`
INSERT OR IGNORE INTO teams (name, description, manager_id, created_by, updated_by)
VALUES ('Phòng kinh doanh', 'Kinh doanh đại lý, dự án và chăm sóc khách hàng', ${user("quanly")}, 1, 1);
INSERT OR IGNORE INTO team_members (team_id, user_id)
SELECT (SELECT id FROM teams WHERE name = 'Phòng kinh doanh'), id FROM admin_users
WHERE username IN (${sqlText(DEMO_STAFF_USERNAME)}, 'nhanvien2', 'nhanvien3');`);

  // [tiêu đề, người nhận, người giao, ưu tiên, trạng thái, bắt đầu (ngày so với hôm nay), hạn chót, cần duyệt]
  const demo: [string, string, string, string, string, number, number, boolean][] = [
    ["Gọi lại đại lý Minh Phát về đơn ổ cắm thông minh", DEMO_STAFF_USERNAME, "quanly", "urgent", "open", 0, 0, false],
    ["Báo giá dự án chiếu sáng nhà xưởng KCN Tân Bình", "nhanvien2", "quanly", "high", "in_progress", -3, 2, true],
    ["Cập nhật bảng giá đại lý tháng 12", DEMO_STAFF_USERNAME, "quanly", "medium", "open", 1, 5, false],
    ["Khảo sát công trình trường học Quận 7", "nhanvien2", "quanly", "high", "in_progress", -5, -1, false],
    ["Gửi catalog sản phẩm mới cho khách VIP", "nhanvien3", "quanly", "low", "open", 0, 7, false],
    ["Xử lý khiếu nại bảo hành máy lọc không khí", "nhanvien3", "quanly", "urgent", "in_progress", -2, -1, false],
    ["Hợp đồng nguyên tắc với nhà phân phối miền Trung", "nhanvien2", "quanly", "high", "review", -6, 1, true],
    ["Chăm sóc 10 khách hàng mới trong tháng", "nhanvien3", "quanly", "medium", "in_progress", -10, 10, false],
    ["Đối chiếu công nợ đại lý quý 4", DEMO_STAFF_USERNAME, "admin", "medium", "in_progress", -4, -2, false],
    ["Chuẩn bị hội nghị khách hàng cuối năm", "quanly", "admin", "high", "open", 2, 14, false],
    ["Tổng hợp doanh số tuần trước", DEMO_STAFF_USERNAME, "quanly", "low", "done", -8, -6, false],
    ["Gặp khách hàng Công ty Điện Sáng", "nhanvien2", "quanly", "medium", "done", -12, -9, false],
    ["Giao mẫu đèn LED cho showroom", "nhanvien3", "quanly", "low", "cancelled", -7, -5, false],
    ["In tờ rơi khuyến mãi Tết", DEMO_STAFF_USERNAME, "quanly", "low", "open", 3, 9, false],
  ];
  const day = (offset: number) => `date('now', '+7 hours', '${offset >= 0 ? "+" : ""}${offset} day')`;
  const rows = demo.map(([title, assignee, assigner, priority, status, start, due, review]) => {
    const completed = status === "done" ? `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '${due} day')` : "NULL";
    return `(${sqlText(title)}, ${user(assignee)}, ${user(assigner)}, '${priority}', '${status}', ${day(start)}, ${day(due)}, ${review ? 1 : 0}, ${completed}, ${sqlText(toSearchText(title))}, ${user(assigner)}, ${user(assigner)})`;
  });
  statements.push(`
INSERT INTO tasks (title, assignee_id, assigner_id, priority, status, start_date, due_date, requires_review, completed_at, search_text, created_by, updated_by)
SELECT * FROM (VALUES ${rows.join(",\n  ")}) WHERE NOT EXISTS (SELECT 1 FROM tasks);
UPDATE tasks SET cancel_requested_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), cancel_requested_by = assignee_id,
  cancel_request_reason = 'Khách đã chuyển sang mua trực tiếp từ nhà máy'
WHERE title = 'Gửi catalog sản phẩm mới cho khách VIP' AND cancel_requested_at IS NULL;
INSERT INTO task_history (task_id, actor_id, field, new_value, created_at)
SELECT id, assigner_id, 'created', title, created_at FROM tasks WHERE id NOT IN (SELECT task_id FROM task_history);`);
  executeSql(statements.join("\n"));
  console.log("Tài khoản demo công việc: quanly / quanly (Quản lý), nhanvien2 / nhanvien2, nhanvien3 / nhanvien3");
}
