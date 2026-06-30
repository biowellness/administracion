import { BotEvent, MedplumClient } from '@medplum/core';
import { ChargeItem, Invoice, MeasureReport } from '@medplum/fhirtypes';

/**
 * Bot `kpis-finanzas` — calcula y publica los MeasureReport financieros del mes que la
 * app de administración lee (sección 6.8): `ingresos`, `ingresos-linea`,
 * `ingresos-servicio`, `ingresos-medico`, `ingresos-iv-tb`, `ingresos-cobro`, `cobros`,
 * `margen`, el estado de resultados (Anexo D · Fase 1): `gastos-operativos`,
 * `caja-chica`, `estado-resultados`, y membresías (Fase 2): `membresias-socios-plan`,
 * `membresias-mrr`, `combos-vendidos`. `ingresos-linea` es el corte por línea comercial
 * que desbloquea el P&L; la cascada, los gastos manuales, los socios por plan y los combos
 * salen de la config FHIR (`config-tablero`) y los inputs del mes (`inputs-mes`).
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

// Línea comercial (Anexo D · Fase 0) — espejo de `src/fhir/systems.ts` (LINEAS_COMERCIALES).
// El corte por línea desbloquea el estado de resultados (≠ servicio físico).
const EXT_LINEA_COMERCIAL = 'https://bio.medplum.com.ar/fhir/StructureDefinition/linea-comercial';
const LINEA_LABEL: Record<string, string> = {
  membresias: 'Membresías',
  'sueltas-combos': 'Sueltas y combos',
  paquetes: 'Paquetes',
  'iv-tb': 'IV + Terapias Biológicas',
  consultas: 'Consultas',
  otros: 'Otros',
};
/** Líneas derivables del código de servicio cuando no hay marca explícita. */
const LINEA_POR_SERVICIO: Record<string, string> = {
  IV_THERAPY: 'iv-tb',
  TERAPIA_BIOLOGICA: 'iv-tb',
  CONSULTA: 'consultas',
};

// Config + inputs del mes (Anexo D · Fase 1) — espejo de `src/fhir/{systems,parametros,inputs}.ts`.
const SID_CONFIG = 'https://bio.medplum.com.ar/fhir/sid/config-tablero';
const SD_CONFIG_JSON = 'https://bio.medplum.com.ar/fhir/StructureDefinition/config-tablero-json';
const SID_INPUTS = 'https://bio.medplum.com.ar/fhir/sid/inputs-mes';
const SD_INPUTS_JSON = 'https://bio.medplum.com.ar/fhir/StructureDefinition/inputs-mes-json';

interface ConfigTablero {
  regenerarPct: number;
  honorariosIvtbPct: number;
  cargasSocialesPct: number;
  honorarioConrado: number;
  margenObjetivoPct: number;
  saldoInicialCajaChica: number;
}
const CONFIG_DEFAULT: ConfigTablero = {
  regenerarPct: 30,
  honorariosIvtbPct: 15,
  cargasSocialesPct: 27,
  honorarioConrado: 0,
  margenObjetivoPct: 20,
  saldoInicialCajaChica: 0,
};

interface InputsMes {
  sueldosBrutos: number;
  gastos: Record<string, number>;
  barNeto: number;
  cajaChicaSaldoInicial: number;
  cajaChicaEgresos: number;
  sociosPlan: Record<string, number>;
  combosVendidos: Record<string, number>;
}
const INPUTS_DEFAULT: InputsMes = {
  sueldosBrutos: 0,
  gastos: {},
  barNeto: 0,
  cajaChicaSaldoInicial: 0,
  cajaChicaEgresos: 0,
  sociosPlan: {},
  combosVendidos: {},
};

/** Catálogo de planes y combos (espejo de `src/fhir/systems.ts`). Precio en USD. */
const PLANES_MEMBRESIA: { codigo: string; nombre: string; precioUsd: number }[] = [
  { codigo: 'focus-std', nombre: 'FOCUS Standard', precioUsd: 718 },
  { codigo: 'focus-int', nombre: 'FOCUS Intensivo', precioUsd: 1008 },
  { codigo: 'prime-std-ind', nombre: 'PRIME Std Individual', precioUsd: 1752 },
  { codigo: 'prime-int-ind', nombre: 'PRIME Int Individual', precioUsd: 2453 },
  { codigo: 'prime-std-par', nombre: 'PRIME Std Pareja', precioUsd: 1920 },
  { codigo: 'prime-int-par', nombre: 'PRIME Int Pareja', precioUsd: 2688 },
  { codigo: 'healthspan-std-ind', nombre: 'HEALTHSPAN Std Individual', precioUsd: 2184 },
  { codigo: 'healthspan-int-ind', nombre: 'HEALTHSPAN Int Individual', precioUsd: 3058 },
  { codigo: 'healthspan-std-par', nombre: 'HEALTHSPAN Std Pareja', precioUsd: 2784 },
  { codigo: 'healthspan-int-par', nombre: 'HEALTHSPAN Int Pareja', precioUsd: 3898 },
];
const COMBOS: { codigo: string; nombre: string; precioUsd: number }[] = [
  { codigo: 'bio-energy', nombre: 'BIO ENERGY', precioUsd: 112 },
  { codigo: 'bio-compress', nombre: 'BIO COMPRESS', precioUsd: 88 },
  { codigo: 'bio-cryo', nombre: 'BIO CRYO', precioUsd: 120 },
  { codigo: 'bio-recovery-ind', nombre: 'BIO RECOVERY Ind', precioUsd: 292 },
  { codigo: 'bio-longevity-ind', nombre: 'BIO LONGEVITY Ind', precioUsd: 364 },
];

