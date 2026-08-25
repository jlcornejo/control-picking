-- Create blocks table (paño/cuartel within a field)
CREATE TABLE blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES fields(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  name VARCHAR(100) NOT NULL,
  area NUMERIC(10, 2) NOT NULL CHECK (area > 0),
  status entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes on foreign keys and status
CREATE INDEX idx_blocks_field_id ON blocks (field_id);
CREATE INDEX idx_blocks_product_id ON blocks (product_id);
CREATE INDEX idx_blocks_status ON blocks (status);

-- Trigger to auto-update updated_at
CREATE TRIGGER trg_blocks_updated_at
  BEFORE UPDATE ON blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment
COMMENT ON TABLE blocks IS 'Block/paño - subdivision of a field, linked to a product';
