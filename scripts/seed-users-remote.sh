#!/bin/bash
# ============================================================
# Crea usuarios de Auth en el proyecto REMOTO y los vincula a
# workers / platform_admins. Datos de PRUEBA (passwords conocidas).
#
# Requiere variables de entorno (NO hardcodear secretos en el repo):
#   REMOTE_URL         -> https://<ref>.supabase.co
#   REMOTE_SERVICE_KEY -> service_role key (secreta) del proyecto
#   REMOTE_DB_CONN     -> connection string del pooler
#                         postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:5432/postgres
#   PSQL_DOCKER        -> (opcional) contenedor con psql. Default: supabase_db_control-picking
#
# Uso:
#   REMOTE_URL=... REMOTE_SERVICE_KEY=... REMOTE_DB_CONN=... bash scripts/seed-users-remote.sh
# ============================================================
set -euo pipefail

: "${REMOTE_URL:?falta REMOTE_URL}"
: "${REMOTE_SERVICE_KEY:?falta REMOTE_SERVICE_KEY}"
: "${REMOTE_DB_CONN:?falta REMOTE_DB_CONN}"
PSQL_DOCKER="${PSQL_DOCKER:-supabase_db_control-picking}"

db() { docker exec -i "$PSQL_DOCKER" psql "$REMOTE_DB_CONN" -v ON_ERROR_STOP=1 -tAc "$1"; }

# Crea (o reutiliza) un usuario de Auth; imprime su id.
create_auth_user() {
  local email=$1 password=$2 resp id
  resp=$(curl -s -X POST "$REMOTE_URL/auth/v1/admin/users" \
    -H "Authorization: Bearer $REMOTE_SERVICE_KEY" \
    -H "apikey: $REMOTE_SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true}")
  id=$(echo "$resp" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))" 2>/dev/null || true)
  if [ -z "$id" ]; then
    # Ya existe: buscarlo por email
    id=$(curl -s "$REMOTE_URL/auth/v1/admin/users?page=1&per_page=200" \
      -H "Authorization: Bearer $REMOTE_SERVICE_KEY" -H "apikey: $REMOTE_SERVICE_KEY" \
      | python3 -c "import sys,json;us=json.load(sys.stdin).get('users',[]);print(next((u['id'] for u in us if u.get('email')=='$email'),''))" 2>/dev/null || true)
  fi
  echo "$id"
}

link_worker() {
  local email=$1 password=$2 worker_id=$3 uid
  echo "Worker: $email"
  uid=$(create_auth_user "$email" "$password")
  if [ -n "$uid" ]; then
    db "UPDATE workers SET auth_user_id = '$uid' WHERE id = '$worker_id';" >/dev/null
    echo "  -> $uid vinculado a worker $worker_id"
  else
    echo "  -> ERROR creando $email"
  fi
}

link_platform_admin() {
  local email=$1 password=$2 name=$3 uid
  echo "Platform admin: $email"
  uid=$(create_auth_user "$email" "$password")
  if [ -n "$uid" ]; then
    db "INSERT INTO platform_admins (auth_user_id, full_name, status) VALUES ('$uid', '$name', 'active') ON CONFLICT (auth_user_id) DO NOTHING;" >/dev/null
    echo "  -> $uid registrado como platform_admin"
  else
    echo "  -> ERROR creando $email"
  fi
}

echo "=== Seeding usuarios Auth (REMOTO) ==="

# --- sur-berries (capataz + melgas) ---
link_worker "admin@surberries.cl"      "admin123"    "aa0000ff-0000-0000-0000-000000000001"
link_worker "supervisor@surberries.cl" "super123"    "aa0000fa-0000-0000-0000-000000000001"
link_worker "capataz@surberries.cl"    "capataz123"  "aa0000fe-0000-0000-0000-000000000001"

# --- andes-fruit (capataz, sin melgas) ---
link_worker "admin@andesfruit.cl"      "admin123"    "ab0000ff-0000-0000-0000-000000000001"
link_worker "supervisor@andesfruit.cl" "super123"    "ab0000fa-0000-0000-0000-000000000001"
link_worker "capataz@andesfruit.cl"    "capataz123"  "ab0000fe-0000-0000-0000-000000000001"

# --- plataforma (super-admin) ---
link_platform_admin "plataforma@fundo360.cl" "plataforma123" "Soporte Fundo360"

echo ""
echo "=== Listo ==="
echo "Logins (todos passwords de prueba):"
echo "  [sur-berries] admin@surberries.cl/admin123 · supervisor@surberries.cl/super123 · capataz@surberries.cl/capataz123"
echo "  [andes-fruit] admin@andesfruit.cl/admin123 · supervisor@andesfruit.cl/super123 · capataz@andesfruit.cl/capataz123"
echo "  [plataforma]  plataforma@fundo360.cl/plataforma123"
