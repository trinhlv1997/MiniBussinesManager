import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const FILE = ".dev.vars";

if (existsSync(FILE)) {
  console.log(`${FILE} đã tồn tại, giữ nguyên.`);
} else {
  const pepper = randomBytes(32).toString("base64url");
  writeFileSync(FILE, `APP_ENV=development\nPASSWORD_PEPPER=${pepper}\n`, { mode: 0o600 });
  console.log(`Đã tạo ${FILE}.`);
}
