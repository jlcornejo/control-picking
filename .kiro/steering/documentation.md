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
| Migraciones SQL / esquema de base de datos | Se regenera con `tbls` (ver abajo). No editar a mano `docs/base-de-datos/schema/`. |
| Costos / infraestructura | `docs/producto/cost-estimate.md` |

Cuando el cambio no encaje en ninguna página existente, crea una página nueva en la carpeta adecuada de `docs/`. La navegación se actualiza sola (awesome-pages); si necesitas fijar orden o título, edita el `.pages` de esa carpeta.

## Estructura

```
docs/
├── index.md                      # Portada
├── producto/                     # Visión de producto, roadmap
├── arquitectura/                 # Stack, decisiones, estructura
├── dominio/                      # Reglas de negocio, invariantes, glosario
├── api/                          # Endpoints REST por módulo
├── base-de-datos/
│   ├── esquema.md                # Portada de la sección
│   └── schema/                   # ← GENERADO por tbls (no editar a mano)
│   └── cost-estimate.md          # Estimación de costos
└── contribuir/                   # Guía de documentación
```

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
