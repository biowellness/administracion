import { BotEvent, MedplumClient } from '@medplum/core';
import { ChargeItem, Invoice, MeasureReport } from '@medplum/fhirtypes';

/**
 * Bot `kpis-finanzas` — calcula y publica los MeasureReport financieros del mes que la
 * app de administración lee (sección 6.8): `ingresos`, `ingresos-servicio`,
 * `ingresos-medico`, `ingresos-iv-tb`, `ingresos-cobro`, `cobros`, `margen`.
 *
 * Fuentes: `ChargeItem` (ingresos por servicio/médico/IV-TB) e `Invoice` (cobros y
 * medio de pago). Idempotente por identifier `<slug>-<YYYY-MM>`.
 *
 * ⚠️ SUPUESTOS del modelo operativo (ajustar a recepcionistas en la sección CONFIG):
 *  - importe del ChargeItem en `priceOverride.value`;
 *  - servicio en `code.coding[0].code` (HBOT, RED_LIGHT, IV_THERAPY, ...);
 *  - médico en `performer[0].actor`;
 *  - importe de Invoice en `totalNet`/`totalGross`; estado cobrado/pendiente/fallido en
 *    `Invoice.status` (balanced/issued/cancelled);
 *  - medio de pago en una extensión de Invoice.
 */

const SID = 'https://bio.medplum.com.ar/fhir/sid/measurereport';
const MEASURE_BASE = 'https://bio.medplum.com.ar/fhir/Measure';

// ===== CONFIG / supuestos (ajustar al modelo real) =====
const EXT_MEDIO_PAGO = 'https://biowellness.ar/fhir/StructureDefinition/medio-pago';
const SERVICIOS_IV_TB = ['IV_THERAPY', 'TERAPIA_BIOLOGICA'];
const SPLIT_PROFESIONAL = 0.85; // 85/15
const DEDUCCION_PCT_DEFAULT = 0.1; // deducciones sobre el bruto de IV+TB
const MARGEN_PCT_DEFAULT = 0.3; // margen estimado sobre ingresos del mes

interface FinanzasInput {
  /** Período a calcular, formato YYYY-MM. Default: mes actual. */
  periodo?: string;
  margenPct?: number;
  deduccionPct?: number;
}

interface Periodo {
  ym: string;
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
}

function calcularPeriodo(ym?: string): Periodo {
  const ref = ym ? new Date(`${ym}-01T00:00:00Z`) : new Date();
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  const iso = (d: Date): string => d.toISOString().slice(0, 10);
  return {
    ym: `${y}-${String(m + 1).padStart(2, '0')}`,
    start: iso(new Date(Date.UTC(y, m, 1))),
    end: iso(new Date(Date.UTC(y, m + 1, 0))),
    prevStart: iso(new Date(Date.UTC(y, m - 1, 1))),
    prevEnd: iso(new Date(Date.UTC(y, m, 0))),
  };
}

// --- extracción de campos (puntos de ajuste al modelo operativo) ---
const montoChargeItem = (ci: ChargeItem): number => ci.priceOverride?.value ?? 0;
const servicioDe = (ci: ChargeItem): string => ci.code?.coding?.[0]?.code ?? 'otros';
const medicoDe = (ci: ChargeItem): string =>
  ci.performer?.[0]?.actor?.display ?? ci.performer?.[0]?.actor?.reference ?? 'sin-asignar';
const fechaDe = (ci: ChargeItem): string => (ci.occurrenceDateTime ?? ci.enteredDate ?? '').slice(0, 10);
const montoInvoice = (inv: Invoice): number => inv.totalNet?.value ?? inv.totalGross?.value ?? 0;
const medioPagoDe = (inv: Invoice): string =>
  inv.extension?.find((e) => e.url === EXT_MEDIO_PAGO)?.valueString ?? 'otro';

function buildMR(slug: string, p: Periodo, grupos: { code: string; display?: string; value: number }[]): MeasureReport {
  return {
    resourceType: 'MeasureReport',
    status: 'complete',
    type: 'summary',
    measure: `${MEASURE_BASE}/${slug}`,
    date: new Date().toISOString().slice(0, 10),
    period: { start: p.start, end: p.end },
    identifier: [{ system: SID, value: `${slug}-${p.ym}` }],
    group: grupos.map((g) => ({
      code: { coding: [{ code: g.code, display: g.display }] },
      measureScore: { value: g.value },
    })),
  };
}

async function upsert(medplum: MedplumClient, mr: MeasureReport): Promise<void> {
  const idv = mr.identifier?.[0]?.value;
  const existing = await medplum.searchOne('MeasureReport', `identifier=${SID}|${idv}`);
  if (existing) {
    await medplum.updateResource({ ...mr, id: existing.id });
  } else {
    await medplum.createResource(mr);
  }
}

