-- ============================================================
-- FASE A (onboarding super-admin): forzar cambio de contraseña
-- ============================================================
-- Cuando el super-admin da de alta un cliente, crea su usuario admin con una
-- contraseña inicial que él define y entrega. Ese admin debe cambiarla en su
-- primer inicio de sesión.
--
-- Bandera a nivel de worker: al crear el admin del cliente se marca en true.
-- El login la expone y la app (web/móvil) obliga a cambiar la contraseña antes
-- de continuar. Al completar el cambio, se pone en false.
-- ============================================================

ALTER TABLE workers
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN workers.must_change_password IS
  'True si el usuario debe cambiar su contraseña en el próximo login (cuenta creada por el super-admin). La app fuerza el cambio antes de permitir el acceso.';

-- El hook de claims lee de workers; ya tiene SELECT. No se requieren grants nuevos.
