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
  pages/                    Dashboard · Resumen · Pipeline · Retención · Segmentos · Campañas · Servicios · Membresías · Ingresos · Financiero · Clínicos · Gestión · Reportes + login
infra/
  access-policy-administracion.json  AccessPolicy del rol Administración
  seed-demo-bundle.json              Datos de demo (todas las pantallas)
  measure-tipo-cambio.json           MeasureReport del TC (USD)
bots/
  tipo-cambio.ts                     Bot: publica Measure/tipo-cambio
  kpis-finanzas.ts                   Bot: ingresos/cobros/margen del mes
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

- **Ingresos / margen** (`kpis-finanzas`): slugs **asumidos** `ingresos` (grupos `dia`/`mes`/
  `mes-anterior`), `ingresos-linea` (corte por línea comercial — Membresías / Sueltas y combos /
  Paquetes / IV+TB / Consultas / Otros, Anexo D · Fase 0), `ingresos-cobro` (por tipo de cobro),
  `ingresos-servicio`, `ingresos-medico` (liquidación de splits), `ingresos-iv-tb` (grupos
  `bruto`/`deducciones`/`profesional`/`centro`, el 85/15 lo calcula el bot) y `margen`
  (grupo `estimado`) — namespace bio. Ver `MEASURE_SLUGS_FINANZAS` en `systems.ts`. La pantalla
  **Ingresos** muestra el comparativo mes vs. mes anterior y el corte por línea comercial. La
  línea se marca en el `ChargeItem` (extensión `linea-comercial`) o se deriva del servicio.
- **Tipo de cambio**: Measure **asumido** `tipo-cambio` (grupo `usd` = ARS por 1 USD).
- **Membresías** (pantalla `/membresias`): el detalle por miembro (tier, sesiones, próximo
  cobro) se lee de `Coverage` activos (tier en `class[].name`/`type.text`, sesiones en las
  extensiones `sesiones-mes`/`sesiones-usadas`, próximo cobro en `period.end`); los agregados
  vienen de Measures **asumidos** `cobros` (grupos `cobrado`/`pendiente`/`fallido`) y
  `founding-members` (grupos `cupos-usados`/`cupos-totales`/`descuento-promedio`/`ltv-promedio`),
  más `churn` y `membresias-utilizacion`.
- **Membresías y MRR** (pantalla `/membresias`, Anexo D · Fase 2): además del detalle por socio
  (Coverage), un panel de **socios por plan + MRR** y **combos vendidos**. Catálogo canónico de
  **10 planes + 5 combos** con su tarifario USD en `systems.ts` (`PLANES_MEMBRESIA`/`COMBOS`) — evita
  el match por nombre frágil; el tarifario lo define Andrés al final (editable). Measures de
  `kpis-finanzas`: `membresias-socios-plan` (socios por plan + total), `membresias-mrr` (MRR por plan
  × precio + `global` + `socios`), `combos-vendidos` (unidades + `ingreso-usd`). Los socios por plan y
  los combos del mes se cargan como **inputs manuales** (`inputs-mes`, mismo cajón que los gastos) y
  alimentan el bot y el template vivo (hoja Membresías & Combos).
- **Día a día** (pantalla `/dia`, Anexo D · Fase 3): el **cierre de caja diario** (saldo del día,
  acumulado del mes y arqueo de efectivo) y la **utilización por recurso** del mes, con el **cuello de
  botella de las tumbonas Red Light** marcado (**regla R-07** = pool de capacidad en minutos:
  `2 × horas × 60 × días`). Lee `resumen-diario` (kpis-finanzas; grupos por día con `population`
  ingresos/egresos/saldo/saldo-acum/saldo-efectivo) y `utilizacion-recurso` (bot **`kpis-servicios`**,
  namespace bw; por recurso `measureScore` = sesiones÷capacidad + `population` sesiones/capacidad, más
  los grupos `pool-red-light` y `global`). La capacidad sale de `config-tablero`; las sesiones se
  cuentan de `Appointment` (`status=fulfilled`). El template vivo vuelca las sesiones a la hoja
  Sesiones (una fila por sesión → el Dashboard recalcula utilización por COUNTIF).
- **Clínicos** (pantalla `/clinicos`, solo agregados): Measures **asumidos** `clinico-sin-visita`
  (grupos `30`/`60`/`90`), `clinico-baja-utilizacion` (grupo `miembros`), `clinico-consentimientos`
  (grupos `30`/`60`/`90`). Sin valores de Observation (Ley 26.529/25.326).
- **Gestión** (pantalla `/gestion`): Measure **asumido** `proyeccion-v12` con grupos
  `<metrica>-proyectado` y `<metrica>-real` (`ingresos`, `ocupacion`, `margen`); la app muestra
  proyectado vs. real y % de cumplimiento.
