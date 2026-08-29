-- ============================================================
-- MULTI-TENANT: integridad de tenant vía FKs compuestas
-- ============================================================
-- Previene "cruces" de tenant por FK (ej. un picking_record de la org A
-- referenciando un block de la org B). Cada FK cross-table se refuerza a
-- una FK compuesta (id, organization_id), de modo que Postgres garantiza
-- que ambos extremos pertenecen a la misma organización.
--
-- Requisito: la tabla referenciada debe tener UNIQUE (id, organization_id).
-- (id ya es PK; el UNIQUE compuesto es lo que exige Postgres para la FK.)
-- ============================================================

-- ------------------------------------------------------------
-- Claves únicas compuestas en tablas destino de FK
-- ------------------------------------------------------------
ALTER TABLE products    ADD CONSTRAINT uq_products_id_org    UNIQUE (id, organization_id);
ALTER TABLE fields      ADD CONSTRAINT uq_fields_id_org      UNIQUE (id, organization_id);
ALTER TABLE blocks      ADD CONSTRAINT uq_blocks_id_org      UNIQUE (id, organization_id);
ALTER TABLE workers     ADD CONSTRAINT uq_workers_id_org     UNIQUE (id, organization_id);
ALTER TABLE settlements ADD CONSTRAINT uq_settlements_id_org UNIQUE (id, organization_id);

-- ------------------------------------------------------------
-- blocks -> fields, products (misma organización)
-- ------------------------------------------------------------
ALTER TABLE blocks DROP CONSTRAINT blocks_field_id_fkey;
ALTER TABLE blocks ADD CONSTRAINT fk_blocks_field_org
  FOREIGN KEY (field_id, organization_id) REFERENCES fields (id, organization_id) ON DELETE RESTRICT;

ALTER TABLE blocks DROP CONSTRAINT blocks_product_id_fkey;
ALTER TABLE blocks ADD CONSTRAINT fk_blocks_product_org
  FOREIGN KEY (product_id, organization_id) REFERENCES products (id, organization_id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- rates -> products
-- ------------------------------------------------------------
ALTER TABLE rates DROP CONSTRAINT rates_product_id_fkey;
ALTER TABLE rates ADD CONSTRAINT fk_rates_product_org
  FOREIGN KEY (product_id, organization_id) REFERENCES products (id, organization_id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- picking_records -> workers (worker_id, recorded_by), blocks (block_id)
-- ------------------------------------------------------------
ALTER TABLE picking_records DROP CONSTRAINT picking_records_worker_id_fkey;
ALTER TABLE picking_records ADD CONSTRAINT fk_picking_worker_org
  FOREIGN KEY (worker_id, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

ALTER TABLE picking_records DROP CONSTRAINT picking_records_recorded_by_fkey;
ALTER TABLE picking_records ADD CONSTRAINT fk_picking_recorded_by_org
  FOREIGN KEY (recorded_by, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

ALTER TABLE picking_records DROP CONSTRAINT picking_records_block_id_fkey;
ALTER TABLE picking_records ADD CONSTRAINT fk_picking_block_org
  FOREIGN KEY (block_id, organization_id) REFERENCES blocks (id, organization_id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- supervisor_assignments -> workers (supervisor_id, worker_id), blocks (block_id)
-- worker_id y block_id son nullable; la FK compuesta acepta NULL.
-- ------------------------------------------------------------
ALTER TABLE supervisor_assignments DROP CONSTRAINT supervisor_assignments_supervisor_id_fkey;
ALTER TABLE supervisor_assignments ADD CONSTRAINT fk_assignment_supervisor_org
  FOREIGN KEY (supervisor_id, organization_id) REFERENCES workers (id, organization_id) ON DELETE CASCADE;

ALTER TABLE supervisor_assignments DROP CONSTRAINT supervisor_assignments_worker_id_fkey;
ALTER TABLE supervisor_assignments ADD CONSTRAINT fk_assignment_worker_org
  FOREIGN KEY (worker_id, organization_id) REFERENCES workers (id, organization_id) ON DELETE CASCADE;

ALTER TABLE supervisor_assignments DROP CONSTRAINT supervisor_assignments_block_id_fkey;
ALTER TABLE supervisor_assignments ADD CONSTRAINT fk_assignment_block_org
  FOREIGN KEY (block_id, organization_id) REFERENCES blocks (id, organization_id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- settlements -> workers
-- ------------------------------------------------------------
ALTER TABLE settlements DROP CONSTRAINT settlements_worker_id_fkey;
ALTER TABLE settlements ADD CONSTRAINT fk_settlements_worker_org
  FOREIGN KEY (worker_id, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

-- ------------------------------------------------------------
-- payments -> settlements (settlement_id), workers (worker_id)
-- ------------------------------------------------------------
ALTER TABLE payments DROP CONSTRAINT payments_settlement_id_fkey;
ALTER TABLE payments ADD CONSTRAINT fk_payments_settlement_org
  FOREIGN KEY (settlement_id, organization_id) REFERENCES settlements (id, organization_id) ON DELETE RESTRICT;

ALTER TABLE payments DROP CONSTRAINT payments_worker_id_fkey;
ALTER TABLE payments ADD CONSTRAINT fk_payments_worker_org
  FOREIGN KEY (worker_id, organization_id) REFERENCES workers (id, organization_id) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT fk_picking_block_org ON picking_records IS 'Garantiza que el picking_record y su block pertenecen a la misma organización.';
