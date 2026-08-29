# Contribuir a la documentación

Esta documentación usa [MkDocs](https://www.mkdocs.org/) con el tema [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/).

## Requisitos

- Python 3.9+
- pip

Instala las dependencias de documentación:

```bash
pip install -r requirements-docs.txt
```

## Trabajar en local

Servidor de desarrollo con recarga en caliente:

```bash
npm run docs:serve
```

Abre http://127.0.0.1:8000. Al editar cualquier `.md` bajo `docs/`, el sitio se recarga solo.

## Compilar el sitio estático

```bash
npm run docs:build
```

Genera el sitio en la carpeta `site/` (ignorada por Git). Usa `--strict` para fallar ante enlaces rotos.

## Estructura

```
docs/
├── index.md                      # Portada
├── producto/                     # Visión de producto
├── arquitectura/                 # Stack y decisiones técnicas
├── dominio/                      # Reglas de negocio e invariantes
├── api/                          # Endpoints REST
├── base-de-datos/
│   ├── esquema.md                # Portada de la sección
│   └── schema/                   # ← generado por tbls (no editar a mano)
└── contribuir/                   # Esta guía
```

## Contenido generado automáticamente

Parte de la documentación no se escribe a mano:

| Fuente | Herramienta | Salida |
|--------|-------------|--------|
| Migraciones SQL / DB Supabase | [tbls](https://github.com/k1LoW/tbls) | `docs/base-de-datos/schema/` |
| Tipos de `packages/shared` (futuro) | TypeDoc | `docs/referencia/` |
| Spec OpenAPI (futuro) | plugin OpenAPI | `docs/api/referencia/` |

Regenerar la doc del esquema:

```bash
npm run db:docs
```

!!! note "Automatización con Kiro"
    Un hook de Kiro (`.kiro/hooks/regen-db-docs.json`) regenera la documentación del esquema automáticamente al guardar una migración en `supabase/migrations/`. Requiere la base de datos local de Supabase corriendo y `tbls` instalado.

## Estilo

- Escribe en **español** (documentación de negocio y técnica).
- Usa nombres de entidades del [glosario de dominio](../dominio/reglas-de-negocio.md#glosario-tecnico-dominio).
- Un `# H1` por página. Encabezados descriptivos.
- Prefiere tablas para enumeraciones y contratos.

## Publicación

El sitio se publica automáticamente en **GitHub Pages** mediante el workflow `.github/workflows/docs.yml` al hacer push a `main`.
