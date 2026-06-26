import type { MeasureReport } from '@medplum/fhirtypes';
import { groupCode, groupLabel, groups, groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { measureFinanzas } from './systems';
import type { ColumnaReporte, HojaReporte } from '../lib/excel';

/** TC del período: ARS por 1 USD (0 si no hay dato). Lee el Measure `tipo-cambio`. */
export function useTipoCambio(): { tcUsd: number; loading: boolean } {
  const { report, loading } = useMeasureReport(measureFinanzas('tipo-cambio'));
  return { tcUsd: groupValue(report, 'usd'), loading };
}

export interface FilaMedida {
  concepto: string;
  valor: number;
  /** Equivalente en USD (solo si se pasó un tcUsd > 0). */
  usd?: number;
  /** Permite usar las filas directamente como filas de Excel (HojaReporte). */
  [clave: string]: unknown;
}

/**
 * Convierte los grupos de un MeasureReport en filas para tabla/Excel. Si `tcUsd > 0`,
 * agrega el equivalente en USD (asumiendo que `valor` está en ARS).
 */
export function filasDeMedida(
  report: MeasureReport | undefined,
  opts: { tcUsd?: number; incluirGlobal?: boolean } = {}
): FilaMedida[] {
  const tc = opts.tcUsd ?? 0;
  return groups(report)
    .filter((g) => opts.incluirGlobal || groupCode(g) !== 'global')
    .map((g) => {
      const valor = g.measureScore?.value ?? 0;
      return { concepto: groupLabel(g), valor, usd: tc > 0 ? Math.round(valor / tc) : undefined };
    });
}

const COLS_MONTO: ColumnaReporte[] = [
  { key: 'concepto', titulo: 'Concepto', ancho: 28 },
  { key: 'valor', titulo: 'ARS', formato: 'ars' },
  { key: 'usd', titulo: 'USD', formato: 'usd' },
];

export interface IngresosData {
  ingresos?: MeasureReport;
  linea?: MeasureReport;
  cobro?: MeasureReport;
  servicio?: MeasureReport;
  medico?: MeasureReport;
  ivtb?: MeasureReport;
}

/** Construye las hojas del reporte de Ingresos (compartido por Ingresos y Reportes). */
export function hojasIngresos(data: IngresosData, tcUsd: number): HojaReporte[] {
  return [
    { nombre: 'Resumen', columnas: COLS_MONTO, filas: filasDeMedida(data.ingresos, { tcUsd, incluirGlobal: true }) },
    { nombre: 'Por línea comercial', columnas: COLS_MONTO, filas: filasDeMedida(data.linea, { tcUsd, incluirGlobal: true }) },
    { nombre: 'Por tipo de cobro', columnas: COLS_MONTO, filas: filasDeMedida(data.cobro, { tcUsd }) },
    { nombre: 'Por servicio', columnas: COLS_MONTO, filas: filasDeMedida(data.servicio, { tcUsd }) },
    { nombre: 'Por médico', columnas: COLS_MONTO, filas: filasDeMedida(data.medico, { tcUsd }) },
    { nombre: 'IV + TB (85-15)', columnas: COLS_MONTO, filas: filasDeMedida(data.ivtb, { tcUsd, incluirGlobal: true }) },
  ];
}
