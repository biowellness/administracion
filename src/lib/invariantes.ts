/**
 * Invariantes de exportación (Anexo D · Fase 5 · Punto 9) — chequeos que **impiden generar un
 * informe que no cuadra**. Antes de exportar la planilla (mensual o anual) se corren estas
 * validaciones; si alguna falla con severidad `error`, NO se exporta y se avisa qué no cierra.
 *
 * Cubre los criterios de aceptación CA-5 (el P&L cuadra), CA-6 (distribución = resultado, Σ% =
 * 100), CA-10 (formas de pago suman el total) + reconciliación (Σ líneas = ingresos) y CA-3 (TC).
 */
import type { MeasureReport } from '@medplum/fhirtypes';
import { groupCode, groups, groupValue } from '../hooks/useMeasureReport';
import { sumaParticipaciones, type ParametrosTablero, type Participacion } from '../fhir/parametros';
import type { ConsolidadoAnual } from '../fhir/cierres';

export interface Problema {
  ca: string;
  mensaje: string;
  severidad: 'error' | 'aviso';
}

export interface Validacion {
  ok: boolean;
  problemas: Problema[];
}

/** Tolerancia para comparaciones de montos (redondeos de a pesos). */
function aprox(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(2, Math.abs(b) * 0.001);
}

function sumarGrupos(report: MeasureReport | undefined): number {
  return groups(report)
    .filter((g) => groupCode(g) !== 'global')
    .reduce((s, g) => s + (g.measureScore?.value ?? 0), 0);
}

export interface ArgsMensual {
  estado?: MeasureReport;
  linea?: MeasureReport;
  cobro?: MeasureReport;
  params: ParametrosTablero;
  tcUsd: number;
}

/** Valida el informe mensual antes de exportarlo. */
export function validarMensual({ estado, linea, cobro, params, tcUsd }: ArgsMensual): Validacion {
  const problemas: Problema[] = [];
  const err = (ca: string, mensaje: string): void => void problemas.push({ ca, mensaje, severidad: 'error' });
  const avi = (ca: string, mensaje: string): void => void problemas.push({ ca, mensaje, severidad: 'aviso' });

  if (!estado) {
    err('CA-5', 'No hay estado de resultados calculado para el período.');
    return { ok: false, problemas };
  }

  const ingresos = groupValue(estado, 'ingresos-wellness');
  const gastos = groupValue(estado, 'gastos-operativos');
  const caja = groupValue(estado, 'caja-chica-egresos');
  const ebitda = groupValue(estado, 'ebitda');
  const bar = groupValue(estado, 'bar-neto');
  const resultado = groupValue(estado, 'resultado-total');

  // CA-5 · el P&L cuadra (identidades).
  if (!aprox(ebitda, ingresos - gastos - caja)) {
    err('CA-5', `EBITDA (${ebitda}) ≠ ingresos − gastos − caja chica (${ingresos - gastos - caja}).`);
  }
  if (!aprox(resultado, ebitda + bar)) {
    err('CA-5', `Resultado total (${resultado}) ≠ EBITDA + Bar (${ebitda + bar}).`);
  }

  // Reconciliación · Σ líneas = ingresos wellness.
  const sumLineas = sumarGrupos(linea);
  if (linea && !aprox(sumLineas, ingresos)) {
    err('CA-1', `La suma de líneas (${sumLineas}) ≠ ingresos wellness (${ingresos}).`);
  }

  // CA-10 · formas de pago suman el total cobrado.
  if (cobro) {
    const sumCobro = sumarGrupos(cobro);
    const globalCobro = groupValue(cobro, 'global') || sumCobro;
    if (!aprox(sumCobro, globalCobro)) {
      err('CA-10', `Las formas de pago (${sumCobro}) no suman su total (${globalCobro}).`);
    }
    if (ingresos > 0 && !aprox(sumCobro, ingresos)) {
      avi('CA-10', `Las formas de pago (${sumCobro}) no coinciden con los ingresos (${ingresos}).`);
    }
  }

  // CA-6 · Σ participaciones = 100%.
  const sumPart = sumaParticipaciones(params);
  if (Math.round(sumPart) !== 100) {
    err('CA-6', `Las participaciones suman ${sumPart}% (deben sumar 100%).`);
  }

  // CA-3 · tipo de cambio (aviso: sin TC, las columnas USD quedan vacías).
  if (tcUsd <= 0) {
    avi('CA-3', 'Sin tipo de cambio del período: el informe sale solo en ARS.');
  }

  return { ok: !problemas.some((p) => p.severidad === 'error'), problemas };
}

/** Valida el consolidado anual antes de exportarlo. */
export function validarAnual(con: ConsolidadoAnual, participaciones: Participacion[]): Validacion {
  const problemas: Problema[] = [];
  const err = (ca: string, mensaje: string): void => void problemas.push({ ca, mensaje, severidad: 'error' });

  if (con.mesesCerrados === 0) {
    err('CA-8', 'No hay meses cerrados en el año.');
  }

  const sumPart = participaciones.reduce((s, p) => s + (Number(p.pct) || 0), 0);
  if (Math.round(sumPart) !== 100) {
    err('CA-6', `Las participaciones suman ${sumPart}% (deben sumar 100%).`);
  }

  // CA-6 · Σ distribución = resultado del año.
  const sumDist = con.distribucion.reduce((s, d) => s + d.monto, 0);
  if (!aprox(sumDist, con.resultadoAnio)) {
    err('CA-6', `La distribución (${sumDist}) ≠ resultado del año (${con.resultadoAnio}).`);
  }

  return { ok: !problemas.some((p) => p.severidad === 'error'), problemas };
}
