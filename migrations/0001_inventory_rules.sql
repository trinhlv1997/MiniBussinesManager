-- Inventory invariants live in the database so that no code path, retry or
-- concurrent request can bypass them. D1 runs writes one at a time and a failing
-- statement is rolled back as a whole, trigger effects included.

-- Every product always has exactly one balance row, starting at zero.
CREATE TRIGGER trg_products_create_balance
AFTER INSERT ON products
BEGIN
  INSERT INTO inventory_balances (product_id, quantity) VALUES (NEW.id, 0);
END;
--> statement-breakpoint

CREATE TRIGGER trg_balance_insert_starts_at_zero
BEFORE INSERT ON inventory_balances
WHEN NEW.quantity <> 0
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_BALANCE_MISMATCH');
END;
--> statement-breakpoint

-- A balance can only ever equal the sum of its confirmed ledger entries.
CREATE TRIGGER trg_balance_matches_ledger
BEFORE UPDATE OF quantity ON inventory_balances
WHEN NEW.quantity <> (
  SELECT COALESCE(SUM(i.quantity_delta), 0)
  FROM inventory_transaction_items i
  JOIN inventory_transactions t ON t.id = i.transaction_id
  WHERE i.product_id = NEW.product_id AND t.status = 'confirmed'
)
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_BALANCE_MISMATCH');
END;
--> statement-breakpoint

CREATE TRIGGER trg_tx_insert_as_draft
BEFORE INSERT ON inventory_transactions
WHEN NEW.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_MUST_START_AS_DRAFT');
END;
--> statement-breakpoint

-- Confirmed and cancelled documents are immutable.
CREATE TRIGGER trg_tx_locked_update
BEFORE UPDATE ON inventory_transactions
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_TRANSACTION_LOCKED');
END;
--> statement-breakpoint

CREATE TRIGGER trg_tx_locked_delete
BEFORE DELETE ON inventory_transactions
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_TRANSACTION_LOCKED');
END;
--> statement-breakpoint

CREATE TRIGGER trg_tx_confirm_requires_items
BEFORE UPDATE OF status ON inventory_transactions
WHEN NEW.status = 'confirmed'
  AND NOT EXISTS (SELECT 1 FROM inventory_transaction_items WHERE transaction_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_EMPTY_TRANSACTION');
END;
--> statement-breakpoint

-- Confirming is the only moment stock changes. The balance CHECK (quantity >= 0)
-- aborts the whole statement if any line would make stock negative.
CREATE TRIGGER trg_tx_confirm_applies_stock
AFTER UPDATE OF status ON inventory_transactions
WHEN OLD.status = 'draft' AND NEW.status = 'confirmed'
BEGIN
  UPDATE inventory_balances
  SET
    quantity = quantity + (
      SELECT i.quantity_delta
      FROM inventory_transaction_items i
      WHERE i.transaction_id = NEW.id AND i.product_id = inventory_balances.product_id
    ),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE product_id IN (
    SELECT product_id FROM inventory_transaction_items WHERE transaction_id = NEW.id
  );
END;
--> statement-breakpoint

CREATE TRIGGER trg_items_insert_draft_only
BEFORE INSERT ON inventory_transaction_items
WHEN (SELECT status FROM inventory_transactions WHERE id = NEW.transaction_id) <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_TRANSACTION_LOCKED');
END;
--> statement-breakpoint

CREATE TRIGGER trg_items_update_draft_only
BEFORE UPDATE ON inventory_transaction_items
WHEN (SELECT status FROM inventory_transactions WHERE id = OLD.transaction_id) <> 'draft'
  OR (SELECT status FROM inventory_transactions WHERE id = NEW.transaction_id) <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_TRANSACTION_LOCKED');
END;
--> statement-breakpoint

CREATE TRIGGER trg_items_delete_draft_only
BEFORE DELETE ON inventory_transaction_items
WHEN (SELECT status FROM inventory_transactions WHERE id = OLD.transaction_id) <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_TRANSACTION_LOCKED');
END;
--> statement-breakpoint

-- Imports must add stock and exports must remove it.
CREATE TRIGGER trg_items_insert_direction
BEFORE INSERT ON inventory_transaction_items
WHEN EXISTS (
  SELECT 1 FROM inventory_transactions t
  WHERE t.id = NEW.transaction_id
    AND ((t.type = 'import' AND NEW.quantity_delta < 0)
      OR (t.type = 'export' AND NEW.quantity_delta > 0))
)
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_INVALID_DIRECTION');
END;
--> statement-breakpoint

CREATE TRIGGER trg_items_update_direction
BEFORE UPDATE ON inventory_transaction_items
WHEN EXISTS (
  SELECT 1 FROM inventory_transactions t
  WHERE t.id = NEW.transaction_id
    AND ((t.type = 'import' AND NEW.quantity_delta < 0)
      OR (t.type = 'export' AND NEW.quantity_delta > 0))
)
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_INVALID_DIRECTION');
END;