- **Parámetros** (pantalla `/parametros`, Anexo D · Fase 0): superficie única de configuración del
  tablero **por período** (TC de referencia, días/horas operativas, %s de la cascada de honorarios
  y deducciones, gastos, umbrales, capacidad de los 13 recursos con R-07, y participaciones de los
  7 socios). Vive en un `Basic` (`identifier = config-tablero|YYYY-MM`, JSON en extensión);
  guardrail Σ participaciones = 100%. La app, los bots y el template Excel leen de acá.
- **Estado de Resultados** (pantalla `/estado-resultados`, Anexo D · Fase 1): el informe mensual para
  socios de un clic, en **ARS + USD** — ingresos por línea → (−)gastos (17 líneas) → (−)caja chica →
  **EBITDA** → (+)Bar → **resultado total**, con la **distribución por socio** y el **análisis
  automático** (§Punto 6). Replica el modelo validado `tablero-mensual`. Lee Measures de
  `kpis-finanzas`: `estado-resultados` (grupos `ingresos-wellness`/`gastos-operativos`/
  `caja-chica-egresos`/`ebitda`/`bar-neto`/`resultado-total`/`margen-operativo`/`margen-objetivo`),
  `gastos-operativos` (17 líneas + total), `caja-chica` (saldo-inicial/egresos/saldo-final),
  `membresias-mrr` (MRR USD + socios). Cascada IV+TB: honorarios médicos (15%) e insumos Regenerar
  (30%) sobre el IV+TB cobrado (como el modelo); los % salen de `config-tablero`. Los **inputs
  manuales** del mes (gastos, Bar, caja chica — lo que el sistema no puede saber) se cargan en el
  cajón lateral y viven en un `Basic` (`identifier = inputs-mes|YYYY-MM`); el bot los lee para el P&L.
  `consultas-split` queda **desconectada del P&L** (decisión pendiente con Andrés, como el modelo).
  - **Template vivo** (botón "Generar planilla"): rellena la **planilla modelo** (`src/assets/
    tablero-mensual-modelo.xlsx`) con los datos en vivo y la descarga. El motor (`lib/templateVivo.ts`,
    `jszip` por dynamic import) escribe **solo las celdas de input** de las hojas de datos (Parámetros,
    Caja Diaria, Gastos del Mes, Empleados, + Bar y mes anterior del Dashboard) y deja **intactas** las
    fórmulas y los **3 gráficos** (cirugía de ZIP, reemplazo puro de celdas ya materializadas); fuerza
    `fullCalcOnLoad` para que Excel recalcule el Dashboard y las tortas/barras se re-dibujen solas.
    Regla **nunca se escribe una celda de fórmula**. El cobrado por línea se vuelca a Caja Diaria por
    (línea × método) reconciliando ambos márgenes. Verificado: charts byte a byte, totales y formas de
    pago reconcilian, `sharedStrings` intacto.

Los Bots que **producen** los Measures financieros, de servicios y el TC están en `bots/`
(`kpis-finanzas.ts`, `kpis-servicios.ts`, `tipo-cambio.ts`) — ver `bots/README.md` para contrato y
deploy. Typecheck local: `npm run typecheck:bots`.

### Cargar el tipo de cambio

`infra/measure-tipo-cambio.json` crea/actualiza el `MeasureReport` de TC (USD = $1490,50).
Upsert idempotente por identifier:

```bash
curl -X PUT "https://api.medplum.com.ar/fhir/R4/MeasureReport?identifier=https://bio.medplum.com.ar/fhir/sid/measurereport|tipo-cambio-2026-06" \
  -H "Authorization: Bearer $MEDPLUM_TOKEN" \
  -H "Content-Type: application/fhir+json" \
  --data-binary @infra/measure-tipo-cambio.json
```

## Datos de demo (seed)

`infra/seed-demo-bundle.json` es un **Bundle de transacción** que siembra un escenario
coherente para las 7 pantallas (MeasureReports de Resumen/Servicios/Financiero, Tasks
de Pipeline, Flags de Retención, un Group de Segmentos, Communications de Campañas, y el
turno operativo Red Light en la tumbona R-07). Incluye los `MeasureReport` ya calculados,
así los dashboards se ven sin esperar a `kpis-*`. La ventana de período es 2026-06-24→26.

> Los `MeasureReport` se cargan con **conditional update por identifier** (idempotente):
> re-aplicar el seed **actualiza** cada métrica en vez de duplicarla (evita que la app
> muestre un valor viejo por tener dos reportes del mismo período).

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
