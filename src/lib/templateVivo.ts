/**
 * Motor "template vivo" (Anexo D · Fase 1) — rellena la planilla **modelo** del tablero
 * mensual con los datos en vivo y dispara la descarga. La clave: **solo se escriben las
 * celdas de INPUT de las hojas de datos** (Parámetros, Caja Diaria, Gastos del Mes,
 * Empleados, Gastos Varios, y los 2 inputs manuales del Dashboard: Bar y mes anterior).
 * El Dashboard, sus fórmulas y los 3 gráficos quedan **intactos**; al abrir, Excel recalcula
 * todo (`fullCalcOnLoad`) y las tortas/barras se re-renderizan solas. Nunca se toca una celda
 * de fórmula.
 *
 * Implementación por cirugía de ZIP (las celdas ya están materializadas en el modelo, así que
 * es reemplazo puro, sin insertar XML): preserva estilos (colores azul/amarillo), fórmulas y
 * los charts byte a byte. `jszip` se carga por dynamic import (no infla el bundle inicial).
 */

export interface LineaMonto {
  codigo: string;
  monto: number;
}

export interface DatosTablero {
  periodo: string; // YYYY-MM
  tcUsd: number;
  dias: number;
  horas: number;
  saldoCajaChica: number;
  /** Duraciones de los 13 recursos, en el orden del modelo (B15:B27). */
  duraciones: number[];
  cargasPct: number; // p. ej. 27
  sueldosBrutos: number;
  conrado: number;
  /** Gastos manuales por clave (alquiler, estacionamiento, …; sin gastos-varios). */
  gastosManual: Record<string, number>;
  gastosVarios: number;
  barNeto: number;
  ingresosMesAnterior: number;
  cajaChicaEgresos: number;
  /** Ingresos cobrados por línea comercial. */
  lineas: LineaMonto[];
  /** Cobros por método de pago. */
  metodos: LineaMonto[];
  /** Socios activos por plan (10, en el orden de PLANES_MEMBRESIA). */
  sociosPlan: number[];
  /** Precio USD/mes por plan (10, mismo orden). */
  preciosPlan: number[];
  /** Combos vendidos (5, en el orden de COMBOS). */
  combosVendidos: number[];
  /** Precio USD por combo (5, mismo orden). */
  preciosCombo: number[];
  /** Sesiones por recurso (nombre EXACTO del modelo + cantidad) para la utilización. */
  sesionesRecurso: { nombre: string; sesiones: number }[];
}

type CellVal = number | string | null;

// Códigos del sistema → texto EXACTO que esperan los SUMIFS del modelo.
const LINEA_TXT: Record<string, string> = {
  membresias: 'Membresías',
  'sueltas-combos': 'Sueltas & Combos',
  paquetes: 'Paquetes',
  'iv-tb': 'IV + Terapias Biológicas',
  otros: 'Otros',
};
const METODO_TXT: Record<string, string> = {
  efectivo: 'Efectivo',
  'tarjeta-debito': 'Tarjeta débito',
  'tarjeta-credito': 'Tarjeta crédito',
  transferencia: 'Transferencia',
  mercadopago: 'MercadoPago',
};
// Gastos manuales → celda en 'Gastos del Mes' (las de valor directo; no las fórmulas).
const GASTO_CELL: Record<string, string> = {
  alquiler: 'C8',
  estacionamiento: 'C9',
  'electricidad-gas': 'C10',
  'internet-software': 'C11',
  seguros: 'C12',
  mantenimiento: 'C13',
  marketing: 'C14',
  'insumos-medicos': 'C15',
  'contaduria-legal': 'C16',
  'comisiones-mp': 'C17',
  iibb: 'C18',
  lavanderia: 'C19',
};

