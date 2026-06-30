/**
 * Template vivo anual (Anexo D · Fase 4) — rellena la planilla **modelo anual** con los
 * cierres mensuales y la descarga. Escribe solo las celdas de input de la hoja "Resumen
 * Anual" (los totales de cada mes en su columna); el Dashboard Anual, sus fórmulas y los
 * 2 gráficos quedan intactos y Excel recalcula al abrir (`fullCalcOnLoad`).
 */
import { applyCells, type CellVal } from './templateVivo';
import { mesColumna, type CierreMes } from '../fhir/cierres';
import type { Participacion } from '../fhir/parametros';

const SHEET_RESUMEN = 'xl/worksheets/sheet2.xml';

/** Fila de la hoja "Resumen Anual" por línea comercial. */
const LINEA_ROW: Record<string, number> = {
  membresias: 4,
  'sueltas-combos': 5,
  paquetes: 6,
  'iv-tb': 7,
  otros: 8,
};
/** Fila por método de pago. */
const METODO_ROW: Record<string, number> = {
  efectivo: 31,
  'tarjeta-debito': 32,
  'tarjeta-credito': 33,
  transferencia: 34,
  mercadopago: 35,
};

/** Construye los reemplazos de celda de la hoja Resumen Anual desde los cierres. */
export function construirUpdatesAnual(cierres: CierreMes[], participaciones: Participacion[]): Map<string, CellVal> {
  const updates = new Map<string, CellVal>();
  for (const c of cierres) {
    const m = Number(c.periodo.slice(5, 7));
    if (m < 1 || m > 12) {
      continue;
    }
    const col = mesColumna(m);
    for (const l of c.lineas) {
      const row = LINEA_ROW[l.codigo];
      if (row) {
        updates.set(`${col}${row}`, l.monto);
      }
    }
    updates.set(`${col}10`, c.gastosOperativos);
    updates.set(`${col}11`, c.cajaChicaEgresos);
    updates.set(`${col}13`, c.barNeto);
    for (const f of c.formasPago) {
      const row = METODO_ROW[f.codigo];
      if (row) {
        updates.set(`${col}${row}`, f.monto);
      }
    }
  }
  // Participaciones (Q19:Q25) como fracción.
  participaciones.slice(0, 7).forEach((p, i) => updates.set(`Q${19 + i}`, (Number(p.pct) || 0) / 100));
  return updates;
}

/** Rellena el modelo anual con los cierres y devuelve el `.xlsx` resultante. */
export async function rellenarTableroAnual(
  modelo: ArrayBuffer,
  cierres: CierreMes[],
  participaciones: Participacion[]
): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(modelo);

  const entry = zip.file(SHEET_RESUMEN);
  if (entry) {
    zip.file(SHEET_RESUMEN, applyCells(await entry.async('string'), construirUpdatesAnual(cierres, participaciones)));
  }

  const wbFile = zip.file('xl/workbook.xml');
  if (wbFile) {
    const wb = await wbFile.async('string');
    zip.file(
      'xl/workbook.xml',
      wb.includes('fullCalcOnLoad') ? wb : wb.replace('<calcPr ', '<calcPr fullCalcOnLoad="1" ')
    );
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
