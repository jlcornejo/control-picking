-- Allow workers to read blocks where they have picking records
-- This fixes the production screen showing "—" instead of block names

CREATE POLICY worker_read_blocks_with_records ON blocks
FOR SELECT
USING (
  is_worker() AND id IN (
    SELECT DISTINCT block_id FROM picking_records WHERE worker_id = current_worker_id()
  )
);