const SHEET = {
  dashboard: 'xl/worksheets/sheet1.xml',
  parametros: 'xl/worksheets/sheet2.xml',
  cajaDiaria: 'xl/worksheets/sheet3.xml',
  sesiones: 'xl/worksheets/sheet4.xml',
  membresias: 'xl/worksheets/sheet6.xml',
  gastos: 'xl/worksheets/sheet7.xml',
  empleados: 'xl/worksheets/sheet9.xml',
  gastosVarios: 'xl/worksheets/sheet10.xml',
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Serial de fecha Excel (sistema 1900; date1904=false). */
function serial(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

/**
 * Aplica los reemplazos de celda en una hoja, en una sola pasada. Preserva el estilo (`s`)
 * de cada celda. `null` limpia la celda. Solo toca celdas presentes en `updates`; el resto
 * (incluidas TODAS las fórmulas) queda igual.
 */
export function applyCells(xml: string, updates: Map<string, CellVal>): string {
  return xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (full, addr: string, attrs: string) => {
    if (!updates.has(addr)) {
      return full;
    }
    const v = updates.get(addr) ?? null;
    const sm = / s="(\d+)"/.exec(attrs);
    const s = sm ? ` s="${sm[1]}"` : '';
    if (v === null) {
      return `<c r="${addr}"${s}/>`;
    }
    if (typeof v === 'number') {
      return `<c r="${addr}"${s}><v>${v}</v></c>`;
    }
    return `<c r="${addr}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`;
  });
}

/** Construye los mapas de celdas a escribir por hoja, a partir de los datos en vivo. */
export function construirUpdates(datos: DatosTablero): Record<string, Map<string, CellVal>> {
  const [y, m] = datos.periodo.split('-').map(Number);
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // Parámetros
  const parametros = new Map<string, CellVal>([
    ['C5', `${MESES[m - 1]} ${y}`],
    ['C6', y],
    ['C7', m],
    ['C8', datos.tcUsd],
    ['C9', datos.dias],
    ['C10', datos.horas],
    ['C11', datos.saldoCajaChica],
  ]);
  datos.duraciones.slice(0, 13).forEach((dur, i) => parametros.set(`C${15 + i}`, dur));

  // Gastos del Mes (solo las celdas de valor directo)
  const gastos = new Map<string, CellVal>([['C5', datos.conrado]]);
  for (const [k, cell] of Object.entries(GASTO_CELL)) {
    gastos.set(cell, datos.gastosManual[k] ?? 0);
  }

  // Empleados (cargas + sueldos brutos)
  const empleados = new Map<string, CellVal>([
    ['C4', datos.cargasPct / 100],
    ['C7', datos.sueldosBrutos],
  ]);

  // Gastos Varios (una fila de detalle alimenta el total)
  const gastosVarios = new Map<string, CellVal>();
  if (datos.gastosVarios > 0) {
    gastosVarios.set('B5', serial(y, m, 1));
    gastosVarios.set('C5', 'Gastos varios del mes');
    gastosVarios.set('D5', datos.gastosVarios);
  }

  // Dashboard: SOLO los 2 inputs manuales (Bar y mes anterior). No tocar fórmulas/charts.
  const dashboard = new Map<string, CellVal>([
    ['C19', datos.barNeto],
    ['C54', datos.ingresosMesAnterior],
  ]);

  // Membresías & Combos: socios por plan (C6:C15) + precios (D6:D15); combos (C21:C25) + precios.
  const membresias = new Map<string, CellVal>();
  datos.sociosPlan.slice(0, 10).forEach((s, i) => membresias.set(`C${6 + i}`, s));
  datos.preciosPlan.slice(0, 10).forEach((p, i) => membresias.set(`D${6 + i}`, p));
  datos.combosVendidos.slice(0, 5).forEach((c, i) => membresias.set(`C${21 + i}`, c));
  datos.preciosCombo.slice(0, 5).forEach((p, i) => membresias.set(`D${21 + i}`, p));

  // Caja Diaria: limpiar A:F de todas las filas y volcar el cobrado por (línea × método).
  const cajaDiaria = new Map<string, CellVal>();
  for (let r = 4; r <= 403; r++) {
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) {
      cajaDiaria.set(`${col}${r}`, null);
    }
  }
  const metodoTotal = datos.metodos.reduce((s, x) => s + x.monto, 0) || 1;
  const metodosNZ = datos.metodos.filter((x) => x.monto > 0);
  let row = 4;
  for (const l of datos.lineas) {
    if (l.monto <= 0) {
      continue;
    }
    let asignado = 0;
    metodosNZ.forEach((mm, idx) => {
      const amt = idx === metodosNZ.length - 1 ? l.monto - asignado : Math.round((l.monto * mm.monto) / metodoTotal);
      asignado += amt;
      if (amt <= 0) {
        return;
      }
      const txt = LINEA_TXT[l.codigo] ?? l.codigo;
      cajaDiaria.set(`A${row}`, serial(y, m, ((row - 4) % 28) + 1));
      cajaDiaria.set(`B${row}`, 'Ingreso');
      cajaDiaria.set(`C${row}`, txt);
      cajaDiaria.set(`D${row}`, `${txt} — resumen del mes`);
      cajaDiaria.set(`E${row}`, METODO_TXT[mm.codigo] ?? mm.codigo);
      cajaDiaria.set(`F${row}`, amt);
      row++;
    });
  }
  if (datos.cajaChicaEgresos > 0) {
    cajaDiaria.set(`A${row}`, serial(y, m, 1));
    cajaDiaria.set(`B${row}`, 'Egreso');
    cajaDiaria.set(`C${row}`, 'Insumos menores');
    cajaDiaria.set(`D${row}`, 'Egresos de caja chica');
    cajaDiaria.set(`E${row}`, 'Efectivo');
    cajaDiaria.set(`F${row}`, datos.cajaChicaEgresos);
  }

  // Sesiones: limpiar A:F (filas 4-903) y volcar una fila por sesión (la utilización del
  // Dashboard cuenta filas por recurso con COUNTIF). El nombre del recurso debe ser EXACTO.
  const sesiones = new Map<string, CellVal>();
  for (let r = 4; r <= 903; r++) {
    for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) {
      sesiones.set(`${col}${r}`, null);
    }
  }
  let sRow = 4;
  for (const rec of datos.sesionesRecurso) {
    for (let k = 0; k < rec.sesiones && sRow <= 903; k++) {
      sesiones.set(`A${sRow}`, serial(y, m, ((sRow - 4) % 28) + 1));
      sesiones.set(`B${sRow}`, rec.nombre);
      sesiones.set(`C${sRow}`, '—');
      sesiones.set(`D${sRow}`, 1);
      sesiones.set(`E${sRow}`, 'No');
      sesiones.set(`F${sRow}`, '—');
      sRow++;
    }
  }

  return { dashboard, parametros, membresias, gastos, empleados, gastosVarios, cajaDiaria, sesiones };
}

