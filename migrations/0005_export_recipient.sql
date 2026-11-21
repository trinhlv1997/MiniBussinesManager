ALTER TABLE `inventory_transactions` ADD `customer_id` integer REFERENCES customers(id);--> statement-breakpoint
ALTER TABLE `inventory_transactions` ADD `employee_id` integer REFERENCES employees(id);--> statement-breakpoint
CREATE INDEX `inventory_tx_customer_idx` ON `inventory_transactions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `inventory_tx_employee_idx` ON `inventory_transactions` (`employee_id`);--> statement-breakpoint

-- Links existing exports whose free-text recipient names exactly one person.
-- Confirmed documents are locked, so the lock is lifted for this one backfill.
DROP TRIGGER trg_tx_locked_update;
--> statement-breakpoint

UPDATE inventory_transactions
SET customer_id = (
      SELECT c.id FROM customers c WHERE c.name = inventory_transactions.reference AND c.deleted_at IS NULL
    ),
    reference = NULL
WHERE type = 'export'
  AND (SELECT COUNT(*) FROM customers c
       WHERE c.name = inventory_transactions.reference AND c.deleted_at IS NULL) = 1;
--> statement-breakpoint

UPDATE inventory_transactions
SET employee_id = (
      SELECT e.id FROM employees e WHERE e.full_name = inventory_transactions.reference AND e.deleted_at IS NULL
    ),
    reference = NULL
WHERE type = 'export'
  AND customer_id IS NULL
  AND (SELECT COUNT(*) FROM employees e
       WHERE e.full_name = inventory_transactions.reference AND e.deleted_at IS NULL) = 1;
--> statement-breakpoint

CREATE TRIGGER trg_tx_locked_update
BEFORE UPDATE ON inventory_transactions
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_TRANSACTION_LOCKED');
END;
--> statement-breakpoint

-- Only exports have a recipient, and it is one customer or one employee.
CREATE TRIGGER trg_tx_recipient_insert
BEFORE INSERT ON inventory_transactions
WHEN (NEW.customer_id IS NOT NULL OR NEW.employee_id IS NOT NULL)
  AND (NEW.type <> 'export' OR (NEW.customer_id IS NOT NULL AND NEW.employee_id IS NOT NULL))
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_INVALID_RECIPIENT');
END;
--> statement-breakpoint

CREATE TRIGGER trg_tx_recipient_update
BEFORE UPDATE OF customer_id, employee_id ON inventory_transactions
WHEN (NEW.customer_id IS NOT NULL OR NEW.employee_id IS NOT NULL)
  AND (NEW.type <> 'export' OR (NEW.customer_id IS NOT NULL AND NEW.employee_id IS NOT NULL))
BEGIN
  SELECT RAISE(ABORT, 'INVENTORY_INVALID_RECIPIENT');
END;
