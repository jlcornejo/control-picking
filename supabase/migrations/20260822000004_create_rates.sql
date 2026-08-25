-- Create enum for rate status
CREATE TYPE rate_status AS ENUM ('current', 'historical');

-- Create rates table (price per unit for a product)
CREATE TABLE rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  status rate_status NOT NULL DEFAULT 'current',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for looking up current rate by product
CREATE INDEX idx_rates_product_status ON rates (product_id, status);

-- Unique constraint: only one current rate per product
CREATE UNIQUE INDEX idx_rates_product_current 
  ON rates (product_id) 
  WHERE status = 'current';

-- Comment
COMMENT ON TABLE rates IS 'Price rates per unit (box/kg) for each product. Only one current rate per product at any time.';
COMMENT ON COLUMN rates.amount IS 'Must be > 0. Represents payment per unit (box or kg).';
