ALTER TABLE `inventory_transaction_items` ADD `unit_cost` integer;--> statement-breakpoint

-- Past exports never stored a cost, so today's cost price is the best available estimate.
DROP TRIGGER trg_items_update_draft_only;
--> statement-breakpoint

UPDATE inventory_transaction_items
SET unit_cost = (SELECT p.cost_price FROM products p WHERE p.id = inventory_transaction_items.product_id)
WHERE transaction_id IN (
  SELECT t.id FROM inventory_transactions t WHERE t.type = 'export' AND t.status = 'confirmed'
);
--> statement-breakpoint

CREATE TRIGGER trg_items_update_draft_only
BEFORE UPDATE ON inventory_transaction_items
WHEN (SELECT status FROM inventory_transactions WHERE id = OLD.transaction_id) <> 'draft'
  OR (SELECT status FROM inventory_transactions WHERE id = NEW.transaction_id) <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_TRANSACTION_LOCKED');
END;
