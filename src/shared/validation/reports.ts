import { z } from "zod";
import {
  dateRangeQuery,
  optionalEmail,
  optionalImage,
  optionalPhone,
  optionalText,
  queryId,
  requiredText,
} from "./common";

export const reportQuery = z
  .object({
    productId: queryId,
    categoryId: queryId,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .and(dateRangeQuery);

export const settingsSchema = z.object({
  companyName: requiredText("tên công ty", 200),
  logo: optionalImage,
  address: optionalText(300),
  phone: optionalPhone,
  email: optionalEmail,
  taxCode: optionalText(20),
  appName: requiredText("tên ứng dụng", 60),
});

export type ReportQuery = z.output<typeof reportQuery>;
export type DateRange = z.output<typeof dateRangeQuery>;
export type SettingsInput = z.output<typeof settingsSchema>;
export type SettingsFormValues = z.input<typeof settingsSchema>;
