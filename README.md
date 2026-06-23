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
  fhir/systems.ts           Fuente única de URLs/systems de FHIR (sección 4 del brief)
  hooks/useMeasureReport.ts Hook + helpers groupValue / groups
  components/
    AdminLayout.tsx         Shell con navegación de las 6 secciones
    SeccionEnConstruccion.tsx
  pages/                    Resumen · Pipeline · Retención · Segmentos · Campañas · Servicios + login
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
