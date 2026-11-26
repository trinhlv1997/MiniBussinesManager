import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Paginated } from "@shared/api";
import { idParam } from "@shared/validation/common";
import { createDb, type Db } from "../../db/client";
import type { Actor, AppEnv } from "../env";
import { MAX_EXPORT_ROWS, excelResponse, type ExportColumn } from "./export";
import { validationError } from "./errors";
import { ok, parseJson } from "./http";
import { notFound } from "./db";

export function parseQuery<T extends z.ZodType>(c: Context<AppEnv>, schema: T): z.output<T> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseId(c: Context<AppEnv>, name = "id"): number {
  const result = idParam.safeParse(c.req.param(name));
  if (!result.success) throw notFound();
  return result.data;
}

type PagedQuery = { page: number; pageSize: number };

export type ResourceConfig<Row, Query extends PagedQuery, Input> = {
  querySchema: z.ZodType<Query, Record<string, unknown>>;
  bodySchema: z.ZodType<Input, unknown>;
  exportName: string;
  /** Tên sheet trong file Excel, ví dụ "Nhân viên". */
  sheetName: string;
  /** Cột Excel; truyền hàm nếu cột phụ thuộc quyền người xem (vd: ẩn giá nhập với Nhân viên). */
  columns: ExportColumn<Row>[] | ((actor: Actor) => ExportColumn<Row>[]);
  // `actor` = người đang thao tác: ghi người tạo / người sửa và giới hạn phạm vi dữ liệu theo vai trò.
  list: (db: Db, query: Query, actor: Actor) => Promise<Paginated<Row>>;
  get: (db: Db, id: number, actor: Actor) => Promise<unknown>;
  create: (db: Db, actor: Actor, input: Input) => Promise<unknown>;
  update: (db: Db, actor: Actor, id: number, input: Input) => Promise<unknown>;
  remove: (db: Db, actor: Actor, id: number) => Promise<void>;
};

/** The standard list, export, read, create, update and delete endpoints of a module. */
export function resourceRoutes<Row, Query extends PagedQuery, Input>(
  config: ResourceConfig<Row, Query, Input>,
) {
  return new Hono<AppEnv>()
    .get("/", async (c) =>
      ok(c, await config.list(createDb(c.env.DB), parseQuery(c, config.querySchema), c.get("admin"))),
    )
    .get("/export", async (c) => {
      const query = { ...parseQuery(c, config.querySchema), page: 1, pageSize: MAX_EXPORT_ROWS };
      const { items, pagination } = await config.list(createDb(c.env.DB), query, c.get("admin"));
      return excelResponse(c, {
        fileName: config.exportName,
        sheetName: config.sheetName,
        columns: typeof config.columns === "function" ? config.columns(c.get("admin")) : config.columns,
        rows: items,
        total: pagination.total,
      });
    })
    .get("/:id{[0-9]+}", async (c) => ok(c, await config.get(createDb(c.env.DB), parseId(c), c.get("admin"))))
    .post("/", async (c) => {
      const input = await parseJson(c, config.bodySchema);
      return ok(c, await config.create(createDb(c.env.DB), c.get("admin"), input), 201);
    })
    .put("/:id{[0-9]+}", async (c) => {
      const input = await parseJson(c, config.bodySchema);
      return ok(c, await config.update(createDb(c.env.DB), c.get("admin"), parseId(c), input));
    })
    .delete("/:id{[0-9]+}", async (c) => {
      await config.remove(createDb(c.env.DB), c.get("admin"), parseId(c));
      return ok(c, null);
    });
}
