#!/bin/bash
# Creates auth users and links them to workers after db reset
# Usage: npm run db:seed-users

API_URL="http://127.0.0.1:54321"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

create_user() {
  local email=$1
  local password=$2
  local worker_id=$3

  echo "Creating user: $email"
  local response=$(curl -s -X POST "$API_URL/auth/v1/admin/users" \
    -H "Authorization: Bearer $SERVICE_KEY" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true}")

  local user_id=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

  if [ -n "$user_id" ] && [ "$user_id" != "" ]; then
    echo "  → Created auth user: $user_id"
    # Link to worker
    docker exec supabase_db_control-picking psql -U postgres -c \
      "UPDATE workers SET auth_user_id = '$user_id' WHERE id = '$worker_id';" > /dev/null
    echo "  → Linked to worker: $worker_id"
  else
    echo "  → ERROR: $response"
  fi
}

echo "=== Seeding Auth Users ==="
echo ""

create_user "admin@picking.cl" "admin123" "aa000001-0000-0000-0000-000000000001"
create_user "supervisor@picking.cl" "super123" "aa000002-0000-0000-0000-000000000001"

echo ""
echo "=== Done! ==="
echo "Login credentials:"
echo "  admin@picking.cl / admin123"
echo "  supervisor@picking.cl / super123"
