# administracion · BioWellness

Panel del rol **Administración** de BioWellness San Isidro (`admin.medplum.com.ar`):
dashboards de productos y servicios, embudo comercial, retención, segmentación,
campañas, ocupación de agenda, utilización y LTV.

Backend compartido: **Medplum FHIR R4** (`https://api.medplum.com.ar/`). Esta app
**lee y presenta** los datos que producen los Bots de Medplum; no los crea.

## Stack

- **Vite 5** + **React 18** + **TypeScript 5**
- **Mantine 7** (`@mantine/core`, `@mantine/hooks`, `@mantine/notifications`), theme `teal`
- **`@medplum/react`** + **`@medplum/core`** + **`@medplum/fhirtypes`** (3.3)
- **`@tabler/icons-react`**, **`react-router-dom`**

## Desarrollo

```bash
npm install
cp .env.example .env   # ajustar MEDPLUM_BASE_URL si hace falta
npm run dev            # http://localhost:3001
```

Scripts:

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (Vite) |
| `npm run build` | Typecheck + build de producción a `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run preview` | Sirve el build de `dist/` |

### Variables de entorno

`MEDPLUM_BASE_URL` — URL base de la API de Medplum. Si no se define, usa
`https://api.medplum.com.ar/`. (Vite expone variables con prefijo `MEDPLUM_`.)

## Estructura

```
src/
  main.tsx                  Providers (Mantine + Medplum + Router) y MedplumClient
  App.tsx                   Gate de auth (login vs. shell) y rutas
  theme.ts                  Theme Mantine (teal)
  fhir/
    systems.ts              Fuente única de URLs/systems de FHIR (sección 4 del brief)
    refs.ts                 Helper idDeRef (id de una Reference)
    campanas.ts             Contrato de campañas: lanzarCampana (bot) + crearGrupoAdHoc
    reportes.ts             TC del período (useTipoCambio) + filasDeMedida (grupos→filas)
  hooks/useMeasureReport.ts Hook + helpers groupValue / groups / groupLabel
  lib/
    format.ts               fmt (números es-AR)
    excel.ts                Motor de exportación .xlsx (dynamic import de xlsx)
  components/
    AdminLayout.tsx         Shell con navegación + tema + menú de cuenta
    KpiTile.tsx             Tile de KPI (Resumen, Servicios, Retención, Dashboard)
    FilaBarra.tsx           Fila etiqueta + barra + valor (Servicios, Financiero)
    BotonTema.tsx           Toggle de modo claro/oscuro
    LanzarCampanaModal.tsx  Compositor de campaña con confirmación
  pages/                    Dashboard · Resumen · Pipeline · Retención · Segmentos · Campañas · Servicios · Financiero · Reportes + login
infra/
  access-policy-administracion.json  AccessPolicy del rol Administración
```

## Convención de namespaces

Hay dos namespaces FHIR en el sistema (ver `src/fhir/systems.ts`):

- `https://biowellness.ar/fhir/...` → operativo (`recepcionistas`) + `kpis-servicios`
- `https://bio.medplum.com.ar/fhir/...` → CRM + catálogo clínico

Está planificada una unificación a `biowellness.ar`; todas las cadenas están
centralizadas en `src/fhir/systems.ts` para que la migración sea un solo cambio.

## Privacidad

El rol Administración ve lo operativo + CRM + métricas + resumen clínico-comercial
(`DetectedIssue`, `MeasureReport`, `Flag`), pero **no** el detalle clínico sensible
(valores de `Observation`/`Condition`, historia clínica). Mostrar señales agregadas,
no valores de laboratorio (Ley 26.529 / 25.326).

## AccessPolicy del rol Administración

`infra/access-policy-administracion.json` define la `AccessPolicy` del rol. Es una
**allowlist**: solo los `resourceType` listados son accesibles; todo lo demás queda
denegado. Por eso **no** incluye `Observation`, `Condition` ni `DiagnosticReport`
(detalle clínico sensible, reservado al equipo médico).

- **Lectura** (`readonly`): `MeasureReport`, `Patient`, `Practitioner`, `Provenance`,
  `Communication`, `Flag`, `DetectedIssue`, `Coverage`, `Appointment`, `Schedule`,
  `Slot`, `ActivityDefinition`, `Invoice`, `ChargeItem`, `Bot`, etc.
- **Lectura + escritura**: `Task` (avanzar etapa del pipeline) y `Group` (crear
  Group ad-hoc para campañas de recuperación). Las campañas (`Communication`) las
  escribe el bot `enviar-campana`, no la app.

Aplicarla (una vez por proyecto):

1. En `app.medplum.com.ar` → **Admin → Access Policies → New**, pegar el JSON
   (o `POST /fhir/R4/AccessPolicy` con el archivo).
2. Asignarla a cada usuario del rol en su **ProjectMembership** (campo *Access Policy*).

> Si la AccessPolicy no concede `MeasureReport`, los dashboards se ven vacíos
> (la búsqueda vuelve sin resultados, sin error). Ver «¿No ves datos?».

## Deploy

La app es una SPA estática. Build:

```bash
npm install
MEDPLUM_BASE_URL=https://api.medplum.com.ar/ npm run build   # genera dist/
```

Servir `dist/` en cualquier hosting estático bajo `admin.medplum.com.ar`, con **dos
requisitos**:

