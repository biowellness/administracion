import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Progress,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getDisplayString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import type { Coverage, Patient } from '@medplum/fhirtypes';
import { IconFileSpreadsheet, IconRefresh } from '@tabler/icons-react';
import { KpiTile } from '../components/KpiTile';
import { TablaMontos } from '../components/TablaMontos';
import { idDeRef } from '../fhir/refs';
import { filasDeMedida, useTipoCambio } from '../fhir/reportes';
import {
  COMBOS,
  PLANES_MEMBRESIA,
  SD_SESIONES_MES,
  SD_SESIONES_USADAS,
  measureCrm,
  measureFinanzas,
  measureServicios,
} from '../fhir/systems';
import { groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { exportarExcel } from '../lib/excel';
import type { HojaReporte } from '../lib/excel';
import { fmt, fmt2 } from '../lib/format';

interface Membresia {
  paciente: string;
  tier: string;
  sesionesMes: number;
  sesionesUsadas: number;
  proximoCobro: string;
}

function extInt(c: Coverage, url: string): number | undefined {
  return c.extension?.find((e) => e.url === url)?.valueInteger;
}

function tierDe(c: Coverage): string {
  const plan = c.class?.find((cl) => cl.type?.coding?.some((x) => x.code === 'plan' || x.code === 'group'));
  return (
    plan?.name ??
    c.class?.[0]?.name ??
    c.class?.[0]?.value ??
    c.type?.text ??
    c.type?.coding?.[0]?.display ??
    '—'
  );
}

/**
 * Membresías & CRM (6.8 · Fase 3) — estado de membresías activas (tier, sesiones
 * usadas/disponibles, próximo cobro) leídas de Coverage; cobros del mes
 * (cobrados/pendientes/fallidos), churn y Founding Members (cupos, descuento, LTV)
 * desde MeasureReports. Exportable a .xlsx.
 */
export function MembresiasPage(): JSX.Element {
  const medplum = useMedplum();
  const cobros = useMeasureReport(measureFinanzas('cobros'));
  const founding = useMeasureReport(measureFinanzas('founding-members'));
  const churn = useMeasureReport(measureCrm('churn'));
  const util = useMeasureReport(measureServicios('membresias-utilizacion'));
  const mrr = useMeasureReport(measureFinanzas('membresias-mrr'));
  const sociosPlan = useMeasureReport(measureFinanzas('membresias-socios-plan'));
  const combos = useMeasureReport(measureFinanzas('combos-vendidos'));
  const { tcUsd } = useTipoCambio();

  const [membresias, setMembresias] = useState<Membresia[]>([]);
  const [loadingCob, setLoadingCob] = useState(true);
  const [error, setError] = useState<Error>();
  const [exportando, setExportando] = useState(false);

  const cargar = useCallback(async () => {
    setLoadingCob(true);
    setError(undefined);
    try {
      const cov = await medplum.searchResources('Coverage', { status: 'active', _count: '1000' });
      const ids = [...new Set(cov.map((c) => idDeRef(c.beneficiary)).filter(Boolean) as string[])];
      const pacientes = ids.length
        ? await medplum.searchResources('Patient', { _id: ids.join(','), _count: '1000' })
        : ([] as Patient[]);
      const porId = new Map(pacientes.filter((p) => p.id).map((p) => [p.id as string, p]));
      setMembresias(
        cov.map((c) => {
          const pid = idDeRef(c.beneficiary);
          const pac = pid ? porId.get(pid) : undefined;
          return {
            paciente: pac ? getDisplayString(pac) : 'Paciente',
            tier: tierDe(c),
            sesionesMes: extInt(c, SD_SESIONES_MES) ?? 0,
            sesionesUsadas: extInt(c, SD_SESIONES_USADAS) ?? 0,
            proximoCobro: c.period?.end?.slice(0, 10) ?? '—',
          };
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoadingCob(false);
    }
  }, [medplum]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const loading =
    loadingCob ||
    cobros.loading ||
    founding.loading ||
    churn.loading ||
    util.loading ||
    mrr.loading ||
    sociosPlan.loading ||
    combos.loading;

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  if (error) {
    return (
      <Alert color="red" title="Error" variant="light">
        No se pudieron cargar las membresías. Probá recargar la página.
      </Alert>
    );
  }

  const mostrarUsd = tcUsd > 0;
  const cobrado = groupValue(cobros.report, 'cobrado');
  const pendiente = groupValue(cobros.report, 'pendiente');
  const fallido = groupValue(cobros.report, 'fallido');
  const churnAlto = groupValue(churn.report, 'alto');
  const utilGlobal = groupValue(util.report, 'global');

  const cuposUsados = groupValue(founding.report, 'cupos-usados');
  const cuposTotales = groupValue(founding.report, 'cupos-totales');
  const descuento = groupValue(founding.report, 'descuento-promedio');
  const ltvFounding = groupValue(founding.report, 'ltv-promedio');

  // Socios por plan + MRR (Fase 2): socios del measure × tarifario del catálogo.
  const planRows = PLANES_MEMBRESIA.map((pl) => {
    const socios = groupValue(sociosPlan.report, pl.codigo);
    return { nombre: pl.nombre, socios, precioUsd: pl.precioUsd, mrrUsd: socios * pl.precioUsd };
  });
  const totalSocios = planRows.reduce((s, r) => s + r.socios, 0);
  const mrrTotalUsd = groupValue(mrr.report, 'global') || planRows.reduce((s, r) => s + r.mrrUsd, 0);

  const comboRows = COMBOS.map((cb) => {
    const vendidos = groupValue(combos.report, cb.codigo);
    return { nombre: cb.nombre, vendidos, precioUsd: cb.precioUsd, ingresoUsd: vendidos * cb.precioUsd };
  });
  const combosTotal = comboRows.reduce((s, r) => s + r.vendidos, 0);
  const ingresoCombosUsd = comboRows.reduce((s, r) => s + r.ingresoUsd, 0);

  const exportar = async (): Promise<void> => {
    setExportando(true);
    try {
      const hojas: HojaReporte[] = [
        {
          nombre: 'Membresías activas',
          columnas: [
            { key: 'paciente', titulo: 'Paciente', ancho: 28 },
            { key: 'tier', titulo: 'Tier', ancho: 18 },
            { key: 'sesionesUsadas', titulo: 'Usadas', formato: 'num' },
            { key: 'sesionesMes', titulo: 'Mensuales', formato: 'num' },
            { key: 'disponibles', titulo: 'Disponibles', formato: 'num' },
            { key: 'proximoCobro', titulo: 'Próximo cobro', ancho: 16 },
          ],
          filas: membresias.map((m) => ({
            paciente: m.paciente,
            tier: m.tier,
            sesionesUsadas: m.sesionesUsadas,
            sesionesMes: m.sesionesMes,
            disponibles: Math.max(0, m.sesionesMes - m.sesionesUsadas),
            proximoCobro: m.proximoCobro,
          })),
        },
        {
          nombre: 'Cobros del mes',
          columnas: [
            { key: 'concepto', titulo: 'Estado', ancho: 22 },
            { key: 'valor', titulo: 'ARS', formato: 'ars' },
            { key: 'usd', titulo: 'USD', formato: 'usd' },
          ],
          filas: filasDeMedida(cobros.report, { tcUsd, incluirGlobal: true }),
        },
        {
          nombre: 'Founding Members',
          columnas: [
            { key: 'concepto', titulo: 'Métrica', ancho: 28 },
            { key: 'valor', titulo: 'Valor', formato: 'num' },
          ],
          filas: [
            { concepto: 'Cupos usados', valor: cuposUsados },
            { concepto: 'Cupos totales', valor: cuposTotales },
            { concepto: 'Descuento promedio (%)', valor: descuento },
            { concepto: 'LTV promedio (ARS)', valor: ltvFounding },
          ],
        },
        {
          nombre: 'Socios por plan y MRR',
          columnas: [
            { key: 'nombre', titulo: 'Plan', ancho: 28 },
            { key: 'socios', titulo: 'Socios', formato: 'num' },
            { key: 'precioUsd', titulo: 'Precio USD', formato: 'num' },
            { key: 'mrrUsd', titulo: 'MRR USD', formato: 'usd' },
          ],
          filas: planRows.map((r) => ({ ...r })),
        },
        {
          nombre: 'Combos vendidos',
          columnas: [
            { key: 'nombre', titulo: 'Combo', ancho: 24 },
            { key: 'vendidos', titulo: 'Vendidos', formato: 'num' },
            { key: 'precioUsd', titulo: 'Precio USD', formato: 'num' },
            { key: 'ingresoUsd', titulo: 'Ingreso USD', formato: 'usd' },
          ],
          filas: comboRows.map((r) => ({ ...r })),
        },
      ];
      await exportarExcel(`biowellness-membresias-${new Date().toISOString().slice(0, 10)}.xlsx`, hojas);
      notifications.show({ color: 'teal', message: 'Membresías exportadas.' });
    } catch {
      notifications.show({ color: 'red', title: 'Error', message: 'No se pudo exportar.' });
    } finally {
      setExportando(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Membresías</Title>
        <Group gap="xs">
          <Badge variant="light" color={mostrarUsd ? 'teal' : 'gray'}>
            {mostrarUsd ? `TC USD $${fmt2(tcUsd)}` : 'TC USD sin dato'}
          </Badge>
          <Button
            variant="light"
            leftSection={<IconFileSpreadsheet size={16} />}
            loading={exportando}
            onClick={() => void exportar()}
          >
            Exportar .xlsx
          </Button>
          <Tooltip label="Actualizar">
            <ActionIcon variant="subtle" color="gray" onClick={() => cargar()} aria-label="Actualizar">
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 5 }} spacing="sm">
        <KpiTile label="MRR membresías" value={`US$ ${fmt(mrrTotalUsd)}`} color="teal" sub={`${fmt(totalSocios)} socios activos`} />
        <KpiTile label="Membresías activas" value={fmt(membresias.length)} />
        <KpiTile label="Utilización global" value={`${fmt(utilGlobal)}%`} />
        <KpiTile label="Cobrado (mes)" value={`$${fmt(cobrado)}`} color="teal" sub={mostrarUsd ? `US$ ${fmt(cobrado / tcUsd)}` : undefined} />
        <KpiTile label="Churn (alto)" value={fmt(churnAlto)} color={churnAlto > 0 ? 'orange' : undefined} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder radius="md" padding="lg">
          <Group justify="space-between" mb="sm">
            <Text fw={500}>Socios por plan y MRR</Text>
            <Badge variant="light" color="teal">
              US$ {fmt(mrrTotalUsd)}/mes
            </Badge>
          </Group>
          <Table.ScrollContainer minWidth={420}>
            <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Plan</Table.Th>
                  <Table.Th ta="right">Socios</Table.Th>
                  <Table.Th ta="right">Precio USD</Table.Th>
                  <Table.Th ta="right">MRR USD</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {planRows.map((r) => (
                  <Table.Tr key={r.nombre}>
                    <Table.Td>{r.nombre}</Table.Td>
                    <Table.Td ta="right">{fmt(r.socios)}</Table.Td>
                    <Table.Td ta="right">{fmt(r.precioUsd)}</Table.Td>
                    <Table.Td ta="right">{r.mrrUsd > 0 ? `US$ ${fmt(r.mrrUsd)}` : '—'}</Table.Td>
                  </Table.Tr>
                ))}
                <Table.Tr>
                  <Table.Td fw={600}>TOTAL</Table.Td>
                  <Table.Td ta="right" fw={600}>
                    {fmt(totalSocios)}
                  </Table.Td>
                  <Table.Td />
                  <Table.Td ta="right" fw={600}>
                    US$ {fmt(mrrTotalUsd)}
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Group justify="space-between" mb="sm">
            <Text fw={500}>Combos vendidos</Text>
            <Badge variant="light" color="gray">
              US$ {fmt(ingresoCombosUsd)}
            </Badge>
          </Group>
          <Table.ScrollContainer minWidth={420}>
            <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Combo</Table.Th>
                  <Table.Th ta="right">Vendidos</Table.Th>
                  <Table.Th ta="right">Precio USD</Table.Th>
                  <Table.Th ta="right">Ingreso USD</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {comboRows.map((r) => (
                  <Table.Tr key={r.nombre}>
                    <Table.Td>{r.nombre}</Table.Td>
                    <Table.Td ta="right">{fmt(r.vendidos)}</Table.Td>
                    <Table.Td ta="right">{fmt(r.precioUsd)}</Table.Td>
                    <Table.Td ta="right">{r.ingresoUsd > 0 ? `US$ ${fmt(r.ingresoUsd)}` : '—'}</Table.Td>
                  </Table.Tr>
                ))}
                <Table.Tr>
                  <Table.Td fw={600}>TOTAL</Table.Td>
                  <Table.Td ta="right" fw={600}>
                    {fmt(combosTotal)}
                  </Table.Td>
                  <Table.Td />
                  <Table.Td ta="right" fw={600}>
                    US$ {fmt(ingresoCombosUsd)}
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb="sm">
            Cobros del mes
          </Text>
          <TablaMontos
            filas={filasDeMedida(cobros.report, { tcUsd, incluirGlobal: true })}
            mostrarUsd={mostrarUsd}
            conceptoLabel="Estado"
          />
          {(pendiente > 0 || fallido > 0) && (
            <Text size="xs" c="dimmed" mt="sm">
              Pendiente ${fmt(pendiente)} · Fallido ${fmt(fallido)}
            </Text>
          )}
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb="sm">
            Founding Members
          </Text>
          {cuposTotales > 0 ? (
            <Stack gap="sm">
              <div>
                <Group justify="space-between" mb={4}>
                  <Text size="sm">Cupos</Text>
                  <Text size="sm" fw={500}>
                    {fmt(cuposUsados)} / {fmt(cuposTotales)}
                  </Text>
                </Group>
                <Progress value={(cuposUsados / cuposTotales) * 100} size="lg" radius="sm" color="teal" />
              </div>
              <SimpleGrid cols={2} spacing="sm">
                <KpiTile label="Descuento promedio" value={`${fmt(descuento)}%`} />
                <KpiTile label="LTV promedio" value={`$${fmt(ltvFounding)}`} sub={mostrarUsd ? `US$ ${fmt(ltvFounding / tcUsd)}` : undefined} />
              </SimpleGrid>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              Sin datos de Founding Members en el período.
            </Text>
          )}
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Text fw={500} mb="sm">
          Membresías activas
        </Text>
        {membresias.length === 0 ? (
          <Text size="sm" c="dimmed">
            No hay Coverage activos.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Paciente</Table.Th>
                  <Table.Th>Tier</Table.Th>
                  <Table.Th>Sesiones</Table.Th>
                  <Table.Th>Próximo cobro</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {membresias.map((m, i) => {
                  const disponibles = Math.max(0, m.sesionesMes - m.sesionesUsadas);
                  const pct = m.sesionesMes > 0 ? (m.sesionesUsadas / m.sesionesMes) * 100 : 0;
                  return (
                    <Table.Tr key={`${m.paciente}-${i}`}>
                      <Table.Td>{m.paciente}</Table.Td>
                      <Table.Td>
                        <Badge variant="light" color="gray">
                          {m.tier}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Progress value={pct} size="sm" radius="sm" w={90} color={disponibles === 0 ? 'orange' : 'teal'} />
                          <Text size="xs" c="dimmed">
                            {fmt(m.sesionesUsadas)}/{fmt(m.sesionesMes)} · {fmt(disponibles)} disp.
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>{m.proximoCobro}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
}
