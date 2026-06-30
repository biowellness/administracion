/**
 * Estado de resultados (Anexo D · Fase 1) — capa de lectura sobre los Measures que produce
 * `kpis-finanzas`. Arma las filas del P&L (ARS + USD), la distribución por socio y el
 * **narrador automático** (§Punto 6), todo replicando el modelo validado `tablero-mensual`.
 *
 * No calcula nada de negocio nuevo: el bot ya resolvió la cascada y los totales. Acá solo
 * se ordena y se redacta. Una sola fuente: si el measure no está, la fila/línea se omite.
 */
import type { MeasureReport } from '@medplum/fhirtypes';
import { groupCode, groupLabel, groups, groupValue } from '../hooks/useMeasureReport';
import { fmt, fmt2 } from '../lib/format';
import type { Participacion } from './parametros';

export type EstiloFila = 'linea' | 'subtotal' | 'resta' | 'resultado';

export interface FilaPyL {
  concepto: string;
  ars: number;
  /** Equivalente en USD (si tcUsd > 0). */
  usd?: number;
  estilo: EstiloFila;
}

const usdDe = (ars: number, tcUsd: number): number | undefined => (tcUsd > 0 ? ars / tcUsd : undefined);

/**
 * Filas del estado de resultados, en el orden del modelo:
 *   líneas de ingreso → INGRESOS WELLNESS → (−)Gastos → (−)Caja chica → EBITDA →
 *   (+)Bar → RESULTADO TOTAL.
 * Las líneas de ingreso vienen de `ingresos-linea`; el resto de `estado-resultados`.
 */
export function filasPyL(
  estado: MeasureReport | undefined,
  ingresosLinea: MeasureReport | undefined,
  tcUsd: number
): FilaPyL[] {
  const fila = (concepto: string, ars: number, estilo: EstiloFila): FilaPyL => ({
    concepto,
    ars,
    usd: usdDe(ars, tcUsd),
    estilo,
  });

  const lineas = groups(ingresosLinea)
    .filter((g) => groupCode(g) !== 'global')
    .map((g) => fila(groupLabel(g), g.measureScore?.value ?? 0, 'linea'));

  const ingresos = groupValue(estado, 'ingresos-wellness');
  const gastos = groupValue(estado, 'gastos-operativos');
  const cajaChica = groupValue(estado, 'caja-chica-egresos');
  const ebitda = groupValue(estado, 'ebitda');
  const bar = groupValue(estado, 'bar-neto');
  const resultado = groupValue(estado, 'resultado-total');

  return [
    ...lineas,
    fila('INGRESOS WELLNESS (cobrado)', ingresos, 'subtotal'),
    fila('(–) Gastos operativos del mes', -Math.abs(gastos), 'resta'),
    fila('(–) Egresos de caja chica', -Math.abs(cajaChica), 'resta'),
    fila('RESULTADO WELLNESS (EBITDA)', ebitda, 'subtotal'),
    fila('(+) Bar — resultado neto (manual)', bar, 'linea'),
    fila('RESULTADO TOTAL DEL NEGOCIO', resultado, 'resultado'),
  ];
}

export interface FilaSocio {
  nombre: string;
  pct: number;
  parteArs: number;
  parteUsd?: number;
}

/** Distribución del resultado total por socio (participación × resultado), como el modelo. */
export function distribucionSocios(
  resultadoTotal: number,
  participaciones: Participacion[],
  tcUsd: number
): FilaSocio[] {
  return participaciones.map((p) => {
    const parteArs = Math.round((resultadoTotal * (Number(p.pct) || 0)) / 100);
    return { nombre: p.nombre, pct: p.pct, parteArs, parteUsd: usdDe(parteArs, tcUsd) };
  });
}

export interface DatosNarrador {
  estado?: MeasureReport;
  ingresos?: MeasureReport;
  mrr?: MeasureReport;
  cobro?: MeasureReport;
  /** Utilización por recurso (Fase 3); si no está, se omite la línea de recurso. */
  utilizacion?: MeasureReport;
}

