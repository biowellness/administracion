# Bots — kpis-finanzas y tipo-cambio

Bots de Medplum (TypeScript) que **producen** los `MeasureReport` que lee la app de
administración (sección 6.8). Normalmente viven en el repo `recepcionistas/src/bots/`;
acá quedan versionados como referencia/fuente.

| Bot | Qué publica | Cuándo correrlo |
|---|---|---|
| `tipo-cambio.ts` | `Measure/tipo-cambio` (grupo `usd` = ARS por USD) | Diario (o manual con `{ "valor": 1490.5 }`) |
| `kpis-finanzas.ts` | `ingresos`, `ingresos-servicio`, `ingresos-medico`, `ingresos-iv-tb`, `ingresos-cobro`, `cobros`, `margen` | Nocturno (o manual con `{ "periodo": "2026-06" }`) |

Ambos son **idempotentes** (upsert por `identifier` `<slug>-<YYYY-MM>`): re-ejecutarlos
actualiza el reporte del período en lugar de duplicarlo.

## Supuestos a confirmar (`kpis-finanzas.ts`, bloque CONFIG)

El cálculo asume un modelo operativo concreto; ajustá los helpers de extracción si difiere:

- Importe del `ChargeItem` en `priceOverride.value`; servicio en `code.coding[0].code`
  (`HBOT`, `RED_LIGHT`, `IV_THERAPY`, …); médico en `performer[0].actor`.
- IV+TB = servicios `IV_THERAPY` / `TERAPIA_BIOLOGICA`; split 85/15 y deducciones 10%.
- Cobros desde `Invoice.status`: `balanced`=cobrado, `issued`=pendiente, `cancelled`=fallido;
  importe en `totalNet`/`totalGross`; medio de pago en la extensión `…/medio-pago`.
- Margen estimado = `margenPct` (default 30%) sobre los ingresos del mes.

`tipo-cambio.ts` toma el dólar oficial de `dolarapi.com` si no se le pasa `valor`.

## Deploy (medplum CLI)

```bash
# 1) Crear el Bot (una vez) y obtener su id
npx medplum bot create kpis-finanzas

# 2) Compilar + deployar el código
npx medplum bot deploy kpis-finanzas   # usa bots/kpis-finanzas.ts según medplum.config

# (idem para tipo-cambio)
```

Programación: crear una `Subscription` con criterio de cron, o usar la ejecución
programada de Bots de Medplum. Ej.: `tipo-cambio` diario 08:00, `kpis-finanzas` nocturno.

Verificación de tipos local: `npm run typecheck:bots`.