/**
 * Rellena el modelo (`ArrayBuffer`) con los datos en vivo y devuelve el `.xlsx` resultante.
 * Preserva fórmulas, estilos y gráficos; fuerza el recálculo al abrir.
 */
export async function rellenarTablero(modelo: ArrayBuffer, datos: DatosTablero): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(modelo);
  const updates = construirUpdates(datos);

  const editar = async (file: string, ups: Map<string, CellVal>): Promise<void> => {
    const entry = zip.file(file);
    if (!entry || ups.size === 0) {
      return;
    }
    zip.file(file, applyCells(await entry.async('string'), ups));
  };

  await editar(SHEET.dashboard, updates.dashboard);
  await editar(SHEET.parametros, updates.parametros);
  await editar(SHEET.membresias, updates.membresias);
  await editar(SHEET.gastos, updates.gastos);
  await editar(SHEET.empleados, updates.empleados);
  await editar(SHEET.gastosVarios, updates.gastosVarios);
  await editar(SHEET.cajaDiaria, updates.cajaDiaria);
  await editar(SHEET.sesiones, updates.sesiones);

  // Forzar recálculo al abrir (las fórmulas del Dashboard recomputan; las tortas se re-dibujan).
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

/** Descarga un Blob como archivo (helper de navegador). */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