/** Las 17 líneas de gastos (espejo de GASTO_LINEAS): key, label, tipo. */
const GASTO_LINEAS: { key: string; label: string; tipo: 'sueldos' | 'config' | 'auto' | 'manual' }[] = [
  { key: 'sueldos', label: 'Sueldos + cargas sociales', tipo: 'sueldos' },
  { key: 'honorario-conrado', label: 'Honorario Dr. Conrado', tipo: 'config' },
  { key: 'honorarios-medicos', label: 'Honorarios médicos (IV+TB)', tipo: 'auto' },
  { key: 'insumos-regenerar', label: 'Insumos Regenerar (IV+TB)', tipo: 'auto' },
  { key: 'alquiler', label: 'Alquiler local', tipo: 'manual' },
  { key: 'estacionamiento', label: 'Estacionamiento', tipo: 'manual' },
  { key: 'electricidad-gas', label: 'Electricidad / Gas', tipo: 'manual' },
  { key: 'internet-software', label: 'Internet / Software', tipo: 'manual' },
  { key: 'seguros', label: 'Seguros', tipo: 'manual' },
  { key: 'mantenimiento', label: 'Mantenimiento', tipo: 'manual' },
  { key: 'marketing', label: 'Marketing', tipo: 'manual' },
  { key: 'insumos-medicos', label: 'Insumos médicos (stock)', tipo: 'manual' },
  { key: 'contaduria-legal', label: 'Contaduría / Legal', tipo: 'manual' },
  { key: 'comisiones-mp', label: 'Comisiones MercadoPago / POS', tipo: 'manual' },
  { key: 'iibb', label: 'IIBB', tipo: 'manual' },
  { key: 'lavanderia', label: 'Lavandería', tipo: 'manual' },
  { key: 'gastos-varios', label: 'Gastos varios', tipo: 'manual' },
];

