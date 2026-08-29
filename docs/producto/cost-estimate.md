# Estimación de Costos — Sistema de Control de Picking

## Supuestos Operacionales

| Parámetro | Valor estimado |
|-----------|---------------|
| Campos gestionados | 1-3 fundos |
| Paños totales | 10-30 |
| Trabajadores en temporada | 50-150 |
| Supervisores | 5-10 |
| Administradores | 2-3 |
| Registros de picking por día (temporada) | 500-2,000 |
| Temporada de cosecha | 3-4 meses al año |
| Meses de baja actividad | 8-9 meses (consultas y config) |

---

## 1. Infraestructura y Servicios (Costo Mensual Recurrente)

### Supabase — Backend as a Service

| Concepto | Plan Free | Plan Pro | Notas |
|----------|-----------|----------|-------|
| **Base mensual** | $0 | **$25/mes** | Auth + DB + Storage + Realtime + Edge Functions |
| Database (PostgreSQL) | 500 MB | 8 GB incluidos | ~50K picking records = ~200 MB/año |
| Storage (QR badges) | 1 GB | 100 GB incluidos | ~150 badges × 10 KB = < 5 MB |
| Edge Functions | 500K invocaciones | 2M invocaciones | Picking + consultas = ~100K/mes temporada |
| Auth (MAU) | 50K | 100K incluidos | 150 workers + 10 supervisors = OK |
| Realtime connections | 200 concurrent | 500 concurrent | Dashboard = ~5 connections |
| Bandwidth | 5 GB | 250 GB incluidos | Suficiente para app + dashboard |

**Recomendación**: Plan **Pro a $25/mes**. Cubre de sobra la operación estimada.

### Vercel — Hosting Web Dashboard

| Concepto | Hobby (Free) | Pro | Notas |
|----------|-------------|-----|-------|
| **Base mensual** | $0 | **$20/seat/mes** | SSR, edge functions, CDN |
| Bandwidth | 100 GB | 1 TB | Dashboard admin = bajo tráfico |
| Serverless exec | 100 GB-hrs | 1000 GB-hrs | Suficiente |
| Builds | 6000 min | 24000 min | Más que suficiente |

**Recomendación**: Plan **Hobby (gratis)** para inicio. Upgrade a Pro ($20/mes) si necesitas equipo de desarrollo con acceso al dashboard de Vercel.

### Expo EAS — Build y Distribución Mobile

| Concepto | Free | Production | Notas |
|----------|------|-----------|-------|
| **Base mensual** | $0 | **$99/mes** | Builds + Updates + Submit |
| Builds (iOS + Android) | 30/mes (low priority) | 100/mes (medium) | 2-4 builds/semana en dev |
| EAS Update | 1,500 updates | 25,000 updates | OTA updates sin app store |
| Submit | Incluido | Incluido | Auto-submit a stores |

**Recomendación**: Plan **Free** + builds locales en Mac M1 (Xcode + Android Studio). No se requiere plan pago de Expo. El equipo de desarrollo tiene Mac M1 que soporta compilación nativa iOS y Android.

---

## 2. Costos Únicos (One-time)

| Concepto | Costo | Notas |
|----------|-------|-------|
| Apple Developer Program | **$99/año** | Requerido para publicar en App Store |
| Google Play Developer | **$25 (una vez)** | Sin renovación anual |
| Dominio web (.cl o .com) | **$10-15/año** | Para dashboard admin |
| SSL | $0 | Incluido en Vercel y Supabase |

---

## 3. Escenarios de Costo Mensual

### Escenario A: Desarrollo / MVP (Primeros 3-6 meses)

Solo desarrollo, sin producción ni app stores.

| Servicio | Costo/mes |
|----------|-----------|
| Supabase Free | $0 |
| Vercel Hobby | $0 |
| Expo Free | $0 |
| **Total mensual** | **$0** |

### Escenario B: Producción Básica (1 fundo, 50-80 workers)

Primera temporada en producción. Builds locales en Mac M1.

| Servicio | Costo/mes |
|----------|-----------|
| Supabase Pro | $25 |
| Vercel Hobby | $0 |
| Expo Free + builds locales (Mac M1) | $0 |
| Apple Developer (prorrateado) | $8.25 |
| Dominio | $1 |
| **Total mensual** | **~$34** |
| **Total anual** | **~$410** |

