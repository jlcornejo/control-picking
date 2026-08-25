-- Create enum for settlement status
CREATE TYPE settlement_status AS ENUM ('pending', 'partial', 'paid');

-- Create settlements table (payment calculations for a period)
CREATE TABLE settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  status settlement_status NOT NULL DEFAULT 'pending',
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Period end must be >= period start
  CONSTRAINT chk_settlement_period CHECK (period_end >= period_start),
  -- Prevent duplicate settlements for same worker and period
  CONSTRAINT uq_settlement_worker_period UNIQUE (worker_id, period_start, period_end)
);

-- Indexes
CREATE INDEX idx_settlements_worker ON settlements (worker_id);
CREATE INDEX idx_settlements_status ON settlements (status);
CREATE INDEX idx_settlements_period ON settlements (period_start, period_end);

-- Create payments table (actual payments against settlements)
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES settlements(id) ON DELETE RESTRICT,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_payments_settlement ON payments (settlement_id);
CREATE INDEX idx_payments_worker ON payments (worker_id);
CREATE INDEX idx_payments_paid_at ON payments (paid_at);

-- Trigger: prevent modifications to paid settlements
CREATE OR REPLACE FUNCTION prevent_paid_settlement_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    RAISE EXCEPTION 'Cannot modify a settlement that has been fully paid (id: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_settlements_immutable_when_paid
  BEFORE UPDATE ON settlements
  FOR EACH ROW
  EXECUTE FUNCTION prevent_paid_settlement_update();

-- Comments
COMMENT ON TABLE settlements IS 'Calculated payment due for a worker over a date range.';
COMMENT ON TABLE payments IS 'Actual payments made against settlements.';
COMMENT ON COLUMN settlements.total_amount IS 'Sum of (quantity * rate_snapshot) for all picking records in the period.';
COMMENT ON COLUMN payments.amount IS 'Must be > 0 and total payments cannot exceed settlement total_amount.';
