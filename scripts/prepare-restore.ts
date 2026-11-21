import { readFileSync, writeFileSync } from "node:fs";

/**
 * `wrangler d1 export` writes each table followed by its rows in alphabetical order,
 * so child rows come before their parent table exists and the file cannot be imported.
 * This rewrites a backup as: tables, rows, indexes, then triggers. Triggers must come
 * last because the inventory rules would otherwise reject historical rows.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character !== ";") continue;

    const candidate = sql.slice(start, index + 1).trim();
    const isOpenTrigger = /^CREATE\s+TRIGGER\b/i.test(candidate) && !/\bEND\s*;$/i.test(candidate);
    if (isOpenTrigger) continue;

    statements.push(candidate);
    start = index + 1;
  }

  const rest = sql.slice(start).trim();
  if (rest) throw new Error("File sao lưu không đầy đủ: câu lệnh cuối chưa kết thúc");
  return statements;
}

const RESTORE_ORDER = [
  /^PRAGMA\b/i,
  /^CREATE\s+TABLE\b/i,
  /^(INSERT|DELETE)\b/i,
  /^CREATE\s+(UNIQUE\s+)?INDEX\b/i,
  /^CREATE\s+TRIGGER\b/i,
];

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error("Cách dùng: npm run db:prepare-restore -- <file-sao-luu.sql> <file-phuc-hoi.sql>");
}

const statements = splitStatements(readFileSync(input, "utf8"));
const unknown = statements.find((statement) => !RESTORE_ORDER.some((rule) => rule.test(statement)));
if (unknown) throw new Error(`Câu lệnh không được hỗ trợ: ${unknown.slice(0, 60)}`);

const ordered = RESTORE_ORDER.flatMap((rule) =>
  statements.filter((statement) => rule.test(statement)),
);
writeFileSync(output, `${ordered.join("\n")}\n`, { mode: 0o600 });
console.log(`Đã tạo ${output} với ${ordered.length} câu lệnh.`);
