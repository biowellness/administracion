import { Alert, Badge, Card, Group, Loader, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { FilaBarra } from '../components/FilaBarra';
import { KpiTile } from '../components/KpiTile';
import { periodoActual, useParametros } from '../fhir/parametros';
import { useTipoCambio } from '../fhir/reportes';
import { POOL_RED_LIGHT_CODE, measureFinanzas, measureServicios } from '../fhir/systems';
import { groupCode, groupLabel, groups, groupValue, popValue, useMeasureReport } from '../hooks/useMeasureReport';
import { fmt, fmt2 } from '../lib/format';

/**
 * Día — el día a día operativo (Anexo D · Fase 3): el **cierre de caja diario** (saldo del
 * día, acumulado del mes y arqueo de efectivo) y la **utilización por recurso** del mes, con
 * el **cuello de botella de las tumbonas Red Light** marcado (regla R-07, pool de capacidad).
 * Lee `resumen-diario` (kpis-finanzas) y `utilizacion-recurso` (kpis-servicios).
 */
export function DiaPage(): JSX.Element {
  const util = useMeasureReport(measureServicios('utilizacion-recurso'));
  const diario = useMeasureReport(measureFinanzas('resumen-diario'));
  const { tcUsd } = useTipoCambio();

  const periodo =
    diario.report?.period?.start?.slice(0, 7) ?? util.report?.period?.start?.slice(0, 7) ?? periodoActual();
  const { params } = useParametros(periodo);

  const loading = util.loading || diario.loading;
  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  const mostrarUsd = tcUsd > 0;
  const ocupacionAlta = params.ocupacionAltaPct || 85;

  // Utilización por recurso (excluye global y el pool).
  const recursos = groups(util.report)
    .filter((g) => {
      const c = groupCode(g);
      return c !== 'global' && c !== POOL_RED_LIGHT_CODE;
    })
    .map((g) => ({
      label: groupLabel(g),
      util: (g.measureScore?.value ?? 0) * 100,
      sesiones: popValue(g, 'sesiones'),
      capacidad: popValue(g, 'capacidad'),
      comparte: params.recursos.find((r) => r.nombre === groupLabel(g))?.comparteTumbona ?? false,
    }))
    .sort((a, b) => b.util - a.util);

  const utilGlobal = groupValue(util.report, 'global') * 100;
  const poolGroup = groups(util.report).find((g) => groupCode(g) === POOL_RED_LIGHT_CODE);
  const poolUtil = (poolGroup?.measureScore?.value ?? 0) * 100;

  // Cierre de caja diario.
  const dias = groups(diario.report);
  const ultimo = dias[dias.length - 1];
  const saldoAcum = ultimo ? popValue(ultimo, 'saldo-acum') : 0;
  const saldoEfectivo = ultimo ? popValue(ultimo, 'saldo-efectivo') : 0;

  const hayDatos = recursos.length > 0 || dias.length > 0;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="sm" align="center">
          <Title order={3}>Día a día</Title>
          <Badge variant="light" color="gray">
            {periodo}
          </Badge>
        </Group>
        {mostrarUsd && (
          <Badge variant="light" color="teal">
            TC USD ${fmt2(tcUsd)}
          </Badge>
        )}
      </Group>

      {!hayDatos && (
        <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
          Sin datos del día todavía. Corré los bots <Text span fw={500}>kpis-servicios</Text> (utilización) y{' '}
          <Text span fw={500}>kpis-finanzas</Text> (cierre de caja) para el período.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <KpiTile label="Utilización global" value={`${fmt2(utilGlobal)}%`} />
        <KpiTile
          label="Pool Red Light (R-07)"
          value={`${fmt2(poolUtil)}%`}
          color={poolUtil >= ocupacionAlta ? 'orange' : undefined}
          sub="2 tumbonas compartidas"
        />
        <KpiTile label="Saldo acumulado" value={`$${fmt(saldoAcum)}`} color={saldoAcum >= 0 ? 'teal' : 'red'} sub={mostrarUsd ? `US$ ${fmt(saldoAcum / tcUsd)}` : undefined} />
        <KpiTile label="Arqueo efectivo" value={`$${fmt(saldoEfectivo)}`} sub={mostrarUsd ? `US$ ${fmt(saldoEfectivo / tcUsd)}` : undefined} />
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Group justify="space-between" mb="sm">
          <Text fw={500}>Utilización por recurso (mes)</Text>
          <Badge variant="light" color={poolUtil >= ocupacionAlta ? 'orange' : 'gray'} leftSection={<IconAlertTriangle size={12} />}>
            Pool Red Light R-07: {fmt2(poolUtil)}%
          </Badge>
        </Group>
        <Stack gap="xs">
          {recursos.length === 0 ? (
            <Text size="sm" c="dimmed">
              Sin sesiones del período.
            </Text>
          ) : (
            recursos.map((r) => {
              const bottleneck = r.util >= ocupacionAlta;
              return (
                <FilaBarra
                  key={r.label}
                  label={r.label}
                  ancho={Math.min(r.util, 100)}
                  texto={`${fmt(r.sesiones)} ses · ${fmt2(r.util)}%`}
                  color={bottleneck ? 'orange' : 'teal'}
                  badge={
                    bottleneck ? (
                      <Badge color="orange" variant="light" size="sm" leftSection={<IconAlertTriangle size={12} />}>
                        Cuello de botella
                      </Badge>
                    ) : r.comparte ? (
                      <Badge color="gray" variant="light" size="sm">
                        Tumbona compartida
                      </Badge>
                    ) : undefined
                  }
                />
              );
            })
          )}
        </Stack>
        <Text size="xs" c="dimmed" mt="sm">
          R-07: Red Light + Recovery Pro Gab 1/2 comparten 2 tumbonas. El % por recurso es individual;
          el cuello de botella real es el pool.
        </Text>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Text fw={500} mb="sm">
          Cierre de caja diario
        </Text>
        {dias.length === 0 ? (
          <Text size="sm" c="dimmed">
            Sin movimientos del período.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Día</Table.Th>
                  <Table.Th ta="right">Ingresos</Table.Th>
                  <Table.Th ta="right">Egresos</Table.Th>
                  <Table.Th ta="right">Saldo día</Table.Th>
                  <Table.Th ta="right">Acumulado</Table.Th>
                  <Table.Th ta="right">Efectivo</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {dias.map((g, i) => {
                  const ing = popValue(g, 'ingresos');
                  const egr = popValue(g, 'egresos');
                  const saldo = popValue(g, 'saldo');
                  const acum = popValue(g, 'saldo-acum');
                  const efectivo = popValue(g, 'saldo-efectivo');
                  return (
                    <Table.Tr key={`${groupCode(g)}-${i}`}>
                      <Table.Td>{groupLabel(g)}</Table.Td>
                      <Table.Td ta="right">{ing > 0 ? `$${fmt(ing)}` : '—'}</Table.Td>
                      <Table.Td ta="right">{egr > 0 ? `$${fmt(egr)}` : '—'}</Table.Td>
                      <Table.Td ta="right">
                        <Text size="sm" c={saldo < 0 ? 'red' : undefined}>
                          ${fmt(saldo)}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">${fmt(acum)}</Table.Td>
                      <Table.Td ta="right">${fmt(efectivo)}</Table.Td>
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
