-- Closes the ways the rules in 0001 could be sidestepped with otherwise valid statements.

-- Line direction is validated against the type, so the type cannot change afterwards.
CREATE TRIGGER trg_tx_identity_locked
BEFORE UPDATE OF type, reversal_of_id ON inventory_transactions
WHEN NEW.type IS NOT OLD.type OR NEW.reversal_of_id IS NOT OLD.reversal_of_id
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_TYPE_LOCKED');
END;
--> statement-breakpoint

CREATE TRIGGER trg_tx_confirm_requires_time
BEFORE UPDATE OF status ON inventory_transactions
WHEN NEW.status = 'confirmed' AND NEW.confirmed_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_CONFIRMED_AT_REQUIRED');
END;
--> statement-breakpoint

-- A reversal targets a confirmed, non-reversal document and cancels it line for line.
CREATE TRIGGER trg_tx_confirm_valid_reversal
BEFORE UPDATE OF status ON inventory_transactions
WHEN NEW.status = 'confirmed' AND NEW.type = 'reversal' AND (
  NOT EXISTS (
    SELECT 1 FROM inventory_transactions original
    WHERE original.id = NEW.reversal_of_id
      AND original.status = 'confirmed'
      AND original.type <> 'reversal'
  )
  OR EXISTS (
    SELECT 1 FROM inventory_transaction_items
    WHERE transaction_id IN (NEW.id, NEW.reversal_of_id)
    GROUP BY product_id
    HAVING SUM(quantity_delta) <> 0
  )
)
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_INVALID_REVERSAL');
END;
--> statement-breakpoint

-- Confirming only updates existing balance rows, so a missing row would lose stock.
-- The row may still go when its product is deleted (the foreign key cascade).
CREATE TRIGGER trg_balance_delete_protected
BEFORE DELETE ON inventory_balances
WHEN EXISTS (SELECT 1 FROM products WHERE id = OLD.product_id)
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_BALANCE_PROTECTED');
END;
--> statement-breakpoint

CREATE TRIGGER trg_balance_product_locked
BEFORE UPDATE OF product_id ON inventory_balances
WHEN NEW.product_id <> OLD.product_id
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_BALANCE_PROTECTED');
END;
--> statement-breakpoint

-- SQLite INTEGER columns accept fractions and text; quantities and VND must be whole.
CREATE TRIGGER trg_items_insert_whole_numbers
BEFORE INSERT ON inventory_transaction_items
WHEN typeof(NEW.quantity_delta) <> 'integer'
  OR (NEW.unit_price IS NOT NULL AND typeof(NEW.unit_price) <> 'integer')
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_INVALID_NUMBER');
END;
--> statement-breakpoint

CREATE TRIGGER trg_items_update_whole_numbers
BEFORE UPDATE ON inventory_transaction_items
WHEN typeof(NEW.quantity_delta) <> 'integer'
  OR (NEW.unit_price IS NOT NULL AND typeof(NEW.unit_price) <> 'integer')
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_INVALID_NUMBER');
END;
--> statement-breakpoint

CREATE TRIGGER trg_products_insert_whole_numbers
BEFORE INSERT ON products
WHEN typeof(NEW.cost_price) <> 'integer'
  OR typeof(NEW.sale_price) <> 'integer'
  OR typeof(NEW.min_stock) <> 'integer'
BEGIN
  SELECT RAISE(ABORT, 'PRODUCT_INVALID_NUMBER');
END;
--> statement-breakpoint

CREATE TRIGGER trg_products_update_whole_numbers
BEFORE UPDATE ON products
WHEN typeof(NEW.cost_price) <> 'integer'
  OR typeof(NEW.sale_price) <> 'integer'
  OR typeof(NEW.min_stock) <> 'integer'
BEGIN
  SELECT RAISE(ABORT, 'PRODUCT_INVALID_NUMBER');
END;
--> statement-breakpoint

-- Products with stock history are retired through status = 'discontinued' instead.
CREATE TRIGGER trg_products_soft_delete_guard
BEFORE UPDATE OF deleted_at ON products
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM inventory_transaction_items WHERE product_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'PRODUCT_HAS_INVENTORY_HISTORY');
END;
--> statement-breakpoint

CREATE TRIGGER trg_items_insert_live_product
BEFORE INSERT ON inventory_transaction_items
WHEN (SELECT deleted_at FROM products WHERE id = NEW.product_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_PRODUCT_DELETED');
END;
--> statement-breakpoint

CREATE TRIGGER trg_items_update_live_product
BEFORE UPDATE OF product_id ON inventory_transaction_items
WHEN (SELECT deleted_at FROM products WHERE id = NEW.product_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_PRODUCT_DELETED');
END;
