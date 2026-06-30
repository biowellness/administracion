/**
 * Suite de criterios de aceptación CA-1..11 (Anexo D · Fase 5 · Punto 9).
 * Ejercita la lógica pura del tablero (invariantes, consolidación, narrador, template) contra
 * datos sintéticos que reproducen el modelo validado. Las piezas que viven en los bots (conteo
 * de sesiones, cobros→Caja) se cubren acá por sus invariantes; el round-trip del .xlsx se valida
 * además con el harness de node (jszip+xlsx).
 */
import { describe, expect, it, vi } from 'vitest';
import type { MeasureReport } from '@medplum/fhirtypes';

// Las utilidades puras importan el hook useMedplum (que arrastra @medplum/react). Stub para node.
vi.mock('@medplum/react', () => ({ useMedplum: () => ({}), useMedplumProfile: () => undefined }));

import { validarMensual, validarAnual } from '../invariantes';
import { construirCierre, consolidarAnio, mesColumna } from '../../fhir/cierres';
import { narrador, filasPyL, distribucionSocios } from '../../fhir/estadoResultados';
import { capacidadMes, parametrosDefault, slotsDia, sumaParticipaciones } from '../../fhir/parametros';
import { applyCells, construirUpdates, type DatosTablero } from '../templateVivo';
import { groupValue, popValue } from '../../hooks/useMeasureReport';

// ---- helpers ----
const g = (code: string, value: number, population?: { code: string; count: number }[]): unknown => ({
  code: { coding: [{ code }] },
  measureScore: { value },
  ...(population ? { population: population.map((p) => ({ code: { coding: [{ code: p.code }] }, count: p.count })) } : {}),
});
const mr = (groups: unknown[]): MeasureReport => ({ resourceType: 'MeasureReport', status: 'complete', type: 'summary', group: groups } as MeasureReport);

// Estado de resultados del modelo (Jun): cuadra.
const estadoOk = mr([
  g('ingresos-wellness', 5836500),
  g('gastos-operativos', 12398750),
  g('caja-chica-egresos', 75000),
  g('ebitda', -6637250),
  g('bar-neto', 450000),
  g('resultado-total', -6187250),
  g('margen-operativo', -1.137),
  g('margen-objetivo', 0.2),
]);
const lineaOk = mr([
  g('membresias', 2628000),
  g('sueltas-combos', 606000),
  g('paquetes', 2227500),
  g('iv-tb', 375000),
  g('otros', 0),
  g('global', 5836500),
]);
const cobroOk = mr([g('tarjeta-credito', 2665500), g('mercadopago', 2628000), g('efectivo', 543000), g('global', 5836500)]);
const params100 = parametrosDefault('2026-06');

describe('CA-1 · reconciliación cobro → líneas = ingresos', () => {
  it('pasa cuando Σ líneas = ingresos wellness', () => {
    const v = validarMensual({ estado: estadoOk, linea: lineaOk, cobro: cobroOk, params: params100, tcUsd: 1500 });
    expect(v.ok).toBe(true);
    expect(v.problemas.filter((p) => p.severidad === 'error')).toHaveLength(0);
  });
  it('falla cuando las líneas no suman los ingresos', () => {
    const lineaMal = mr([g('membresias', 1000000), g('global', 1000000)]);
    const v = validarMensual({ estado: estadoOk, linea: lineaMal, cobro: cobroOk, params: params100, tcUsd: 1500 });
    expect(v.ok).toBe(false);
    expect(v.problemas.some((p) => p.ca === 'CA-1')).toBe(true);
  });
});

describe('CA-3 · USD requiere TC', () => {
  it('avisa (no bloquea) si no hay TC', () => {
    const v = validarMensual({ estado: estadoOk, linea: lineaOk, cobro: cobroOk, params: params100, tcUsd: 0 });
    expect(v.problemas.some((p) => p.ca === 'CA-3' && p.severidad === 'aviso')).toBe(true);
    expect(v.ok).toBe(true);
  });
});

describe('CA-4 · saldo acumulado del día N = N-1 + día N', () => {
  it('la serie diaria acumula correctamente', () => {
    const d3 = g('d03', 3396000, [{ code: 'saldo', count: 3396000 }, { code: 'saldo-acum', count: 3396000 }]);
    const d4 = g('d04', 5761500, [{ code: 'saldo', count: 2365500 }, { code: 'saldo-acum', count: 5761500 }]);
    const rd = mr([d3, d4]);
    const acum3 = popValue(rd.group![0], 'saldo-acum');
    const acum4 = popValue(rd.group![1], 'saldo-acum');
    const saldo4 = popValue(rd.group![1], 'saldo');
    expect(acum4).toBe(acum3 + saldo4);
  });
});

