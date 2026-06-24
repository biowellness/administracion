export type FormatoColumna = 'ars' | 'usd' | 'pct' | 'num' | 'text';

export interface ColumnaReporte {
  key: string;
  titulo: string;
  ancho?: number;
  formato?: FormatoColumna;
}

export interface HojaReporte {
  nombre: string;
  columnas: ColumnaReporte[];
  filas: Record<string, unknown>[];
}

const FORMATO_NUM: Partial<Record<FormatoColumna, string>> = {
  ars: '"$"#,##0',
  usd: '"US$"#,##0',
  pct: '0"%"',
  num: '#,##0',
};

/**
 * Exporta un workbook `.xlsx` (multi-hoja) y dispara la descarga. Carga la librería
 * `xlsx` con dynamic import para no inflar el bundle inicial (solo al exportar).
 */
export async function exportarExcel(nombreArchivo: string, hojas: HojaReporte[]): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  for (const hoja of hojas) {
    const encabezado = hoja.columnas.map((c) => c.titulo);
    const cuerpo = hoja.filas.map((f) => hoja.columnas.map((c) => f[c.key] ?? ''));
    const ws = XLSX.utils.aoa_to_sheet([encabezado, ...cuerpo]);

    ws['!cols'] = hoja.columnas.map((c) => ({ wch: c.ancho ?? 18 }));

    hoja.columnas.forEach((c, ci) => {
      const z = c.formato ? FORMATO_NUM[c.formato] : undefined;
      if (!z) {
        return;
      }
      for (let ri = 1; ri <= hoja.filas.length; ri++) {
        const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
        if (cell && typeof cell.v === 'number') {
          cell.z = z;
        }
      }
    });

    XLSX.utils.book_append_sheet(wb, ws, hoja.nombre.slice(0, 31));
  }

  XLSX.writeFile(wb, nombreArchivo);
}