1. **Fallback SPA**: todas las rutas deben servir `index.html` (usamos
   `BrowserRouter`). Ejemplos:
   - nginx: `location / { try_files $uri /index.html; }`
   - Netlify: `/*  /index.html  200`
   - Caddy: `try_files {path} /index.html`
2. **Variable de entorno en build**: `MEDPLUM_BASE_URL` se inyecta en tiempo de
   build (Vite, prefijo `MEDPLUM_`). Definirla en el pipeline de CI/hosting.

## Integraciones a confirmar

Centralizadas para cambiarlas en un solo lugar:

- **Bot `enviar-campana`**: se invoca por id (`executeBot(BOT_ENVIAR_CAMPANA_ID, ...)`
  en `src/fhir/campanas.ts`), configurable con la env var `MEDPLUM_BOT_ENVIAR_CAMPANA`
  (default = id real conocido). ✅ confirmado.
- **Canales** (`src/fhir/campanas.ts` → `Canal`): valores `email` / `whatsapp`
  (minúscula). Pendiente de confirmar contra el código del bot (¿espera otro formato?).

## Reportes y Dashboard (6.8)

- **Dashboard** (`/dashboard`): vista ejecutiva en tiempo real (ingresos del día, margen,
  membresías activas, ocupación de salas, conversión, embudo de CRM).
- **Reportes** (`/reportes`): exportación `.xlsx` de un clic por familia (CRM, Ingresos,
  Financiero/LTV, Servicios/Utilización), multi-hoja, con montos en **ARS y USD** al TC
  del período. `xlsx` se carga por dynamic import (no infla el bundle inicial).

Fuentes (todo vía `MeasureReport`, leído como el resto de la app):

- **Ingresos / margen** (`kpis-finanzas`): slugs **asumidos** `ingresos`, `ingresos-servicio`,
  `ingresos-medico`, `margen` (namespace bio). El split 85/15 y deducciones de IV+TB viven
  en el bot. Ver `MEASURE_SLUGS_FINANZAS` en `systems.ts`.
- **Tipo de cambio**: Measure **asumido** `tipo-cambio` (grupo `usd` = ARS por 1 USD).
- Clínicos: solo señales **agregadas** (sin exponer valores de Observation) para respetar
  la AccessPolicy. Gestión (proyección v12 vs. real): se leerá de un Measure dedicado.

> Fases siguientes: Membresías/Cobros detallados, Clínicos agregados y Gestión (proyección).

## Datos de demo (seed)

`infra/seed-demo-bundle.json` es un **Bundle de transacción** que siembra un escenario
coherente para las 7 pantallas (MeasureReports de Resumen/Servicios/Financiero, Tasks
de Pipeline, Flags de Retención, un Group de Segmentos, Communications de Campañas, y el
turno operativo Red Light en la tumbona R-07). Incluye los `MeasureReport` ya calculados,
así los dashboards se ven sin esperar a `kpis-*`. La ventana de período es 2026-06-24→26.

Aplicar:

```bash
curl -X POST https://api.medplum.com.ar/fhir/R4 \
  -H "Authorization: Bearer $MEDPLUM_TOKEN" \
  -H "Content-Type: application/fhir+json" \
  --data-binary @infra/seed-demo-bundle.json
```

Todos los recursos quedan etiquetados con `meta.tag` `https://bio.medplum.com.ar/fhir/CodeSystem/demo|seed-48h`.

**Borrar la demo** (dos opciones):

```bash
# 1) Script (robusto): busca por tag y borra por id, en orden de dependencias. Requiere jq.
MEDPLUM_TOKEN=xxxxx bash infra/cleanup-demo.sh

# 2) Bundle one-shot (conditional-delete por tag, una sola transacción):
curl -X POST https://api.medplum.com.ar/fhir/R4 \
  -H "Authorization: Bearer $MEDPLUM_TOKEN" \
  -H "Content-Type: application/fhir+json" \
  --data-binary @infra/cleanup-demo-bundle.json
```

> No es un TTL real (FHIR no expira recursos solo): el tag es para limpiar a mano/script.
> Si tu Medplum no borra múltiples por conditional-delete, usá el script (opción 1).

## ¿No ves datos? (diagnóstico)

Los dashboards (Resumen, Servicios) leen `MeasureReport`. Si aparecen en cero / «Sin
datos del período», es **dato/acceso**, no un bug de la app. Verificá en orden:

1. **¿Existen los MeasureReport?** En `app.medplum.com.ar`, buscar p. ej.
   `MeasureReport?measure=https://biowellness.ar/fhir/Measure/agenda-ocupacion`.
   Si no hay resultados, falta que corra el bot `kpis-servicios` (o no hubo
   actividad en el período).
2. **¿La AccessPolicy concede `MeasureReport`?** Si tu usuario no tiene la policy de
   arriba, las búsquedas vuelven vacías. Aplicala y reasignala.
3. **¿Namespace/slug correctos?** Servicios usa `https://biowellness.ar/fhir/Measure/...`
   (`servicios-turnos`, `agenda-ocupacion`, `membresias-utilizacion`) y CRM usa
   `https://bio.medplum.com.ar/fhir/Measure/...`. Si el bot escribe en otro
   namespace, ajustar `src/fhir/systems.ts`.
