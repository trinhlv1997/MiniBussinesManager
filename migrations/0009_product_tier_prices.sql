-- Viết tay thay cho bản drizzle-kit sinh ra (bản đó dựng lại bảng products bằng DROP TABLE,
-- vướng khoá ngoại của inventory_balances và inventory_transaction_items).
-- Giá đại lý và giá nhà phân phối. NULL = bằng giá khách lẻ (sale_price), tính lúc dùng,
-- nên sản phẩm cũ không cần điền và đổi giá lẻ thì hai giá chưa nhập riêng đổi theo.
ALTER TABLE `products` ADD `dealer_price` integer CHECK (`dealer_price` IS NULL OR (typeof(`dealer_price`) = 'integer' AND `dealer_price` >= 0));--> statement-breakpoint
ALTER TABLE `products` ADD `distributor_price` integer CHECK (`distributor_price` IS NULL OR (typeof(`distributor_price`) = 'integer' AND `distributor_price` >= 0));
