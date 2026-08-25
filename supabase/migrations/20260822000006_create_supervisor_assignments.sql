-- Create supervisor_assignments table
-- Links supervisors to workers and/or blocks they manage
CREATE TABLE supervisor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE,
  block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- At least one of worker_id or block_id must be set
  CONSTRAINT chk_assignment_target CHECK (
    worker_id IS NOT NULL OR block_id IS NOT NULL
  ),
  -- Prevent duplicate assignments
  CONSTRAINT uq_supervisor_worker UNIQUE (supervisor_id, worker_id),
  CONSTRAINT uq_supervisor_block UNIQUE (supervisor_id, block_id)
);

-- Indexes
CREATE INDEX idx_supervisor_assignments_supervisor ON supervisor_assignments (supervisor_id);
CREATE INDEX idx_supervisor_assignments_worker ON supervisor_assignments (worker_id);
CREATE INDEX idx_supervisor_assignments_block ON supervisor_assignments (block_id);

-- Comment
COMMENT ON TABLE supervisor_assignments IS 'Maps supervisors to the workers and blocks they manage.';
