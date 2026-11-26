import { canSeeCostPrice } from "@shared/permissions";
import type { InventoryTransaction, InventoryTransactionDetail, Product } from "@shared/types";
import type { Actor } from "../env";

/**
 * Ẩn giá nhập với tài khoản không được xem (Nhân viên). Áp dụng ở tầng route cho MỌI phản hồi có giá nhập,
 * nên giao diện ẩn cột chỉ là phụ: gọi thẳng API cũng không thấy được giá.
 */
export function maskProduct<T extends Pick<Product, "costPrice">>(actor: Actor, product: T): T {
  return canSeeCostPrice(actor.role) ? product : { ...product, costPrice: null };
}

/** Phiếu nhập dùng giá nhập làm đơn giá; phiếu đảo ngược có thể chép lại giá đó, nên ẩn tiền của cả hai. */
const hasCostAmounts = (type: InventoryTransaction["type"]) => type === "import" || type === "reversal";

export function maskTransaction<T extends InventoryTransaction | InventoryTransactionDetail>(actor: Actor, document: T): T {
  if (canSeeCostPrice(actor.role) || !hasCostAmounts(document.type)) return document;
  const masked = { ...document, totalAmount: null };
  if ("lines" in masked) masked.lines = masked.lines.map((line) => ({ ...line, unitPrice: null, amount: null }));
  return masked;
}

/** Sắp xếp theo giá nhập cũng làm lộ thứ tự giá: với Nhân viên đổi về sắp xếp mặc định. */
export function withoutCostSort<Q extends { sort?: string }>(actor: Actor, query: Q): Q {
  return canSeeCostPrice(actor.role) || query.sort !== "costPrice" ? query : { ...query, sort: "createdAt" };
}
