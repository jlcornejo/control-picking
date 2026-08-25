-- Create fields table (farm/fundo)
CREATE TABLE fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  location VARCHAR(200),
  total_area NUMERIC(10, 2) NOT NULL CHECK (total_area > 0),
  status entity_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for filtering by status
CREATE INDEX idx_fields_status ON fields (status);

-- Trigger to auto-update updated_at
CREATE TRIGGER trg_fields_updated_at
  BEFORE UPDATE ON fields
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment
COMMENT ON TABLE fields IS 'Farm/fundo - top-level productive unit';