async function leerJsonBasic<T>(medplum: MedplumClient, sid: string, sdJson: string, periodo: string, def: T): Promise<T> {
  const basic = await medplum.searchOne('Basic', `identifier=${sid}|${periodo}`);
  const raw = basic?.extension?.find((e) => e.url === sdJson)?.valueString;
  if (!raw) {
    return def;
  }
  try {
    return { ...def, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return def;
  }
}

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
/** Línea comercial del cobro: marca explícita (extensión) o derivada del servicio; default `otros`. */
const lineaDe = (ci: ChargeItem): string => {
  const ext = ci.extension?.find((e) => e.url === EXT_LINEA_COMERCIAL)?.valueCode;
  if (ext && LINEA_LABEL[ext]) {
    return ext;
  }
  return LINEA_POR_SERVICIO[servicioDe(ci)] ?? 'otros';
};
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
  const porLinea = new Map<string, number>();

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
    const linea = lineaDe(ci);
    porLinea.set(linea, (porLinea.get(linea) ?? 0) + monto);
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

  // ===== Estado de resultados (Anexo D · Fase 1) =====
  // Config (%s) + inputs manuales (gastos, Bar, caja chica) por período.
  const cfg = await leerJsonBasic<ConfigTablero>(medplum, SID_CONFIG, SD_CONFIG_JSON, p.ym, CONFIG_DEFAULT);
  const inputs = await leerJsonBasic<InputsMes>(medplum, SID_INPUTS, SD_INPUTS_JSON, p.ym, INPUTS_DEFAULT);

  // Base IV+TB = lo cobrado de la línea iv-tb (matchea el modelo validado: 15%/30% s/ cobrado bruto).
  const ivTbLinea = porLinea.get('iv-tb') ?? ivTbBruto;
  const honorariosMedicos = Math.round((cfg.honorariosIvtbPct / 100) * ivTbLinea);
  const insumosRegenerar = Math.round((cfg.regenerarPct / 100) * ivTbLinea);
  const sueldos = Math.round((inputs.sueldosBrutos || 0) * (1 + cfg.cargasSocialesPct / 100));

  // Las 17 líneas de gastos, en el orden del modelo.
  const valorGasto = (g: { key: string; tipo: string }): number => {
    switch (g.tipo) {
      case 'sueldos':
        return sueldos;
      case 'config':
        return g.key === 'honorario-conrado' ? cfg.honorarioConrado || 0 : 0;
      case 'auto':
        return g.key === 'honorarios-medicos' ? honorariosMedicos : insumosRegenerar;
      default:
        return inputs.gastos?.[g.key] ?? 0;
    }
  };
  const gruposGastos = GASTO_LINEAS.map((g) => ({ code: g.key, display: g.label, value: valorGasto(g) }));
  const gastosTotal = gruposGastos.reduce((s, g) => s + g.value, 0);

  // Caja chica e ingresos wellness (criterio caja). ingresos-wellness reconcilia con Σ líneas.
  const cajaChicaSaldoInicial = inputs.cajaChicaSaldoInicial || cfg.saldoInicialCajaChica || 0;
  const cajaChicaEgresos = inputs.cajaChicaEgresos || 0;
  const ingresosWellness = totalMes;
  const ebitda = ingresosWellness - gastosTotal - cajaChicaEgresos;
  const barNeto = inputs.barNeto || 0;
  const resultadoTotal = ebitda + barNeto;
  const margenOperativo = ingresosWellness > 0 ? ebitda / ingresosWellness : 0;

  // ===== Membresías y combos (Anexo D · Fase 2) =====
  const sociosPlan = inputs.sociosPlan ?? {};
  const combosVendidos = inputs.combosVendidos ?? {};
  const gruposSociosPlan = PLANES_MEMBRESIA.map((pl) => ({ code: pl.codigo, display: pl.nombre, value: sociosPlan[pl.codigo] ?? 0 }));
  const totalSocios = gruposSociosPlan.reduce((s, g) => s + g.value, 0);
  const gruposMrr = PLANES_MEMBRESIA.map((pl) => ({ code: pl.codigo, display: pl.nombre, value: (sociosPlan[pl.codigo] ?? 0) * pl.precioUsd }));
  const mrrTotal = gruposMrr.reduce((s, g) => s + g.value, 0);
  const gruposCombos = COMBOS.map((cb) => ({ code: cb.codigo, display: cb.nombre, value: combosVendidos[cb.codigo] ?? 0 }));
  const totalCombos = gruposCombos.reduce((s, g) => s + g.value, 0);
  const ingresoCombosUsd = COMBOS.reduce((s, cb) => s + (combosVendidos[cb.codigo] ?? 0) * cb.precioUsd, 0);

  const ordenarDesc = (mapa: Map<string, number>): { code: string; display: string; value: number }[] =>
    [...mapa.entries()].sort((a, b) => b[1] - a[1]).map(([code, value]) => ({ code, display: code, value }));
  const lineasOrdenadas = (mapa: Map<string, number>): { code: string; display: string; value: number }[] =>
    [...mapa.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, value]) => ({ code, display: LINEA_LABEL[code] ?? code, value }));

  const reportes: MeasureReport[] = [
    buildMR('ingresos', p, [
      { code: 'dia', display: 'Hoy', value: totalDia },
      { code: 'mes', display: 'Mes corriente', value: totalMes },
      { code: 'mes-anterior', display: 'Mes anterior', value: totalMesAnterior },
    ]),
    buildMR('ingresos-linea', p, [...lineasOrdenadas(porLinea), { code: 'global', display: 'Total', value: totalMes }]),
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
    buildMR('gastos-operativos', p, [...gruposGastos, { code: 'total', display: 'TOTAL GASTOS OPERATIVOS', value: gastosTotal }]),
    buildMR('caja-chica', p, [
      { code: 'saldo-inicial', display: 'Saldo inicial', value: cajaChicaSaldoInicial },
      { code: 'egresos', display: 'Egresos del mes', value: cajaChicaEgresos },
      { code: 'saldo-final', display: 'Saldo final', value: cajaChicaSaldoInicial - cajaChicaEgresos },
    ]),
    buildMR('estado-resultados', p, [
      { code: 'ingresos-wellness', display: 'Ingresos wellness (cobrado)', value: ingresosWellness },
      { code: 'gastos-operativos', display: 'Gastos operativos', value: gastosTotal },
      { code: 'caja-chica-egresos', display: 'Egresos de caja chica', value: cajaChicaEgresos },
      { code: 'ebitda', display: 'Resultado wellness (EBITDA)', value: ebitda },
      { code: 'bar-neto', display: 'Bar — resultado neto', value: barNeto },
      { code: 'resultado-total', display: 'Resultado total del negocio', value: resultadoTotal },
      { code: 'margen-operativo', display: 'Margen operativo', value: margenOperativo },
      { code: 'margen-objetivo', display: 'Margen objetivo', value: cfg.margenObjetivoPct / 100 },
    ]),
    buildMR('membresias-socios-plan', p, [...gruposSociosPlan, { code: 'total', display: 'Total socios', value: totalSocios }]),
    buildMR('membresias-mrr', p, [
      ...gruposMrr,
      { code: 'global', display: 'MRR total (USD)', value: mrrTotal },
      { code: 'socios', display: 'Socios activos', value: totalSocios },
    ]),
    buildMR('combos-vendidos', p, [
      ...gruposCombos,
      { code: 'total', display: 'Total combos', value: totalCombos },
      { code: 'ingreso-usd', display: 'Ingreso combos (USD)', value: ingresoCombosUsd },
    ]),
  ];

  for (const mr of reportes) {
    await upsert(medplum, mr);
  }

  return { periodo: p.ym, measures: reportes.map((m) => m.identifier?.[0]?.value ?? '') };
}
