import { BotEvent, MedplumClient } from '@medplum/core';
import { MeasureReport } from '@medplum/fhirtypes';

/**
 * Bot `tipo-cambio` — publica el TC ARS/USD del período como MeasureReport
 * `https://bio.medplum.com.ar/fhir/Measure/tipo-cambio` (grupo `usd` = ARS por 1 USD),
 * que la app de administración lee para las columnas USD.
 *
 * Uso:
 *  - Programado (diario) sin input → toma el dólar oficial de dolarapi.com.
 *  - Manual con input `{ "valor": 1490.5 }` → fija el TC a ese valor.
 *
 * Idempotente por identifier `tipo-cambio-<YYYY-MM>` (actualiza el del mes en curso).
 */
const SID = 'https://bio.medplum.com.ar/fhir/sid/measurereport';
const MEASURE = 'https://bio.medplum.com.ar/fhir/Measure/tipo-cambio';

interface TipoCambioInput {
  /** ARS por 1 USD. Si se omite, se obtiene de `fuenteUrl`. */
  valor?: number;
  /** API de TC (default: dólar oficial de dolarapi.com). */
  fuenteUrl?: string;
}

export async function handler(
  medplum: MedplumClient,
  event: BotEvent<TipoCambioInput>
): Promise<MeasureReport> {
  const input = event.input ?? {};
  let valor = input.valor;

  if (valor === undefined) {
    const url = input.fuenteUrl ?? 'https://dolarapi.com/v1/dolares/oficial';
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`La fuente de TC respondió ${resp.status}`);
    }
    const data = (await resp.json()) as { venta?: number; compra?: number; value?: number };
    valor = Number(data.venta ?? data.value ?? data.compra);
  }

  if (!valor || Number.isNaN(valor)) {
    throw new Error('No se pudo obtener un tipo de cambio válido');
  }

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const ym = `${y}-${String(m + 1).padStart(2, '0')}`;

  const mr: MeasureReport = {
    resourceType: 'MeasureReport',
    status: 'complete',
    type: 'summary',
    measure: MEASURE,
    date: now.toISOString().slice(0, 10),
    period: {
      start: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10),
      end: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10),
    },
    identifier: [{ system: SID, value: `tipo-cambio-${ym}` }],
    group: [{ code: { coding: [{ code: 'usd', display: 'ARS por USD' }] }, measureScore: { value: valor } }],
  };

  const existing = await medplum.searchOne('MeasureReport', `identifier=${SID}|tipo-cambio-${ym}`);
  return existing ? medplum.updateResource({ ...mr, id: existing.id }) : medplum.createResource(mr);
}
