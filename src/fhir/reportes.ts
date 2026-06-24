import type { MeasureReport } from '@medplum/fhirtypes';
import { groupCode, groupLabel, groups, groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { measureFinanzas } from './systems';

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
