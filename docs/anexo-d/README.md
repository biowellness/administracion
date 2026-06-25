# Anexo D — Reportería Excel (Tablero de Gestión)

Fuentes (versionadas acá): `anexo-d-requerimientos.docx`, `tablero-mensual-modelo.xlsx`,
`tablero-anual-modelo.xlsx`. **La planilla modelo manda sobre cualquier ambigüedad del texto.**

Documento de trabajo del análisis punto por punto y de las decisiones de la etapa.

## Decisiones de la etapa (Punto 1)

- **Export = Template vivo.** El `.xlsx` modelo es la plantilla: el sistema rellena celdas
  con datos en vivo y preserva el look (colores, torta/barras, estado de resultados).
  Motor con estilos (ExcelJS / relleno de template), no SheetJS.
- **Carga = Híbrido pragmático.** El sistema vuelca lo que sabe; los números que no sabe
  (Bar, gastos, parámetros) se cargan en el Excel por ahora; migran a FHIR al validarse.

Capas pendientes: **narrador automático** (§6) y **modo "informe a socios"** (§5.2).

## Mapa de carga híbrida (Punto 2)

| Dato | Origen | Dónde vive | Nivel |
|---|---|---|---|
| Ingresos cobrados por línea | Auto (Medplum) | `kpis-finanzas` | diario→mensual |
| Sesiones / uso de recursos | Auto (Appointment/Slot) | `kpis-servicios` | diario→mensual |
| Utilización por recurso | Auto-calc (sesiones ÷ capacidad) | sesiones auto · capacidad de Parámetros | diario→mensual |
| Formas de pago | Auto (Medplum) | `kpis-finanzas` (`ingresos-cobro`) | diario/mensual/anual |
| Socios activos, MRR, combos | Auto (Coverage/Group) | Membresías | mensual |
| Honorarios 15% IV+TB · Regenerar 30% · Comisiones MP · IIBB 3% | Auto-calc (% bases) | `kpis-finanzas` (% editables, **VALIDAR base**) | mensual |
| Caja chica del día | Manual | Excel (→ FHIR futuro) | diario |
| Gastos operativos del mes | Manual | Excel (Gastos del Mes) | mensual |
| Sueldos por empleado + cargas 27% | Manual | Excel (Empleados) | mensual |
| Gastos varios | Manual | Excel (Gastos Varios) | mensual |
| Bar — resultado neto | Manual (un número) | Excel (Dashboard) | mensual/anual |
| Parámetros (TC, días/horas, capacidades, %s, participaciones, umbrales) | Manual | Excel (Parámetros) | mensual |
| Consultas split (cantidad y precio) | Manual hoy (→ Medplum) | Excel (Consultas) | mensual |

### Cascada
- Modelo: diario→mensual por fórmulas; mensual→anual por *cierre de mes*.
- Definitivo: bots producen `MeasureReport` por nivel (día/mes/año); encadenan solos.
- Acción **"Cerrar mes"**: congela el mes y completa la columna del anual (§7).

## Hojas del modelo

- **MENSUAL** (11): Dashboard Mensual · Parámetros · Caja Diaria · Sesiones · Resumen Diario ·
  Membresías & Combos · Gastos del Mes · Formas de Pago · Empleados · Gastos Varios · Consultas (Split).
- **ANUAL** (2): Dashboard Anual · Resumen Anual.

Convención de celdas (§10): **azul / amarillo = inputs**, **verdes = cálculos**.

## Nivel diario (Punto 3)

Dos registros separados (plata ≠ ocupación): **1 cobro → N sesiones**, y hay sesiones sin
cobro (socio que consume membresía).

**Caja Diaria (§3.1)** — Fecha · Tipo (Ingreso/Egreso) · Línea/Categoría · Detalle ·
Método de pago · Monto ARS · Monto USD (=ARS÷TC). Ingresos = auto (Invoice/ChargeItem);
egresos de caja chica = manual. El Bar NO va acá.

**Sesiones (§3.2)** — Fecha · Recurso (lista §4) · Servicio/Combo · Ocupantes · ¿Socio? ·
Paciente. 100% auto (Appointment/Slot). `¿Socio?` derivable de `Coverage` activa.

Brechas detectadas:

- **Línea de ingreso comercial (5) ≠ servicio físico (13).** El estado de resultados va por
  línea (Membresías/Sueltas&Combos/Paquetes/IV+TB/Otros); la utilización por recurso físico.
  Falta el corte de `ingresos` por línea comercial en `kpis-finanzas`.
- **Caja chica** = flujo manual nuevo (Excel hoy; `ChargeItem`/`Basic` de egreso a futuro).

## Recursos medidos (§4)

HBOT Monoplaza/Biplaza/Multiplaza · IHHT 1/2 · Recovery Pro Gab 1/2 · Red Light ·
Compresión (IPC06) · Crio (COT03) · Camilla masajes · Consultorio médico · Sala TB / IV.
Slots/día = (horas × 60) ÷ duración; capacidad mensual = slots/día × días operativos.
**Regla R-07:** Recovery Pro Gab 1 y 2 comparten 2 tumbonas Red Light (capacidad acoplada).

### Cálculo (Punto 4)

- Duración 60 min → 12 slots/día → 300/mes; 30 min → 24 slots/día → 600/mes (con 12 h × 25 días).
- **Utilización = sesiones ÷ capacidad** (día o mes). 1 sesión = 1 slot (ocupantes no cuentan
  para slots, sí para ingresos).
- Inputs (duración, horas, días) = manuales (Parámetros); sesiones = auto.
- Repo: `kpis-servicios`/`agenda-ocupacion` debe pasar a la lista cerrada de 13 recursos
  (= 13 `Schedule`/`Location`), tomar la capacidad de Parámetros y aplicar R-07 (extensión
  `comparte-tumbona`).

**R-07 — el problema:** 2 tumbonas físicas sirven a 3 recursos lógicos (Red Light + Recovery
Pro Gab 1/2). Sumar capacidades por separado (24+12+12) sobre-cuenta: el pool real es
2 × 12 h = 1.440 tumbona-min/día. Opciones: (a) **pool de capacidad** en minutos (correcto, 1
número de cuello de botella); (b) **factor de acople editable** (3 filas del modelo + ajuste);
(c) **manual** como el modelo crudo. → DECISIÓN PENDIENTE.

**Dónde se calcula la utilización:** (a) **bot** con params en un recurso de config FHIR
(espejo de Parámetros) → app live + template leen el % resuelto, una sola fuente; (b)
**template** con los Parámetros manuales del Excel (fiel a híbrido pragmático, pero la app
live no muestra ocupación exacta). → DECISIÓN PENDIENTE.

## Pendientes a validar con Andrés / contador

- Base exacta de los %: honorarios médicos 15% y Regenerar 30% sobre IV+TB (§5.9).
- Línea del estado de resultados donde impacta el "Neto BW de consultas" (§5.10).
- Cascada de pricing TB+IV y alícuotas fiscales (§8).
- Inicio de operación: Agosto 2026 (meses previos en cero).