### Escenario C: Producción Full (3 fundos, 150 workers, equipo dev)

Operación completa con equipo.

| Servicio | Costo/mes |
|----------|-----------|
| Supabase Pro | $25 |
| Supabase overages (DB > 8GB) | $0.125/GB extra (~$2) |
| Vercel Pro (2 seats) | $40 |
| Expo Production | $99 |
| Apple Developer (prorrateado) | $8.25 |
| Dominio | $1 |
| **Total mensual** | **~$175** |
| **Total anual** | **~$2,100** |

---

## 4. Comparativa vs. Soluciones del Mercado

| Solución | Costo estimado/año | Modelo |
|----------|-------------------|--------|
| **Este sistema (Escenario B)** | **$410 - $1,600** | Propio, control total |
| FieldClock | $3,000 - $8,000 | SaaS, por # workers |
| Hectre | $5,000 - $15,000 | SaaS, por hectárea |
| Croptracker | $2,400 - $6,000 | SaaS, suscripción anual |
| LEIDER (Chile) | No publica precios | SaaS, demo requerida |
| Desarrollo custom (agencia) | €10,400+ MVP (Optimum-Web) | One-time + mantenimiento |

**Ventaja**: Con desarrollo propio sobre Supabase, el costo operativo es **5-10x menor** que las soluciones SaaS del mercado, y se tiene **control total** sobre datos, features y evolución del producto.

---

## 5. Costos de Desarrollo (Horas Estimadas)

Si el desarrollo lo realiza un equipo (tú o un equipo contratado):

| Fase | Tasks | Horas estimadas | Notas |
|------|-------|----------------|-------|
| Fase 1 — MVP | Tasks 1-18 | 160-240 hrs | Setup + DB + API core + Web + Mobile |
| Fase 2 — Financiera | Tasks 19-24 | 60-90 hrs | Liquidaciones, pagos, asignaciones |
| Fase 3 — Inteligencia | Tasks 25-28 | 50-80 hrs | Métricas, dashboard, reportes |
| **Total** | 28 tasks | **270-410 hrs** | |

A un costo de desarrollo de:
- **Desarrollador senior Chile**: $30-50 USD/hr → **$8,100 - $20,500** total
- **Freelancer internacional**: $50-100 USD/hr → **$13,500 - $41,000** total
- **Desarrollo propio (tú)**: $0 costo directo (pero tu tiempo tiene valor)

---

## 6. Costo Total del Proyecto (Primer Año)

### Si desarrollas tú mismo:

| Concepto | Costo |
|----------|-------|
| Infraestructura (Escenario B) | $410 - $1,600 |
| Apple + Google stores | $124 |
| Dominio | $12 |
| **Total primer año** | **~$550 - $1,740** |

### Si contratas desarrollo:

| Concepto | Costo |
|----------|-------|
| Desarrollo (senior Chile, 300 hrs) | $9,000 - $15,000 |
| Infraestructura (Escenario B) | $410 - $1,600 |
| Stores + Dominio | $136 |
| **Total primer año** | **~$9,550 - $16,740** |

---

## 7. Proyección a 3 Años

| Año | Infra | Dev/Mantención | Total |
|-----|-------|----------------|-------|
| Año 1 | $1,600 | $0 (propio) o $12,000 | $1,600 - $13,600 |
| Año 2 | $2,100 | $2,000 (mejoras) | $4,100 |
| Año 3 | $2,100 | $2,000 (mejoras) | $4,100 |
| **Total 3 años** | | | **$7,800 - $21,800** |

vs. SaaS tipo FieldClock: **$9,000 - $24,000** en 3 años (sin control del producto).

---

## 8. Recomendación

1. **Empezar en Escenario A ($0/mes)** durante todo el desarrollo del MVP
2. **Migrar a Escenario B (~$34/mes)** cuando el sistema entre en producción con la primera temporada
3. **Evaluar Escenario C** solo si se expande a múltiples fundos o se forma equipo de desarrollo
4. El ROI es positivo desde la primera temporada si reemplaza proceso manual con errores

---

*Última actualización: Agosto 2026*
*Precios sujetos a cambios por parte de los proveedores*
