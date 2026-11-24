import type { CustomerTier } from "./labels";

/** Ba mức giá bán của một sản phẩm, theo kênh bán. Giá đại lý / phân phối null = bằng giá lẻ. */
export type TierPrices = {
  /** Giá cho Nhà phân phối (hạng VIP). */
  distributorPrice: number | null;
  /** Giá cho Đại lý (hạng Bình thường). */
  dealerPrice: number | null;
  /** Giá cho Khách lẻ (hạng Cơ bản); cũng là giá niêm yết. */
  salePrice: number;
};

export const TIER_PRICE_LABELS: Record<CustomerTier, string> = {
  vip: "Giá phân phối",
  normal: "Giá đại lý",
  basic: "Giá khách lẻ",
};

/**
 * Giá bán theo hạng khách hàng. Không có hạng (xuất cho nhân viên, chưa chọn người nhận) thì dùng giá lẻ.
 * Dùng chung cho form phiếu xuất (tự điền) và server (khi đơn giá để trống), để hai bên luôn khớp.
 */
export function priceForTier(prices: TierPrices, tier: CustomerTier | null | undefined): number {
  if (tier === "vip") return prices.distributorPrice ?? prices.salePrice;
  if (tier === "normal") return prices.dealerPrice ?? prices.salePrice;
  return prices.salePrice;
}

export const priceLabelForTier = (tier: CustomerTier | null | undefined) => TIER_PRICE_LABELS[tier ?? "basic"];