describe('CA-5 · el P&L cuadra', () => {
  it('detecta EBITDA inconsistente', () => {
    const malo = mr([
      g('ingresos-wellness', 5836500),
      g('gastos-operativos', 12398750),
      g('caja-chica-egresos', 75000),
      g('ebitda', 999999), // mal
      g('bar-neto', 450000),
      g('resultado-total', -6187250),
    ]);
    const v = validarMensual({ estado: malo, linea: lineaOk, cobro: cobroOk, params: params100, tcUsd: 1500 });
    expect(v.ok).toBe(false);
    expect(v.problemas.some((p) => p.ca === 'CA-5')).toBe(true);
  });
  it('detecta resultado ≠ EBITDA + Bar', () => {
    const malo = mr([
      g('ingresos-wellness', 5836500),
      g('gastos-operativos', 12398750),
      g('caja-chica-egresos', 75000),
      g('ebitda', -6637250),
      g('bar-neto', 450000),
      g('resultado-total', 0), // mal
    ]);
    const v = validarMensual({ estado: malo, linea: lineaOk, cobro: cobroOk, params: params100, tcUsd: 1500 });
    expect(v.problemas.some((p) => p.ca === 'CA-5')).toBe(true);
  });
});

describe('CA-6 · distribución y Σ participaciones = 100%', () => {
  it('bloquea si las participaciones no suman 100', () => {
    const malParams = { ...params100, participaciones: [{ nombre: 'A', pct: 53 }, { nombre: 'B', pct: 24 }] };
    expect(Math.round(sumaParticipaciones(malParams))).not.toBe(100);
    const v = validarMensual({ estado: estadoOk, linea: lineaOk, cobro: cobroOk, params: malParams, tcUsd: 1500 });
    expect(v.problemas.some((p) => p.ca === 'CA-6')).toBe(true);
  });
  it('la distribución suma el resultado total', () => {
    const filas = distribucionSocios(-6187250, params100.participaciones, 1500);
    const sum = filas.reduce((s, f) => s + f.parteArs, 0);
    expect(Math.abs(sum - -6187250)).toBeLessThanOrEqual(4);
  });
  it('el anual valida Σ distribución = resultado del año', () => {
    const cierre = construirCierre('2026-06', { estado: estadoOk, linea: lineaOk, cobro: cobroOk }, '2026-06-28');
    const con = consolidarAnio('2026', [cierre], params100.participaciones);
    const v = validarAnual(con, params100.participaciones);
    expect(v.ok).toBe(true);
  });
});

describe('CA-7 · el template nunca escribe una celda de fórmula', () => {
  const datos: DatosTablero = {
    periodo: '2026-06', tcUsd: 1500, dias: 25, horas: 12, saldoCajaChica: 0,
    duraciones: [60, 60, 60, 30, 30, 60, 60, 30, 30, 30, 60, 60, 60], cargasPct: 27, sueldosBrutos: 0, conrado: 0,
    gastosManual: { alquiler: 7500000 }, gastosVarios: 0, barNeto: 450000, ingresosMesAnterior: 0, cajaChicaEgresos: 75000,
    lineas: [{ codigo: 'membresias', monto: 2628000 }, { codigo: 'iv-tb', monto: 375000 }],
    metodos: [{ codigo: 'efectivo', monto: 543000 }, { codigo: 'mercadopago', monto: 2628000 }],
    sociosPlan: [5, 0, 3, 0, 0, 0, 2, 0, 0, 0], preciosPlan: [718, 1008, 1752, 2453, 1920, 2688, 2184, 3058, 2784, 3898],
    combosVendidos: [8, 0, 0, 5, 3], preciosCombo: [112, 88, 120, 292, 364],
    sesionesRecurso: [{ nombre: 'HBOT Monoplaza', sesiones: 2 }],
  };
  it('el Dashboard solo recibe los 2 inputs manuales (Bar, mes anterior), no fórmulas', () => {
    const u = construirUpdates(datos);
    expect([...u.dashboard.keys()].sort()).toEqual(['C19', 'C54']);
  });
  it('Parámetros solo escribe la columna C (inputs), nunca D/E (slots/capacidad = fórmulas)', () => {
    const u = construirUpdates(datos);
    for (const k of u.parametros.keys()) {
      expect(k.startsWith('C')).toBe(true);
    }
  });
  it('applyCells reemplaza la celda de dato y deja intacta la de fórmula', () => {
    const xml = '<sheetData><row r="4"><c r="A4" s="1"><v>5</v></c><c r="B4" s="2"><f>SUM(A4:A4)</f><v>5</v></c></row></sheetData>';
    const out = applyCells(xml, new Map([['A4', 10]]));
    expect(out).toContain('<c r="A4" s="1"><v>10</v></c>');
    expect(out).toContain('<f>SUM(A4:A4)</f>');
  });
});

