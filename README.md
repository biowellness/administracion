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
  hooks/useMeasureReport.ts Hook + helpers groupValue / groups / groupLabel
  lib/format.ts             fmt (números es-AR)
  components/
    AdminLayout.tsx         Shell con navegación de las 6 secciones + menú de cuenta
    KpiTile.tsx             Tile de KPI (Resumen, Servicios, Retención)
    FilaBarra.tsx           Fila etiqueta + barra + valor (Servicios)
    LanzarCampanaModal.tsx  Compositor de campaña con confirmación
  pages/                    Resumen · Pipeline · Retención · Segmentos · Campañas · Servicios · Financiero + login
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

- **Bot `enviar-campana`** (`src/fhir/systems.ts` → `SID_BOT`, `BOTS`): se invoca por
  Identifier `{ system: SID_BOT, value: 'enviar-campana' }`. Confirmar el `system`
  real del identifier de Bots.
- **Canales** (`src/fhir/campanas.ts` → `Canal`): valores `email` / `whatsapp`
  (minúscula). Ajustar si el bot espera otro formato.

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
