# Plan de implementación — Tablero de Gestión (Anexo D)

> **Para:** Andrés Aizenberg (+ José, lead técnico) · **De:** equipo de desarrollo
> **Estado:** plan tras el análisis punto por punto del Anexo D (ver `README.md` de esta carpeta).

---

## En 30 segundos

- **El objetivo:** que con **un clic** tengas el **estado de resultados mensual** (en ARS y USD, listo
  para mandar a los socios) y un **tablero en vivo**, donde el sistema llena solo lo que sabe y vos
  solo cargás lo que no puede saber (gastos, caja chica, Bar).
- **La planilla modelo manda:** el sistema va a **rellenar esa misma planilla** con datos en vivo
  (mismos colores, tortas y fórmulas). No reinventamos el diseño.
- **Ya hay mucho hecho:** la app de Administración con sus tableros y los primeros bots de finanzas
  ya están funcionando. Esto **suma** una capa, no empieza de cero.
- **Lo construimos por etapas**, cada una te deja algo usable. Arrancamos por lo que **desbloquea el
  estado de resultados**.
- **Necesito 4 definiciones tuyas/del contador** (abajo) para que los números cierren exactos.

---

## Lo que YA está construido (no arrancamos de cero)

- **App de Administración** (`admin.medplum.com.ar`): Dashboard ejecutivo, Resumen/Embudo, Pipeline,
  Retención, Segmentos, Campañas, Servicios, Membresías, Ingresos, Financiero, Clínicos, Gestión,
  Reportes — con **modo claro/oscuro** y **exportación `.xlsx`** de un clic.
- **Bots de datos:** `kpis-finanzas` (ingresos por servicio/médico, cobros, IV+TB, margen) y
  `tipo-cambio` (TC ARS/USD automático).
- **Motor de exportación** a Excel y el patrón de tablas/KPIs reutilizable.

## Lo que falta, y en qué orden

> Esfuerzo relativo: **S** (chico) · **M** (medio) · **L** (grande). Cada fase deja algo usable.

| Fase | Qué obtenés (negocio) | Piezas técnicas | Esfuerzo | Depende de |
|---|---|---|---|---|
| **0 · Fundaciones** | Una **pantalla de Parámetros** editable (TC, %s, días/horas, participaciones) y el corte de **ingresos por línea comercial** (Membresías / Sueltas&Combos / Paquetes / IV+TB / Otros). | Config FHIR de parámetros + `ingresos-linea` (clasificador) + marca de línea en el cobro | **M** | — |
| **1 · Estado de resultados** ⭐ | El **informe mensual para socios** de un clic: ingresos por línea → gastos → caja chica → resultado y margen → Bar → resultado total, en **ARS y USD**, + el **análisis automático** en palabras. | `gastos-operativos`, `caja-chica`, `estado-resultados`, narrador + pantalla P&L + export del template mensual | **L** | Fase 0 |
| **2 · Membresías y cobranza** | Panel de **socios activos por plan + MRR** (ingreso recurrente), **combos vendidos**, y **formas de pago** (diario/mensual/anual con torta). | `membresias-mrr`/`socios-plan`, `combos-vendidos`, formas de pago diario, catálogo de planes/combos | **M** | Fase 0 |
| **3 · Día a día y ocupación** | **Cierre de caja diario** (saldo acumulado + arqueo de efectivo) y **utilización por recurso** (con el cuello de botella de las tumbonas Red Light marcado). | `resumen-diario`, `utilizacion-diaria` (13 recursos, regla R-07), pantalla "Día" | **L** | Fase 0 · bot de servicios |
| **4 · Anual y cierre de mes** | El **consolidado anual** (los 12 meses, evolución, mejor mes, mix) y la **distribución por socio** del año. Botón **"Cerrar mes"** que completa el anual solo. | acción "Cerrar mes" + roll-up + export del template anual | **M** | Fases 1-2 |
| **5 · Consultas y robustez** | **Consultas con split** (médicas 70/30, nutrición 50/20/30) conectadas al resultado, + chequeos que **impiden exportar un informe que no cuadra**. | `consultas-split`, invariantes de exportación, suite de pruebas (CA-1..11), re-import de inputs | **M** | Fases 1-4 |