/** Una línea del análisis automático, con un tono para colorearla en la UI. */
export interface LineaNarrador {
  texto: string;
  tono: 'positivo' | 'negativo' | 'alerta' | 'neutro';
}

/**
 * Análisis automático del mes (§Punto 6) — replica las frases del modelo (C57:C61 + r73).
 * Devuelve solo las líneas con datos disponibles.
 */
export function narrador(d: DatosNarrador, margenObjetivoPct: number): LineaNarrador[] {
  const out: LineaNarrador[] = [];

  // 1 · Resultado del mes (siempre).
  if (d.estado) {
    const resultado = groupValue(d.estado, 'resultado-total');
    if (resultado >= 0) {
      out.push({ texto: `✔ El mes cerró POSITIVO: ${fmt(resultado)} ARS.`, tono: 'positivo' });
    } else {
      out.push({
        texto: `✖ El mes cerró NEGATIVO: ${fmt(resultado)} ARS. Revisar gastos e ingresos.`,
        tono: 'negativo',
      });
    }
  }

  // 2 · Tendencia vs mes anterior.
  if (d.ingresos) {
    const mes = groupValue(d.ingresos, 'mes');
    const anterior = groupValue(d.ingresos, 'mes-anterior');
    if (anterior > 0) {
      const varPct = ((mes - anterior) / anterior) * 100;
      const flecha = varPct >= 0 ? '↑' : '↓';
      out.push({
        texto: `${flecha} Ingresos ${varPct >= 0 ? '+' : ''}${fmt(varPct)}% vs mes anterior.`,
        tono: varPct >= 0 ? 'positivo' : 'negativo',
      });
    } else {
      out.push({ texto: '• Cargá el mes anterior para ver la tendencia.', tono: 'neutro' });
    }
  }

  // 3 · MRR + socios activos.
  if (d.mrr) {
    const mrrUsd = groupValue(d.mrr, 'global');
    const socios = groupValue(d.mrr, 'socios');
    out.push({
      texto: `• MRR de membresías: ${fmt(mrrUsd)} USD/mes con ${fmt(socios)} socios activos.`,
      tono: 'neutro',
    });
  }

  // 4 · Recurso más/menos usado (solo si hay utilización — Fase 3).
  if (d.utilizacion) {
    const recursos = groups(d.utilizacion).filter((g) => groupCode(g) !== 'global');
    if (recursos.length) {
      const orden = [...recursos].sort((a, b) => (b.measureScore?.value ?? 0) - (a.measureScore?.value ?? 0));
      const max = orden[0];
      const min = orden[orden.length - 1];
      const pct = (g: typeof max): string => fmt2((g.measureScore?.value ?? 0) * 100);
      out.push({
        texto: `• Recurso MÁS usado: ${groupLabel(max)} (${pct(max)}%). Menos usado: ${groupLabel(min)} (${pct(min)}%).`,
        tono: 'neutro',
      });
    }
  }

  // 5 · Alerta de margen vs objetivo.
  if (d.estado) {
    const margen = groupValue(d.estado, 'margen-operativo') * 100;
    if (margen < margenObjetivoPct) {
      out.push({
        texto: `⚠ Margen por debajo del ${fmt(margenObjetivoPct)}% objetivo: revisar pricing o costos.`,
        tono: 'alerta',
      });
    } else {
      out.push({
        texto: `✔ Margen saludable: ${fmt2(margen)}% (objetivo ${fmt(margenObjetivoPct)}%).`,
        tono: 'positivo',
      });
    }
  }

  // 6 · Forma de pago principal.
  if (d.cobro) {
    const total = groupValue(d.cobro, 'global');
    const metodos = groups(d.cobro).filter((g) => groupCode(g) !== 'global');
    if (total > 0 && metodos.length) {
      const top = metodos.reduce((a, b) => ((b.measureScore?.value ?? 0) > (a.measureScore?.value ?? 0) ? b : a));
      const pct = fmt2(((top.measureScore?.value ?? 0) / total) * 100);
      out.push({ texto: `• Forma de pago principal: ${groupLabel(top)} (${pct}% de la facturación).`, tono: 'neutro' });
    }
  }

  return out;
}