describe('CA-8 · cerrar mes completa el anual', () => {
  it('el cierre aparece en el consolidado del año', () => {
    const cierre = construirCierre('2026-06', { estado: estadoOk, linea: lineaOk, cobro: cobroOk, mrr: mr([g('global', 13214), g('socios', 10)]) }, '2026-06-28');
    const con = consolidarAnio('2026', [cierre], params100.participaciones);
    expect(con.mesesCerrados).toBe(1);
    expect(con.ingresosAnio).toBe(5836500);
    expect(con.meses[5].cierre?.periodo).toBe('2026-06'); // Jun = índice 5
    expect(con.mejorMes?.mes).toBe(6);
  });
  it('mesColumna mapea Jun → H', () => {
    expect(mesColumna(6)).toBe('H');
    expect(mesColumna(1)).toBe('C');
    expect(mesColumna(12)).toBe('N');
  });
});

describe('CA-9 · saldo efectivo = inicial + cobros efectivo − egresos', () => {
  it('la serie de efectivo acumula sobre el saldo inicial', () => {
    // inicial 0; d3 efectivo +375000 −45000 = 330000; d4 +168000 −30000 = 468000
    const rd = mr([
      g('d03', 0, [{ code: 'saldo-efectivo', count: 330000 }]),
      g('d04', 0, [{ code: 'saldo-efectivo', count: 468000 }]),
    ]);
    expect(popValue(rd.group![1], 'saldo-efectivo')).toBe(330000 + (168000 - 30000));
  });
});

describe('CA-10 · las formas de pago suman el total', () => {
  it('pasa cuando los métodos suman su global', () => {
    const v = validarMensual({ estado: estadoOk, linea: lineaOk, cobro: cobroOk, params: params100, tcUsd: 1500 });
    expect(v.problemas.some((p) => p.ca === 'CA-10' && p.severidad === 'error')).toBe(false);
  });
  it('falla cuando los métodos no suman su global', () => {
    const cobroMal = mr([g('efectivo', 100), g('mercadopago', 100), g('global', 5836500)]);
    const v = validarMensual({ estado: estadoOk, linea: lineaOk, cobro: cobroMal, params: params100, tcUsd: 1500 });
    expect(v.problemas.some((p) => p.ca === 'CA-10' && p.severidad === 'error')).toBe(true);
  });
});

describe('CA-11 · el narrador refleja los hechos', () => {
  it('mes negativo + margen bajo + MRR', () => {
    const lineas = narrador(
      { estado: estadoOk, ingresos: mr([g('mes', 5836500), g('mes-anterior', 0)]), mrr: mr([g('global', 13214), g('socios', 10)]), cobro: cobroOk },
      20
    );
    const textos = lineas.map((l) => l.texto).join('\n');
    expect(textos).toContain('NEGATIVO');
    expect(textos).toContain('MRR de membresías: 13.214 USD/mes con 10 socios');
    expect(textos).toContain('Margen por debajo del 20%');
    expect(textos).toContain('Forma de pago principal: tarjeta-credito (45,67%');
    expect(lineas[0].tono).toBe('negativo');
  });
  it('mes positivo se anuncia POSITIVO', () => {
    const positivo = mr([g('ingresos-wellness', 100), g('gastos-operativos', 0), g('caja-chica-egresos', 0), g('ebitda', 100), g('bar-neto', 0), g('resultado-total', 100), g('margen-operativo', 1)]);
    const lineas = narrador({ estado: positivo }, 20);
    expect(lineas[0].texto).toContain('POSITIVO');
    expect(lineas[0].tono).toBe('positivo');
  });
});

describe('CA-2 (parcial) · capacidad por recurso (la utilización la cuenta el bot)', () => {
  it('slots/día = (horas×60)÷duración; capacidad mes = slots × días', () => {
    const r60 = { codigo: 'x', nombre: 'X', duracionMin: 60, comparteTumbona: false };
    const r30 = { codigo: 'y', nombre: 'Y', duracionMin: 30, comparteTumbona: false };
    expect(slotsDia(r60, params100)).toBe(12);
    expect(slotsDia(r30, params100)).toBe(24);
    expect(capacidadMes(r60, params100)).toBe(300);
    expect(capacidadMes(r30, params100)).toBe(600);
  });
});

describe('filasPyL · orden y signos del estado de resultados', () => {
  it('gastos y caja chica van en negativo; el resultado destaca', () => {
    const filas = filasPyL(estadoOk, lineaOk, 1500);
    const gastos = filas.find((f) => f.concepto.includes('Gastos operativos'));
    const caja = filas.find((f) => f.concepto.includes('caja chica'));
    const resultado = filas.find((f) => f.estilo === 'resultado');
    expect(gastos?.ars).toBeLessThan(0);
    expect(caja?.ars).toBeLessThan(0);
    expect(resultado?.ars).toBe(-6187250);
    expect(groupValue(estadoOk, 'ingresos-wellness')).toBe(5836500);
  });
});
