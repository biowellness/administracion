import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Drawer,
  Group,
  Loader,
  NumberInput,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMedplum } from '@medplum/react';
import { IconFileSpreadsheet, IconInfoCircle, IconPencil, IconTable } from '@tabler/icons-react';
import modeloTableroUrl from '../assets/tablero-mensual-modelo.xlsx?url';
import { KpiTile } from '../components/KpiTile';
import {
  distribucionSocios,
  filasPyL,
  narrador,
  type EstiloFila,
  type LineaNarrador,
} from '../fhir/estadoResultados';
import { guardarInputsMes, inputsDefault, useInputsMes, type InputsMes } from '../fhir/inputs';
import { periodoActual, useParametros } from '../fhir/parametros';
import { useTipoCambio } from '../fhir/reportes';
import { GASTO_LINEAS, measureFinanzas } from '../fhir/systems';
import { groupCode, groupLabel, groups, groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { exportarExcel, type HojaReporte } from '../lib/excel';
import { descargarBlob, rellenarTablero, type DatosTablero } from '../lib/templateVivo';
import { fmt, fmt2 } from '../lib/format';

const TONO_COLOR: Record<LineaNarrador['tono'], string> = {
  positivo: 'teal',
  negativo: 'red',
  alerta: 'orange',
  neutro: 'dimmed',
};

/** Estilos por tipo de fila del P&L. */
function filaProps(estilo: EstiloFila): { fw?: number; c?: string; bg?: string } {
  switch (estilo) {
    case 'subtotal':
      return { fw: 600 };
    case 'resta':
      return { c: 'dimmed' };
    case 'resultado':
      return { fw: 700 };
    default:
      return {};
  }
}

/**
 * Estado de Resultados (Anexo D · Fase 1) — el informe mensual para socios, de un clic, en
 * ARS + USD: ingresos por línea → gastos → caja chica → EBITDA → Bar → resultado total, con
 * la distribución por socio y el análisis automático. Lee los Measures que produce
 * `kpis-finanzas`; los inputs manuales (gastos, Bar, caja chica) se cargan en el cajón lateral.
 */
export function EstadoResultadosPage(): JSX.Element {
  const medplum = useMedplum();
  const estado = useMeasureReport(measureFinanzas('estado-resultados'));
  const linea = useMeasureReport(measureFinanzas('ingresos-linea'));
  const ingresos = useMeasureReport(measureFinanzas('ingresos'));
  const mrr = useMeasureReport(measureFinanzas('membresias-mrr'));
  const cobro = useMeasureReport(measureFinanzas('ingresos-cobro'));
  const gastos = useMeasureReport(measureFinanzas('gastos-operativos'));
  const { tcUsd } = useTipoCambio();

  const periodo = estado.report?.period?.start?.slice(0, 7) ?? periodoActual();
  const { params } = useParametros(periodo);
  const { inputs } = useInputsMes(periodo);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [generandoPlanilla, setGenerandoPlanilla] = useState(false);

  const loading = estado.loading || linea.loading || ingresos.loading || mrr.loading || cobro.loading;
  const mostrarUsd = tcUsd > 0;
  const hayEstado = !!estado.report;

  const ingresosWellness = groupValue(estado.report, 'ingresos-wellness');
  const resultadoTotal = groupValue(estado.report, 'resultado-total');
  const margen = groupValue(estado.report, 'margen-operativo') * 100;
  const margenObjetivo = params.margenObjetivoPct;
  const mrrUsd = groupValue(mrr.report, 'global');

  const pyl = useMemo(() => filasPyL(estado.report, linea.report, tcUsd), [estado.report, linea.report, tcUsd]);
  const socios = useMemo(
    () => distribucionSocios(resultadoTotal, params.participaciones, tcUsd),
    [resultadoTotal, params.participaciones, tcUsd]
  );
  const analisis = useMemo(
    () =>
      narrador(
        { estado: estado.report, ingresos: ingresos.report, mrr: mrr.report, cobro: cobro.report },
        margenObjetivo
      ),
    [estado.report, ingresos.report, mrr.report, cobro.report, margenObjetivo]
  );

  // Mix de ingresos por línea (con % del total).
  const mix = groups(linea.report)
    .filter((g) => g.code?.coding?.[0]?.code !== 'global')
    .map((g) => ({ label: groupLabel(g), ars: g.measureScore?.value ?? 0 }));
  const mixTotal = mix.reduce((s, m) => s + m.ars, 0) || ingresosWellness;

  const margenColor = margen < 0 ? 'red' : margen < margenObjetivo ? 'orange' : 'teal';

  const exportar = async (): Promise<void> => {
    setExportando(true);
    try {
      const colsPyL: HojaReporte['columnas'] = [
        { key: 'concepto', titulo: 'Concepto', ancho: 34 },
        { key: 'ars', titulo: 'ARS', formato: 'ars' },
        { key: 'usd', titulo: 'USD', formato: 'usd' },
      ];
      const hojas: HojaReporte[] = [
        { nombre: 'Estado de Resultados', columnas: colsPyL, filas: pyl.map((f) => ({ ...f })) },
        {
          nombre: 'Distribución socios',
          columnas: [
            { key: 'nombre', titulo: 'Socio', ancho: 28 },
            { key: 'pct', titulo: '%', formato: 'num' },
            { key: 'parteArs', titulo: 'Parte ARS', formato: 'ars' },
            { key: 'parteUsd', titulo: 'Parte USD', formato: 'usd' },
          ],
          filas: socios.map((s) => ({ ...s })),
        },
      ];
      await exportarExcel(`biowellness-estado-resultados-${periodo}.xlsx`, hojas);
      notifications.show({ color: 'teal', message: 'Estado de resultados exportado.' });
    } catch {
      notifications.show({ color: 'red', title: 'Error', message: 'No se pudo exportar.' });
    } finally {
      setExportando(false);
    }
  };

  // Rellena la planilla modelo (template vivo) con los datos en vivo y la descarga.
  const exportarPlanilla = async (): Promise<void> => {
    setGenerandoPlanilla(true);
    try {
      const lineas = groups(linea.report)
        .filter((gr) => groupCode(gr) !== 'global')
        .map((gr) => ({ codigo: groupCode(gr) ?? '', monto: gr.measureScore?.value ?? 0 }));
      const metodos = groups(cobro.report)
        .filter((gr) => groupCode(gr) !== 'global')
        .map((gr) => ({ codigo: groupCode(gr) ?? '', monto: gr.measureScore?.value ?? 0 }));
      const datos: DatosTablero = {
        periodo,
        tcUsd: tcUsd || 1,
        dias: params.diasOperativos,
        horas: params.horasOperativas,
        saldoCajaChica: inputs.cajaChicaSaldoInicial || params.saldoInicialCajaChica,
        duraciones: params.recursos.map((r) => r.duracionMin),
        cargasPct: params.cargasSocialesPct,
        sueldosBrutos: inputs.sueldosBrutos,
        conrado: params.honorarioConrado,
        gastosManual: inputs.gastos as Record<string, number>,
        gastosVarios: inputs.gastos['gastos-varios'] ?? 0,
        barNeto: inputs.barNeto,
        ingresosMesAnterior: groupValue(ingresos.report, 'mes-anterior'),
        cajaChicaEgresos: inputs.cajaChicaEgresos,
        lineas,
        metodos,
      };
      const modelo = await fetch(modeloTableroUrl).then((r) => r.arrayBuffer());
      const blob = await rellenarTablero(modelo, datos);
      descargarBlob(blob, `biowellness-tablero-mensual-${periodo}.xlsx`);
      notifications.show({ color: 'teal', message: 'Planilla del tablero generada.' });
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Error',
        message: e instanceof Error ? e.message : 'No se pudo generar la planilla.',
      });
    } finally {
      setGenerandoPlanilla(false);
    }
  };

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="sm" align="center">
          <Title order={3}>Estado de Resultados</Title>
          <Badge variant="light" color="gray">
            {periodo}
          </Badge>
          <Badge variant="light" color={mostrarUsd ? 'teal' : 'gray'}>
            {mostrarUsd ? `TC USD $${fmt2(tcUsd)}` : 'TC USD sin dato'}
          </Badge>
        </Group>
        <Group gap="xs">
          <Button variant="light" leftSection={<IconPencil size={16} />} onClick={() => setDrawerAbierto(true)}>
            Cargar gastos
          </Button>
          <Button
            variant="light"
            leftSection={<IconFileSpreadsheet size={16} />}
            loading={exportando}
            disabled={!hayEstado}
            onClick={() => void exportar()}
          >
            Exportar .xlsx
          </Button>
          <Button
            leftSection={<IconTable size={16} />}
            loading={generandoPlanilla}
            disabled={!hayEstado}
            onClick={() => void exportarPlanilla()}
          >
            Generar planilla
          </Button>
        </Group>
      </Group>

      {!hayEstado && (
        <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
          Todavía no hay un estado de resultados calculado. Cargá los gastos del mes y corré el cierre
          (bot <Text span fw={500}>kpis-finanzas</Text>) para generarlo.
        </Alert>
      )}

      {/* KPIs (espejo del Dashboard del modelo) */}
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="sm">
        <KpiTile
          label="Ingresos Wellness (ARS)"
          value={`$${fmt(ingresosWellness)}`}
          sub={mostrarUsd ? `US$ ${fmt(ingresosWellness / tcUsd)}` : undefined}
          color="teal"
        />
        <KpiTile
          label="Resultado total"
          value={`$${fmt(resultadoTotal)}`}
          color={resultadoTotal >= 0 ? 'teal' : 'red'}
          sub={mostrarUsd ? `US$ ${fmt(resultadoTotal / tcUsd)}` : undefined}
        />
        <KpiTile label="Margen operativo" value={`${fmt2(margen)}%`} color={margenColor} sub={`Objetivo ${fmt(margenObjetivo)}%`} />
        <KpiTile label="MRR membresías" value={`US$ ${fmt(mrrUsd)}`} sub={`${fmt(groupValue(mrr.report, 'socios'))} socios`} />
        <KpiTile label="Ocupación prom." value="—" sub="Fase 3 · ocupación" />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        {/* Estado de resultados */}
        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb="sm">
            Estado de resultados del mes
          </Text>
          <Table verticalSpacing="xs" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Concepto</Table.Th>
                <Table.Th ta="right">ARS</Table.Th>
                {mostrarUsd && <Table.Th ta="right">USD</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pyl.map((f, i) => {
                const props = filaProps(f.estilo);
                const colorMonto = f.estilo === 'resultado' ? (f.ars >= 0 ? 'teal' : 'red') : props.c;
                return (
                  <Table.Tr key={`${f.concepto}-${i}`}>
                    <Table.Td>
                      <Text size="sm" fw={props.fw} c={props.c}>
                        {f.concepto}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" fw={props.fw} c={colorMonto}>
                        ${fmt(f.ars)}
                      </Text>
                    </Table.Td>
                    {mostrarUsd && (
                      <Table.Td ta="right">
                        <Text size="sm" fw={props.fw} c={colorMonto}>
                          {f.usd != null ? `US$ ${fmt(f.usd)}` : '—'}
                        </Text>
                      </Table.Td>
                    )}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          <Divider my="sm" />
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Margen operativo (wellness)
            </Text>
            <Badge size="lg" variant="light" color={margenColor}>
              {fmt2(margen)}%
            </Badge>
          </Group>
        </Card>

        <Stack gap="md">
          {/* Mix de ingresos por línea */}
          <Card withBorder radius="md" padding="lg">
            <Text fw={500} mb="sm">
              Mix de ingresos por línea
            </Text>
            <Stack gap="xs">
              {mix.map((m) => {
                const pct = mixTotal > 0 ? (m.ars / mixTotal) * 100 : 0;
                return (
                  <div key={m.label}>
                    <Group justify="space-between" gap="xs" mb={2}>
                      <Text size="sm">{m.label}</Text>
                      <Text size="sm" c="dimmed">
                        ${fmt(m.ars)} · {fmt2(pct)}%
                      </Text>
                    </Group>
                    <Progress value={pct} color="teal" size="sm" />
                  </div>
                );
              })}
            </Stack>
          </Card>

          {/* Análisis automático */}
          <Card withBorder radius="md" padding="lg">
            <Text fw={500} mb="sm">
              Análisis automático del mes
            </Text>
            <Stack gap={6}>
              {analisis.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Sin datos para analizar todavía.
                </Text>
              ) : (
                analisis.map((l, i) => (
                  <Text key={i} size="sm" c={TONO_COLOR[l.tono]}>
                    {l.texto}
                  </Text>
                ))
              )}
            </Stack>
          </Card>
        </Stack>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        {/* Distribución por socio */}
        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb={4}>
            Distribución del resultado por socio
          </Text>
          <Text size="xs" c="dimmed" mb="sm">
            Reparto bruto del resultado total (no descuenta reservas/CAPEX). Σ = 100%.
          </Text>
          <Table verticalSpacing="xs" horizontalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Socio</Table.Th>
                <Table.Th ta="right">%</Table.Th>
                <Table.Th ta="right">Parte (ARS)</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {socios.map((s) => (
                <Table.Tr key={s.nombre}>
                  <Table.Td>{s.nombre}</Table.Td>
                  <Table.Td ta="right">{fmt(s.pct)}%</Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" c={s.parteArs >= 0 ? undefined : 'red'}>
                      ${fmt(s.parteArs)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>

        {/* Detalle de gastos */}
        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb="sm">
            Gastos operativos del mes
          </Text>
          {gastos.report ? (
            <Table verticalSpacing="xs" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Concepto</Table.Th>
                  <Table.Th ta="right">ARS</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {groups(gastos.report).map((g, i) => {
                  const code = g.code?.coding?.[0]?.code;
                  const esTotal = code === 'total' || code === 'global';
                  return (
                    <Table.Tr key={`${code}-${i}`}>
                      <Table.Td>
                        <Text size="sm" fw={esTotal ? 600 : undefined}>
                          {groupLabel(g)}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" fw={esTotal ? 600 : undefined}>
                          ${fmt(g.measureScore?.value ?? 0)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="sm" c="dimmed">
              Cargá los gastos del mes para ver el detalle.
            </Text>
          )}
        </Card>
      </SimpleGrid>

      <InputsDrawer
        abierto={drawerAbierto}
        onCerrar={() => setDrawerAbierto(false)}
        periodo={periodo}
        onGuardado={() => setDrawerAbierto(false)}
        medplum={medplum}
      />
    </Stack>
  );
}

interface DrawerProps {
  abierto: boolean;
  onCerrar: () => void;
  periodo: string;
  onGuardado: () => void;
  medplum: ReturnType<typeof useMedplum>;
}

/** Cajón lateral para cargar los inputs manuales del mes (gastos, Bar, caja chica). */
function InputsDrawer({ abierto, onCerrar, periodo, onGuardado, medplum }: DrawerProps): JSX.Element {
  const { inputs: cargados, loading } = useInputsMes(periodo);
  const [form, setForm] = useState<InputsMes>(() => inputsDefault(periodo));
  const [guardando, setGuardando] = useState(false);

  // Re-sembrar el formulario cuando cambia el período o termina la carga.
  useEffect(() => {
    if (!loading) {
      setForm(cargados);
    }
  }, [loading, cargados]);

  const setGasto = (key: string, v: number): void =>
    setForm((p) => ({ ...p, gastos: { ...p.gastos, [key]: v } }));

  const guardar = async (): Promise<void> => {
    setGuardando(true);
    try {
      await guardarInputsMes(medplum, { ...form, periodo });
      notifications.show({
        color: 'teal',
        title: 'Inputs guardados',
        message: 'Se reflejan al recalcular el cierre (bot kpis-finanzas).',
      });
      onGuardado();
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Error',
        message: e instanceof Error ? e.message : 'No se pudo guardar.',
      });
    } finally {
      setGuardando(false);
    }
  };

  const num = (label: string, value: number, onChange: (v: number) => void, desc?: string): JSX.Element => (
    <NumberInput
      label={label}
      description={desc}
      value={value}
      onChange={(v) => onChange(Number(v) || 0)}
      thousandSeparator="."
      decimalSeparator=","
      min={0}
    />
  );

  const manuales = GASTO_LINEAS.filter((g) => g.tipo === 'manual');

  return (
    <Drawer opened={abierto} onClose={onCerrar} position="right" size="md" title={`Cargar gastos · ${periodo}`}>
      <ScrollArea h="calc(100vh - 120px)">
        <Stack gap="md" pr="sm">
          <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
            Cargá lo que el sistema no puede saber. Los ingresos cobrados, honorarios médicos e insumos
            Regenerar se calculan solos.
          </Alert>

          <Text fw={500} size="sm">
            Sueldos
          </Text>
          {num('Sueldos brutos del mes (ARS)', form.sueldosBrutos, (v) => setForm((p) => ({ ...p, sueldosBrutos: v })), 'El sistema le suma las cargas sociales')}

          <Divider />
          <Text fw={500} size="sm">
            Gastos manuales
          </Text>
          {manuales.map((g) => (
            <div key={g.key}>{num(g.label, form.gastos[g.key] ?? 0, (v) => setGasto(g.key, v))}</div>
          ))}

          <Divider />
          <Text fw={500} size="sm">
            Bar y caja chica
          </Text>
          {num('Bar — resultado neto (ARS)', form.barNeto, (v) => setForm((p) => ({ ...p, barNeto: v })))}
          {num('Caja chica — saldo inicial (ARS)', form.cajaChicaSaldoInicial, (v) =>
            setForm((p) => ({ ...p, cajaChicaSaldoInicial: v }))
          )}
          {num('Caja chica — egresos del mes (ARS)', form.cajaChicaEgresos, (v) =>
            setForm((p) => ({ ...p, cajaChicaEgresos: v }))
          )}

          <Button loading={guardando} disabled={loading} onClick={() => void guardar()} mt="sm">
            Guardar inputs
          </Button>
        </Stack>
      </ScrollArea>
    </Drawer>
  );
}
