---
inclusion: auto
name: remote-env
description: "Ambiente REMOTO de Fundo360 (Supabase Cloud, proyecto fundo360 en São Paulo): cómo conectarse a su base de datos, dónde están las credenciales, los dos tenants de prueba y cómo sembrar/consultar datos. Úsalo al trabajar contra el remoto, ejecutar SQL, correr seeds, o depurar el deploy en Vercel/EAS preview."
---

# Ambiente remoto (Supabase Cloud — proyecto `fundo360`)

Todo el ambiente remoto es de **PRUEBAS**. El APK `preview` (EAS) y el deploy web
(`fundo360.vercel.app`) apuntan aquí.

- Proyecto: `fundo360`, ref `eklnnvhlgitvfxwuhgnv`, región `sa-east-1` (São Paulo).
- CLI vinculada: `supabase/.temp/linked-project.json`. `npx supabase projects list` muestra el link.

## Conexión a la base de datos remota

**El host DIRECTO `db.eklnnvhlgitvfxwuhgnv.supabase.co` NO resuelve por IPv4 desde esta red
(solo IPv6) → falla.** Hay que usar el **pooler**, que sí conecta por IPv4.

- Credenciales guardadas en `scripts/.env.remote` (ignorado por git). Variables:
  - `REMOTE_DB_CONN` → session pooler (puerto 5432). **Usar este por defecto.**
  - `REMOTE_DB_CONN_TX` → transaction pooler (puerto 6543).
  - `REMOTE_DB_PASSWORD` → password del rol `postgres`.
- Formato del string que funciona:
  ```
  postgresql://postgres.eklnnvhlgitvfxwuhgnv:<PASSWORD>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
  ```
- Si el usuario resetea el password en el dashboard (botón **Connect** o Settings → Infrastructure;
  en el dashboard nuevo NO hay "Settings → Database"), actualiza `scripts/.env.remote`.
  Resetear NO rompe nada más: las apps usan solo la **anon key pública**, no el password de Postgres.

### Ejecutar SQL contra el remoto

`psql` se instaló vía Homebrew `libpq` (keg-only): binario en `/opt/homebrew/opt/libpq/bin/psql`
(no está en el PATH). **`supabase db query` NO sirve para multi-statement** (da
"cannot insert multiple commands into a prepared statement"); usa `psql` para archivos `.sql`.

```bash
set -a; source scripts/.env.remote; set +a
/opt/homebrew/opt/libpq/bin/psql "$REMOTE_DB_CONN" -v ON_ERROR_STOP=1 -f <archivo.sql>
# consulta rápida:
/opt/homebrew/opt/libpq/bin/psql "$REMOTE_DB_CONN" -c "select 1;"
```

## Tenants de prueba (remoto)

| Tenant | slug | Modo Capataz | Melgas (`rows_enabled`) | Producto | Tarifa |
|--------|------|:---:|:---:|---|---|
| Sur Berries SpA | `sur-berries` | sí | **sí** | Frutilla (kg) | $1.200 |
| Andes Fruit SpA | `andes-fruit` | sí | no | Cereza (kg) | $2.100 |

También existe el tenant `default` (Campo Verde) de deploys previos, sin modo capataz.

- Usuarios de login y badges QR: ver `TEST_USERS.md` (sección **REMOTO**).
- Plataforma (super-admin): `plataforma@fundo360.cl` / `plataforma123`.

## Seeds del remoto

- `supabase/_seed_remote.sql` → datos base (tenants, workers, productos, melgas, crews,
  rosters de hoy, historial de 30 días, liquidaciones/pagos, feature flags). Idempotente.
- `supabase/_seed_oct_remote.sql` → cosecha diaria de octubre 2026 (1–16) para ambos tenants
  + liquidaciones quincenales (estados mixtos) + pagos. **Borra octubre antes de reinsertar**
  (idempotente). Usa `random()`, así que cada corrida da cantidades distintas; los totales de
  liquidación se recalculan del picking, siempre coherentes.
- Usuarios de Auth: `scripts/seed-users-remote.sh` (requiere `REMOTE_URL`, `REMOTE_SERVICE_KEY`,
  `REMOTE_DB_CONN`); crea los usuarios y vincula `auth_user_id`.

### Notas de esquema útiles para seeds
- `picking_records.payment_unit` es tipo `unit_measure` (`box` | `kg`), NOT NULL.
  OJO: el seed base usa `'box'` aunque los productos están en `kg` (inconsistencia conocida).
- `picking_records.out_of_tolerance` NOT NULL (default `false`).
- `settlements.status` = `settlement_status` (`pending` | `partial` | `paid`).
- `settlements.payee_type` = `settlement_payee_type` (`worker` | `crew`).
- Invariantes de dominio: `quantity > 0`, `rate > 0`, un pago `partial` debe ser menor al total.

## Docs y publicación

- La guía de pruebas por rol vive en `docs/pruebas/` (MkDocs Material) y se publica en
  GitHub Pages (`https://jlcornejo.github.io/control-picking/`) automáticamente al hacer
  push a `main` cuando cambia `docs/**` (workflow `.github/workflows/docs.yml`).
- Build local de docs: `source .venv-docs/bin/activate && mkdocs build --strict`.