export async function handler(medplum: MedplumClient, event: BotEvent<FinanzasInput>): Promise<{ periodo: string; measures: string[] }> {
  const input = event.input ?? {};
  const p = calcularPeriodo(input.periodo);
  const deduccionPct = input.deduccionPct ?? DEDUCCION_PCT_DEFAULT;
  const margenPct = input.margenPct ?? MARGEN_PCT_DEFAULT;
  const hoy = new Date().toISOString().slice(0, 10);

  // NOTA: _count=1000 cubre el volumen mensual de un centro; para más, paginar por link.
  const charges = await medplum.searchResources(
    'ChargeItem',
    `occurrence=ge${p.start}&occurrence=le${p.end}&_count=1000`
  );

  let totalMes = 0;
  let totalDia = 0;
  let ivTbBruto = 0;
  const porServicio = new Map<string, number>();
  const porMedico = new Map<string, number>();

  for (const ci of charges) {
    const monto = montoChargeItem(ci);
    if (!monto) {
      continue;
    }
    totalMes += monto;
    if (fechaDe(ci) === hoy) {
      totalDia += monto;
    }
    const svc = servicioDe(ci);
    porServicio.set(svc, (porServicio.get(svc) ?? 0) + monto);
    const med = medicoDe(ci);
    porMedico.set(med, (porMedico.get(med) ?? 0) + monto);
    if (SERVICIOS_IV_TB.includes(svc)) {
      ivTbBruto += monto;
    }
  }

  const chargesPrev = await medplum.searchResources(
    'ChargeItem',
    `occurrence=ge${p.prevStart}&occurrence=le${p.prevEnd}&_count=1000`
  );
  const totalMesAnterior = chargesPrev.reduce((s, ci) => s + montoChargeItem(ci), 0);

  // IV + TB: 85/15 con deducciones
  const deducciones = Math.round(ivTbBruto * deduccionPct);
  const base = ivTbBruto - deducciones;
  const profesional = Math.round(base * SPLIT_PROFESIONAL);
  const centro = base - profesional;

  // Cobros y medio de pago (Invoice)
  const invoices = await medplum.searchResources('Invoice', `date=ge${p.start}&date=le${p.end}&_count=1000`);
  let cobrado = 0;
  let pendiente = 0;
  let fallido = 0;
  const porCobro = new Map<string, number>();
  for (const inv of invoices) {
    const monto = montoInvoice(inv);
    if (inv.status === 'balanced') {
      cobrado += monto;
      const mp = medioPagoDe(inv);
      porCobro.set(mp, (porCobro.get(mp) ?? 0) + monto);
    } else if (inv.status === 'issued') {
      pendiente += monto;
    } else if (inv.status === 'cancelled') {
      fallido += monto;
    }
  }

  const margenEstimado = Math.round(totalMes * margenPct);

  const ordenarDesc = (mapa: Map<string, number>): { code: string; display: string; value: number }[] =>
    [...mapa.entries()].sort((a, b) => b[1] - a[1]).map(([code, value]) => ({ code, display: code, value }));

  const reportes: MeasureReport[] = [
    buildMR('ingresos', p, [
      { code: 'dia', display: 'Hoy', value: totalDia },
      { code: 'mes', display: 'Mes corriente', value: totalMes },
      { code: 'mes-anterior', display: 'Mes anterior', value: totalMesAnterior },
    ]),
    buildMR('ingresos-servicio', p, [...ordenarDesc(porServicio), { code: 'global', value: totalMes }]),
    buildMR('ingresos-medico', p, ordenarDesc(porMedico)),
    buildMR('ingresos-iv-tb', p, [
      { code: 'bruto', display: 'Bruto', value: ivTbBruto },
      { code: 'deducciones', display: 'Deducciones', value: deducciones },
      { code: 'profesional', display: 'Profesional (85%)', value: profesional },
      { code: 'centro', display: 'Centro (15%)', value: centro },
    ]),
    buildMR('ingresos-cobro', p, [...ordenarDesc(porCobro), { code: 'global', value: cobrado }]),
    buildMR('cobros', p, [
      { code: 'cobrado', display: 'Cobrado', value: cobrado },
      { code: 'pendiente', display: 'Pendiente', value: pendiente },
      { code: 'fallido', display: 'Fallido', value: fallido },
    ]),
    buildMR('margen', p, [{ code: 'estimado', display: 'Margen estimado', value: margenEstimado }]),
  ];

  for (const mr of reportes) {
    await upsert(medplum, mr);
  }

  return { periodo: p.ym, measures: reportes.map((m) => m.identifier?.[0]?.value ?? '') };
}
