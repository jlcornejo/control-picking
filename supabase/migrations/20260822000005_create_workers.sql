-- Create enum for worker roles
CREATE TYPE worker_role AS ENUM ('admin', 'supervisor', 'worker');

-- Create workers table
CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(150) NOT NULL,
  national_id VARCHAR(20),
  phone VARCHAR(20),
  role worker_role NOT NULL DEFAULT 'worker',
  qr_badge_url TEXT,
  status entity_status NOT NULL DEFAULT 'active',
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_workers_status ON workers (status);
CREATE INDEX idx_workers_role ON workers (role);
CREATE INDEX idx_workers_auth_user_id ON workers (auth_user_id);

-- Trigger to auto-update updated_at
CREATE TRIGGER trg_workers_updated_at
  BEFORE UPDATE ON workers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment
COMMENT ON TABLE workers IS 'Farm workers, supervisors, and admins. Linked to Supabase Auth.';
COMMENT ON COLUMN workers.national_id IS 'RUT or national ID. Encrypted at rest by Supabase.';
COMMENT ON COLUMN workers.qr_badge_url IS 'URL to QR badge image in Supabase Storage.';
