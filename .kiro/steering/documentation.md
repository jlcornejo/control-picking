---
inclusion: auto
name: documentation
description: Sistema de documentación del proyecto (MkDocs Material + tbls + GitHub Pages) y la norma de mantenerlo actualizado. Úsalo cuando agregues o modifiques features, endpoints, migraciones, reglas de negocio o decisiones de arquitectura, y siempre que se genere o edite documentación.
---

# Documentación del Proyecto — Fundo360

Fundo360 mantiene su documentación como **docs-as-code**: vive en el repositorio, versionada con Git, y se publica automáticamente. La herramienta es **MkDocs** con el tema **Material for MkDocs**.

## Regla principal (mantener la doc viva)

La documentación es parte del entregable, no un extra opcional. **Toda contribución que cambie comportamiento observable debe actualizar la documentación en el mismo cambio (PR/commit).**

Actualiza `docs/` cuando toques:

| Cambias… | Actualiza… |
|----------|-----------|
| Endpoints / Edge Functions | `docs/api/vision-general.md` |
| Reglas de negocio, invariantes, estados de entidades | `docs/dominio/reglas-de-negocio.md` |
| Stack, decisiones arquitectónicas, estructura del monorepo | `docs/arquitectura/vision-general.md` |
| Alcance del producto, roadmap, usuarios, métricas | `docs/producto/vision-general.md` |
| Etapas del proyecto, estado (listo/pendiente), estimaciones | `docs/planning/vision-general.md` |
| Avance de tareas (empezar/terminar un ítem) | `docs/planning/tablero.md` (mover entre Por hacer / En curso / Hecho) |
| Paridad con la app legacy, decisiones de negocio | `docs/legacy/paridad-fundo360.md` y `docs/legacy/decisiones-negocio.md` |
| Migraciones SQL / esquema de base de datos | Se regenera con `tbls` (ver abajo). No editar a mano `docs/base-de-datos/schema/`. |
| Costos / infraestructura | `docs/producto/cost-estimate.md` |
| Cualquier feature, fix o cambio de infra relevante | `CHANGELOG.md` (raíz) **y** `docs/changelog.md` — añade la entrada en `## [Sin publicar]` de ambos |

Cuando el cambio no encaje en ninguna página existente, crea una página nueva en la carpeta adecuada de `docs/`.

### Flujo recomendado al cerrar un cambio

1. Actualiza la(s) página(s) de `docs/` que correspondan según la tabla de arriba.
2. Si el cambio nació de una decisión de negocio, refléjala en `docs/legacy/decisiones-negocio.md`
   (marca si quedó resuelta) y mueve el ítem en `docs/planning/tablero.md`.
3. Añade la entrada en el `CHANGELOG.md` raíz **y** en `docs/changelog.md` (ver abajo).
4. Verifica el build (`npm run docs:build`, que corre `--strict`) antes de commitear.

## CHANGELOG (historial del proyecto)

Hay **dos** archivos de changelog que deben mantenerse coherentes:

- `CHANGELOG.md` (raíz) — la **fuente de verdad**, formato
  [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
- `docs/changelog.md` — la versión **publicada en el sitio** (MkDocs). Reproduce el contenido
  del raíz para consulta desde la web; enlaza al `CHANGELOG.md` del repo como fuente.

**Toda feature, fix o cambio de infra relevante debe añadir una entrada** bajo
`## [Sin publicar]` en **ambos** archivos, agrupada por tipo (Añadido / Cambiado / Corregido
/ Infra-Deploy). Es la memoria de "qué se construyó y por qué" — mantenerlo al día evita
redescubrir la historia en cada sesión. La navegación se actualiza sola (awesome-pages); si
necesitas fijar orden o título, edita el `.pages` de esa carpeta.

## Estructura

```
docs/
├── index.md                      # Portada
├── producto/                     # Visión de producto, roadmap, backlog de reunión
├── planning/                     # Etapas, estado, estimaciones y tablero (Kanban)
│   ├── vision-general.md         # Fases, listo/pendiente, estimaciones por tema
│   └── tablero.md                # Tablero Por hacer / En curso / Hecho
├── legacy/                       # Paridad con la app legacy "Campo Viejo"
│   ├── vision-general.md         # Qué es el legacy, criterio de salida a terreno
│   ├── mapa-funcional.md         # Módulos, entidades y modelo del legacy
│   ├── paridad-fundo360.md       # Contraste legacy → Fundo360 (✅/⚠️/❌/❔)
│   └── decisiones-negocio.md     # Preguntas abiertas y cerradas para el cliente
├── arquitectura/                 # Stack, decisiones, estructura
├── dominio/                      # Reglas de negocio, invariantes, glosario
├── api/                          # Endpoints REST por módulo
├── base-de-datos/
│   ├── esquema.md                # Portada de la sección
│   └── schema/                   # ← GENERADO por tbls (no editar a mano)
│   └── cost-estimate.md          # Estimación de costos
├── changelog.md                  # Changelog publicado en el sitio (espeja CHANGELOG.md raíz)
└── contribuir/                   # Guía de documentación
```

!!! tip "Planning y tablero como centro del proyecto"
    `docs/planning/` reemplaza la necesidad de Jira/Confluence: concentra el estado del
    proyecto y el seguimiento de tareas, versionado y compartible por link. El tablero es
    hoy una **tabla** (se edita por commit). Un tablero interactivo dentro de la consola de
    plataforma es una fase futura; mientras tanto, mantener `docs/planning/tablero.md` al día
    es la fuente de avance.

!!! note "Navegación"
    La navegación del sitio se genera automáticamente con el plugin **awesome-pages** a partir de la estructura de carpetas y de los archivos `.pages` (uno por carpeta define título y orden). No hay bloque `nav:` en `mkdocs.yml`. Al añadir una página nueva, colócala en la carpeta adecuada y, si hace falta orden explícito, actualiza el `.pages` de esa carpeta.

Config y automatización:

- `mkdocs.yml` — configuración del sitio y navegación (`nav:`)
- `requirements-docs.txt` — dependencias Python de la doc
- `.tbls.yml` — configuración de generación del esquema
- `.kiro/hooks/regen-db-docs.json` — hook que regenera el esquema al guardar migraciones
- `.github/workflows/docs.yml` — publicación en GitHub Pages

## Comandos

```bash
# Instalar dependencias (una vez; preferible en venv aislado .venv-docs/)
pip install -r requirements-docs.txt

# Servir en local con recarga en caliente → http://127.0.0.1:8000
npm run docs:serve

# Compilar el sitio estático (falla ante enlaces rotos)
npm run docs:build

# Regenerar la doc del esquema de BD (requiere Supabase local + tbls)
npm run db:docs
```

## Documentación autogenerada

Parte de la doc **no se escribe a mano** y se produce desde el código o el esquema:

| Fuente | Herramienta | Salida | Estado |
|--------|-------------|--------|--------|
| Esquema de la base de datos (Supabase local) | [tbls](https://github.com/k1LoW/tbls) | `docs/base-de-datos/schema/` | Activo |
| Tipos de `packages/shared` | TypeDoc | `docs/referencia/` | Planificado |
| Spec OpenAPI de las Edge Functions | plugin OpenAPI de Material | `docs/api/referencia/` | Planificado |

### Esquema de base de datos (tbls)

- Configuración en `.tbls.yml`. DSN por defecto: la DB local de Supabase (`postgres://postgres:postgres@127.0.0.1:54322/postgres`); se puede sobreescribir con la variable `TBLS_DSN`.
- Requisitos: `supabase start` corriendo y `tbls` instalado (`brew install tbls`).
- El hook de Kiro `regen-db-docs` (trigger `PostFileSave` sobre `supabase/migrations/*.sql`) regenera esta doc automáticamente cuando existan los requisitos; si no, falla en silencio.
- **Nunca editar a mano** los archivos bajo `docs/base-de-datos/schema/`: se sobrescriben en cada regeneración.

## Publicación (GitHub Pages)

- El workflow `.github/workflows/docs.yml` construye y publica en cada push a `main` que toque `docs/`, `mkdocs.yml` o `requirements-docs.txt`.
- Requisito único en el repo: **Settings → Pages → Source = "GitHub Actions"**.
- Tras publicar, fija `site_url` en `mkdocs.yml` con la URL final de Pages.

## Estilo de escritura

- Documentación de negocio y técnica: **español** (consistente con la convención del proyecto: código en inglés, documentación de negocio en español).
- Usa la nomenclatura del [glosario de dominio](../../docs/dominio/reglas-de-negocio.md): `fields`, `blocks`, `products`, `rates`, `workers`, `picking_records`, `settlements`, `payments`.
- Un solo `# H1` por página; encabezados descriptivos.
- Prefiere tablas para enumeraciones, contratos y mapeos.
- Usa admonitions (`!!! note`, `!!! warning`, `!!! tip`) para destacar notas, advertencias y consejos.
- No dupliques contenido entre steering files y `docs/`: los steering (`.kiro/steering/`) son la fuente de contexto para el agente; `docs/` es la doc navegable para personas. Cuando ambos describan lo mismo (p. ej. reglas de dominio o API), mantenlos coherentes.