**Camino corto al mayor valor:** Fase 0 → Fase 1 te da **lo que más pediste** (el estado de resultados
mensual para socios, de un clic). Las demás amplían.

---

## ✅ Decisiones — confirmadas por Andrés

1. **IV + Terapias Biológicas:** de lo cobrado se descuenta el insumo **Regenerar** + **25%**
   (impuestos + procesador de pago); del neto, **15% médicos** (Dra Dos Santos · Dr D'Alessandro) y
   **85% BioWellness**. → aparece una **columna de liquidación médica**.
2. **Consultas:** de lo cobrado se descuenta **25%** (impuestos + procesador); del neto, **70% médicos**
   (Dra Dos Santos · Dr D'Alessandro) y **30% BioWellness**. El 30% entra como **línea de ingreso
   "Consultas"** en el estado de resultados.
3. **Participaciones (7 socios = 100%):** Andrés Aizenberg 53 · **Diego Aizenberg 24** · Daniel
   Tognetti 9 · Evangelina Varela 6 · Julián Massetti 5 · Fernando Aldazábal 2 · Diego Sívori 1.
4. **Tarifario (precios para el MRR):** lo define Andrés **al final**, según mercado → input diferido;
   el MRR usa precios configurables hasta entonces.

**Quedan por confirmar (detalle fino):** el insumo Regenerar (¿% editable o costo real?); la
composición del 25% y si aplica a más líneas; el reparto entre los dos médicos (por quién atendió o
partes iguales); si Consultas incluye nutrición (50/20/30) o solo médicas.

*(Definiciones técnicas por defecto: la regla **R-07** se modela como **pool de capacidad**; y los
parámetros viven en el sistema —no sueltos en un Excel— para que el tablero y el `.xlsx` coincidan.)*

---

## Riesgos y cómo los manejamos

- **Que el Excel exportado abra con errores de fórmula** (el riesgo típico de "rellenar una planilla").
  → Lo evitamos con la regla **"el sistema nunca escribe una celda de fórmula"**: rellena los datos
  crudos y la planilla recalcula sola; + una prueba automática que abre el archivo generado y verifica
  que no haya errores.
- **El cálculo de ocupación necesita el bot de servicios** (sesiones por recurso), que todavía no está
  en este proyecto. → Lo incluimos en la Fase 3 (es una pieza identificada, no una sorpresa).
- **Que un informe no cuadre** (la distribución no suma 100%, el P&L no cierra). → **No se exporta**:
  el sistema avisa antes de generar, así nunca mandás a los socios un número que no suma.

---

## Apéndice técnico (para José)

**Measures nuevos** (los producen los bots, la app/template los leen):
`ingresos-linea`, `gastos-operativos`, `estado-resultados`, `caja-chica`, `resumen-diario`,
`ingresos-cobro-diario`, `membresias-socios-plan`, `membresias-mrr`, `combos-vendidos`,
`consultas-split`, `utilizacion-diaria`, `analisis-mensual`. (Detalle de grupos en `README.md` §Punto 5.)

**A externalizar (hoy hardcodeado en el repo):** `SPLIT_PROFESIONAL`/`DEDUCCION_PCT`/`MARGEN_PCT` en
`bots/kpis-finanzas.ts`, `OCUPACION_ALTA` en `ServiciosPage.tsx` → recurso de **config FHIR por período**.

**Piezas nuevas:** clasificador de línea comercial (marca en `ChargeItem` / derivación de `Coverage`);
acción **"Cerrar mes"** (snapshot → anual); **motor de template** con ExcelJS (carga la planilla modelo
y rellena por **named-ranges**); bot **`kpis-servicios`** (utilización por recurso + R-07); pantallas
**Parámetros**, **Estado de resultados**, **Día**.

**Reuso:** `tipo-cambio`, `ingresos-cobro`, lectura de `Coverage` (Membresías), patrón de export.

**Calidad:** suite **CA-1..11** automatizada + invariantes en tiempo de exportación (CA-5/6/10).
