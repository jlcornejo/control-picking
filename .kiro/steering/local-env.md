# Entorno de desarrollo local (máquina de Erick)

Reglas del entorno local que Kiro debe recordar siempre en este proyecto.

## Contenedores: Rancher Desktop + nerdctl

- El usuario usa **Rancher Desktop** como runtime de contenedores, con **`nerdctl`** (containerd), NO Docker Desktop.
- Binarios en `~/.rd/bin/` (`nerdctl`, `docker`, `kubectl`). El `docker` que aparece es el shim de Rancher.
- **NO asumas que hay un Docker daemon clásico.** Para inspeccionar/gestionar contenedores usa `nerdctl` (p. ej. `nerdctl ps`), no `docker ps`.
- Si `docker` da "Cannot connect to the Docker daemon at ~/.rd/docker.sock", normalmente es que **la VM de Rancher Desktop está apagada** — pídele al usuario que abra Rancher Desktop y espere a que arranque. No es error de comando.

### Supabase CLI y el motor de contenedores

- La **Supabase CLI habla con Docker** (busca `docker.sock`), por eso puede fallar aunque `nerdctl` funcione.
- Para que `npx supabase start` funcione, Rancher Desktop debe estar en modo **`dockerd (moby)`** (Preferences → Container Engine), no en `containerd`.
- Antes de correr comandos de Supabase local, verifica que Rancher esté corriendo y en el motor correcto.

## Supabase local

- URL local por defecto: `http://127.0.0.1:54321` (Studio en `:54323`, Mailpit en `:54324`).
- El `.env` de la app móvil (`apps/mobile/.env`) usa `EXPO_PUBLIC_SUPABASE_URL` con la **IP LAN de la Mac** (no `127.0.0.1`) para que el iPhone físico pueda alcanzar el servidor. Esa IP es asignada por DHCP y **cambia**; al cambiar rompe tanto Metro como el login (Supabase). Si el login falla o Metro no conecta, revisa/actualiza esa IP.
- Usuarios de prueba en `TEST_USERS.md` (se crean con `bash scripts/seed-users.sh` tras `npx supabase db reset`, esperando ~40s).

## Mobile (Expo)

- Dev server: `npx expo start --dev-client` (device) o `npx expo start --web` (navegador), desde `apps/mobile`.
- macOS NO tiene el comando `timeout` por defecto — no lo uses para envolver comandos.
- Al añadir módulos nativos (p. ej. `expo-crypto`), hay que **recompilar en Xcode (Play)**; un reload de JS no basta.

## Total Recall (memoria persistente entre sesiones)

El MCP `totalrecall` depende de un **worker HTTP** que escucha en `http://127.0.0.1:3001`. Si el worker está caído, TODAS las tools de memoria (`search`, `get_context`, `save_memory`, etc.) fallan con:
`Total Recall worker non raggiungibile su http://127.0.0.1:3001`.

**Al inicio de cada sesión Kiro DEBE asegurarse de que el worker esté arriba.** Paso a paso:

- Instalación (global npm): `/opt/homebrew/lib/node_modules/totalrecallai`
- Datos y logs: `~/.totalrecall/` (db, backups, `logs/totalrecall-YYYY-MM-DD.log`)

### 1. Verificar estado
```bash
curl -s -m 3 http://127.0.0.1:3001/health
```
Si responde `{"status":"ok",...}` → ya está arriba, no hacer nada.

### 2. Arrancar el worker
```bash
cd /opt/homebrew/lib/node_modules/totalrecallai && node plugin/dist/cli/contextkit.js worker:start
```
(equivalente: `npm run worker:start` desde ese directorio). Otros: `worker:stop`, `worker:restart`, `worker:status`.

### 3. Si NO queda saludable — causa raíz más común: módulo nativo desalineado
El worker usa `better-sqlite3` (binario nativo). Al **actualizar Node con Homebrew** el binario queda compilado contra otra versión de Node y el worker muere al arrancar (stdio va a `ignore`, por eso NO aparece error en el log; se ve corriéndolo directo con `node plugin/dist/worker-service.js`).

Síntoma: `Error: The module ...better_sqlite3.node was compiled against a different Node.js version ... NODE_MODULE_VERSION 127 ... requires 147 ... ERR_DLOPEN_FAILED`.

Fix (recompilar el binario nativo contra el Node actual):
```bash
cd /opt/homebrew/lib/node_modules/totalrecallai && npm rebuild better-sqlite3
```
Luego repetir el paso 2 y verificar con el paso 1.

### 4. Ver logs si sigue fallando
```bash
tail -n 40 "$HOME/.totalrecall/logs/totalrecall-$(date +%Y-%m-%d).log"
```
