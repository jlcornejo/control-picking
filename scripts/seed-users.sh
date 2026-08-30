#!/bin/bash
# Creates auth users and links them to workers / platform_admins after db reset
# Usage: npm run db:seed-users

API_URL="http://127.0.0.1:54321"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
DB_CONTAINER="supabase_db_control-picking"

# Creates an auth user; returns its id via stdout (empty on error).
create_auth_user() {
  local email=$1
  local password=$2
  local response
  response=$(curl -s -X POST "$API_URL/auth/v1/admin/users" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true}")
  echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null
}

# Auth user linked to an existing worker row.
create_worker_user() {
  local email=$1 password=$2 worker_id=$3
  echo "Creating worker user: $email"
  local user_id
  user_id=$(create_auth_user "$email" "$password")
  if [ -n "$user_id" ]; then
    echo "  → Created auth user: $user_id"
    docker exec "$DB_CONTAINER" psql -U postgres -c \
      "UPDATE workers SET auth_user_id = '$user_id' WHERE id = '$worker_id';" > /dev/null
    echo "  → Linked to worker: $worker_id"
  else
    echo "  → ERROR creating $email"
  fi
}

# Auth user registered as a platform admin (SaaS owner / support).
create_platform_admin() {
  local email=$1 password=$2 full_name=$3
  echo "Creating platform admin: $email"
  local user_id
  user_id=$(create_auth_user "$email" "$password")
  if [ -n "$user_id" ]; then
    echo "  → Created auth user: $user_id"
    docker exec "$DB_CONTAINER" psql -U postgres -c \
      "INSERT INTO platform_admins (auth_user_id, full_name, status) VALUES ('$user_id', '$full_name', 'active') ON CONFLICT (auth_user_id) DO NOTHING;" > /dev/null
    echo "  → Registered as platform_admin"
  else
    echo "  → ERROR creating $email"
  fi
}

echo "=== Seeding Auth Users ==="
echo ""

# Cliente 'default' (organización semilla)
create_worker_user "admin@fundo360.cl" "admin123" "aa000001-0000-0000-0000-000000000001"
create_worker_user "supervisor@fundo360.cl" "super123" "aa000002-0000-0000-0000-000000000001"

# Dueño del SaaS / soporte (consola de plataforma)
create_platform_admin "plataforma@fundo360.cl" "plataforma123" "Soporte Fundo360"

echo ""
echo "=== Done! ==="
echo "Login credentials:"
echo "  Cliente admin:      admin@fundo360.cl / admin123"
echo "  Cliente supervisor: supervisor@fundo360.cl / super123"
echo "  Plataforma (SaaS):  plataforma@fundo360.cl / plataforma123"
