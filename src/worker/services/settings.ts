import { eq } from "drizzle-orm";
import type { CompanySettings } from "@shared/types";
import type { SettingsInput } from "@shared/validation/reports";
import type { Db } from "../../db/client";
import { companySettings } from "../../db/schema";
import { auditQuery, runBatch } from "../lib/db";

const SETTINGS_ID = 1;

const columns = {
  companyName: companySettings.companyName,
  logo: companySettings.logo,
  address: companySettings.address,
  phone: companySettings.phone,
  email: companySettings.email,
  taxCode: companySettings.taxCode,
  appName: companySettings.appName,
  dateFormat: companySettings.dateFormat,
  currency: companySettings.currency,
  timezone: companySettings.timezone,
};

const DEFAULTS: CompanySettings = {
  companyName: "Công ty của tôi",
  logo: null,
  address: null,
  phone: null,
  email: null,
  taxCode: null,
  appName: "Mini Business Manager",
  dateFormat: "DD/MM/YYYY",
  currency: "VND",
  timezone: "Asia/Ho_Chi_Minh",
};

export async function getSettings(db: Db): Promise<CompanySettings> {
  const [row] = await db
    .select(columns)
    .from(companySettings)
    .where(eq(companySettings.id, SETTINGS_ID))
    .limit(1);
  return row ?? DEFAULTS;
}

export async function saveSettings(db: Db, actorId: number, input: SettingsInput) {
  await runBatch(db, [
    db
      .insert(companySettings)
      .values({ id: SETTINGS_ID, ...input })
      .onConflictDoUpdate({
        target: companySettings.id,
        set: { ...input, updatedAt: new Date().toISOString() },
      }),
    auditQuery(db, actorId, "settings.update", "company_settings", String(SETTINGS_ID)),
  ]);
  return getSettings(db);
}
