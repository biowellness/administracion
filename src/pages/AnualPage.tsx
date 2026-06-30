import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle, IconTable } from '@tabler/icons-react';
import modeloAnualUrl from '../assets/tablero-anual-modelo.xlsx?url';
import { FilaBarra } from '../components/FilaBarra';
import { KpiTile } from '../components/KpiTile';
import { consolidarAnio, useCierresAnio } from '../fhir/cierres';
import { useParametros } from '../fhir/parametros';
import { useTipoCambio } from '../fhir/reportes';
import { descargarBlob } from '../lib/templateVivo';
import { rellenarTableroAnual } from '../lib/templateAnual';
import { fmt, fmt2 } from '../lib/format';

function aniosOpciones(): { value: string; label: string }[] {
  const y = new Date().getFullYear();
  return [0, 1, 2].map((d) => ({ value: String(y - d), label: String(y - d) }));
}

/**
 * Anual — consolidado del año (Anexo D · Fase 4): los 12 meses cerrados, evolución,
 * mejor mes, mix de ingresos y distribución por socio del año. Lee los snapshots
 * `cierre-mes` y replica el modelo `tablero-anual`; exporta la planilla anual de un clic.
 */
export function AnualPage(): JSX.Element {
  const [anio, setAnio] = useState<string>(String(new Date().getFullYear()));
  const { cierres, loading } = useCierresAnio(anio);
  const { params } = useParametros(`${anio}-12`);
  const { tcUsd } = useTipoCambio();
  const [generando, setGenerando] = useState(false);

  const anios = useMemo(() => aniosOpciones(), []);
  const con = useMemo(() => consolidarAnio(anio, cierres, params.participaciones), [anio, cierres, params.participaciones]);

  const mostrarUsd = tcUsd > 0;
  const usd = (ars: number): string | undefined => (mostrarUsd ? `US$ ${fmt(ars / tcUsd)}` : undefined);
  const mixTotal = con.mixAnual.reduce((s, x) => s + x.monto, 0) || con.ingresosAnio;

  const generar = async (): Promise<void> => {
    setGenerando(true);
    try {
      const modelo = await fetch(modeloAnualUrl).then((r) => r.arrayBuffer());
      const blob = await rellenarTableroAnual(modelo, cierres, params.participaciones);
      descargarBlob(blob, `biowellness-tablero-anual-${anio}.xlsx`);
      notifications.show({ color: 'teal', message: 'Planilla anual generada.' });
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Error',
        message: e instanceof Error ? e.message : 'No se pudo generar la planilla.',
      });
    } finally {
      setGenerando(false);
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
          <Title order={3}>Consolidado anual</Title>
          <Badge variant="light" color="gray">
            {con.mesesCerrados}/12 meses cerrados
          </Badge>
        </Group>
        <Group gap="xs">
          <Select data={anios} value={anio} onChange={(v) => v && setAnio(v)} allowDeselect={false} w={110} aria-label="Año" />
          <Button leftSection={<IconTable size={16} />} loading={generando} disabled={con.mesesCerrados === 0} onClick={() => void generar()}>
            Generar planilla anual
          </Button>
        </Group>
      </Group>

      {con.mesesCerrados === 0 && (
        <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />}>
          Todavía no hay meses cerrados en {anio}. Cerrá un mes desde <Text span fw={500}>Estado de Resultados</Text>{' '}
          (botón "Cerrar mes") para que aparezca acá.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <KpiTile label="Ingresos del año" value={`$${fmt(con.ingresosAnio)}`} color="teal" sub={usd(con.ingresosAnio)} />
        <KpiTile label="Resultado del año" value={`$${fmt(con.resultadoAnio)}`} color={con.resultadoAnio >= 0 ? 'teal' : 'red'} sub={usd(con.resultadoAnio)} />
        <KpiTile label="Margen anual" value={`${fmt2(con.margenAnio * 100)}%`} color={con.margenAnio < 0 ? 'red' : con.margenAnio < params.margenObjetivoPct / 100 ? 'orange' : 'teal'} />
        <KpiTile label="Mejor mes" value={con.mejorMes ? con.mejorMes.label : '—'} sub={con.mejorMes ? `$${fmt(con.mejorMes.resultado)}` : undefined} />
      </SimpleGrid>

      <Card withBorder radius="md" padding="lg">
        <Text fw={500} mb="sm">
          Evolución mensual
        </Text>
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Mes</Table.Th>
                <Table.Th ta="right">Ingresos</Table.Th>
                <Table.Th ta="right">EBITDA</Table.Th>
                <Table.Th ta="right">Resultado</Table.Th>
                <Table.Th ta="right">Margen</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {con.meses.map((m) => {
                const esMejor = con.mejorMes?.mes === m.mes && m.cierre;
                return (
                  <Table.Tr key={m.mes} bg={esMejor ? 'var(--mantine-color-teal-light)' : undefined}>
                    <Table.Td>
                      <Group gap="xs">
                        <Text size="sm" fw={m.cierre ? 500 : undefined} c={m.cierre ? undefined : 'dimmed'}>
                          {m.label}
                        </Text>
                        {esMejor && (
                          <Badge size="xs" variant="light" color="teal">
                            mejor
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td ta="right">{m.cierre ? `$${fmt(m.ingresos)}` : '—'}</Table.Td>
                    <Table.Td ta="right">{m.cierre ? `$${fmt(m.ebitda)}` : '—'}</Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" c={m.cierre ? (m.resultado >= 0 ? undefined : 'red') : 'dimmed'}>
                        {m.cierre ? `$${fmt(m.resultado)}` : '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">{m.cierre ? `${fmt2(m.margen * 100)}%` : '—'}</Table.Td>
                  </Table.Tr>
                );
              })}
              <Table.Tr>
                <Table.Td fw={700}>Total / Prom.</Table.Td>
                <Table.Td ta="right" fw={700}>
                  ${fmt(con.ingresosAnio)}
                </Table.Td>
                <Table.Td ta="right" fw={700}>
                  ${fmt(con.ebitdaAnio)}
                </Table.Td>
                <Table.Td ta="right" fw={700}>
                  ${fmt(con.resultadoAnio)}
                </Table.Td>
                <Table.Td ta="right" fw={700}>
                  {fmt2(con.margenAnio * 100)}%
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb="sm">
            Mix de ingresos del año
          </Text>
          <Stack gap="xs">
            {con.mixAnual.length === 0 ? (
              <Text size="sm" c="dimmed">
                Sin datos del año.
              </Text>
            ) : (
              con.mixAnual.map((l) => (
                <FilaBarra
                  key={l.codigo}
                  label={l.label}
                  ancho={mixTotal > 0 ? (l.monto / mixTotal) * 100 : 0}
                  texto={`$${fmt(l.monto)} · ${fmt2(mixTotal > 0 ? (l.monto / mixTotal) * 100 : 0)}%`}
                  color="teal"
                />
              ))
            )}
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb={4}>
            Distribución por socio (año)
          </Text>
          <Text size="xs" c="dimmed" mb="sm">
            Participación × resultado total del año. Σ = 100%.
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
              {con.distribucion.map((s) => (
                <Table.Tr key={s.nombre}>
                  <Table.Td>{s.nombre}</Table.Td>
                  <Table.Td ta="right">{fmt(s.pct)}%</Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm" c={s.monto >= 0 ? undefined : 'red'}>
                      ${fmt(s.monto)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
