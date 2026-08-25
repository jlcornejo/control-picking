-- Create picking_records table (core of the system)
CREATE TABLE picking_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  block_id UUID NOT NULL REFERENCES blocks(id) ON DELETE RESTRICT,
  quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  rate_amount_snapshot NUMERIC(12, 2) NOT NULL CHECK (rate_amount_snapshot > 0),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  work_day DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  original_record_id UUID REFERENCES picking_records(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite indexes for common queries
CREATE INDEX idx_picking_records_worker_day ON picking_records (worker_id, work_day);
CREATE INDEX idx_picking_records_block_day ON picking_records (block_id, work_day);
CREATE INDEX idx_picking_records_work_day ON picking_records (work_day);
CREATE INDEX idx_picking_records_recorded_by ON picking_records (recorded_by);

-- Comment
COMMENT ON TABLE picking_records IS 'Individual harvest entries. Each record = one delivery of boxes/kg by a worker.';
COMMENT ON COLUMN picking_records.quantity IS 'Units harvested (boxes or kg). Must be > 0.';
COMMENT ON COLUMN picking_records.rate_amount_snapshot IS 'Rate frozen at time of recording for traceability.';
COMMENT ON COLUMN picking_records.original_record_id IS 'If this is a correction, points to the original record.';
COMMENT ON COLUMN picking_records.recorded_by IS 'Supervisor who registered this entry.';
