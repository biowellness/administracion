import { useState } from 'react';
import { Badge, Button, Card, Group, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { MEASURE_PROYECCION } from '../fhir/systems';
import { groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { exportarExcel } from '../lib/excel';
import { fmt } from '../lib/format';

interface Metrica {
  key: string;
  label: string;
  unidad: 'ars' | 'pct';
}

const METRICAS: Metrica[] = [
  { key: 'ingresos', label: 'Ingresos', unidad: 'ars' },
  { key: 'ocupacion', label: 'Ocupación', unidad: 'pct' },
  { key: 'margen', label: 'Margen', unidad: 'ars' },
];

function fmtUnidad(v: number, unidad: 'ars' | 'pct'): string {
  return unidad === 'ars' ? `$${fmt(v)}` : `${fmt(v)}%`;
}

function colorCumplimiento(pct: number): string {
  if (pct >= 100) {
    return 'teal';
  }
  return pct >= 80 ? 'orange' : 'red';
}

/**
 * Gestión (6.8 · Fase 4) — proyectado (modelo BIOWELLNESS_PROYECCION_v12) vs. real, por
 * métrica (ingresos, ocupación, margen). Lee el Measure `proyeccion-v12` con grupos
 * `<metrica>-proyectado` y `<metrica>-real`.
 */
export function GestionPage(): JSX.Element {
  const proyeccion = useMeasureReport(MEASURE_PROYECCION);
  const [exportando, setExportando] = useState(false);

  if (proyeccion.loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  const filas = METRICAS.map((m) => {
    const proyectado = groupValue(proyeccion.report, `${m.key}-proyectado`);
    const real = groupValue(proyeccion.report, `${m.key}-real`);
    const cumplimiento = proyectado > 0 ? (real / proyectado) * 100 : 0;
    return { ...m, proyectado, real, cumplimiento };
  });
  const periodo = proyeccion.report?.period?.start?.slice(0, 7) ?? '';
  const hayDatos = filas.some((f) => f.proyectado > 0 || f.real > 0);

  const exportar = async (): Promise<void> => {
    setExportando(true);
    try {
      await exportarExcel(`biowellness-gestion-${new Date().toISOString().slice(0, 10)}.xlsx`, [
        {
          nombre: 'Proyección v12 vs real',
          columnas: [
            { key: 'label', titulo: 'Métrica', ancho: 20 },
            { key: 'proyectado', titulo: 'Proyectado', formato: 'num' },
            { key: 'real', titulo: 'Real', formato: 'num' },
            { key: 'cumplimiento', titulo: 'Cumplimiento %', formato: 'num' },
          ],
          filas: filas.map((f) => ({
            label: f.label,
            proyectado: f.proyectado,
            real: f.real,
            cumplimiento: Math.round(f.cumplimiento),
          })),
        },
      ]);
      notifications.show({ color: 'teal', message: 'Gestión exportada.' });
    } catch {
      notifications.show({ color: 'red', title: 'Error', message: 'No se pudo exportar.' });
    } finally {
      setExportando(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Gestión</Title>
        <Group gap="xs">
          {periodo && (
            <Badge variant="light" color="gray">
              {periodo}
            </Badge>
          )}
          <Button
            variant="light"
            leftSection={<IconFileSpreadsheet size={16} />}
            loading={exportando}
            onClick={() => void exportar()}
          >
            Exportar .xlsx
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="md" padding="lg">
        <Text fw={500} mb="sm">
          Proyectado (modelo v12) vs. real
        </Text>
        {!hayDatos ? (
          <Text size="sm" c="dimmed">
            Sin datos del Measure proyeccion-v12 en el período.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={520}>
            <Table verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Métrica</Table.Th>
                  <Table.Th ta="right">Proyectado</Table.Th>
                  <Table.Th ta="right">Real</Table.Th>
                  <Table.Th ta="right">Cumplimiento</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filas.map((f) => (
                  <Table.Tr key={f.key}>
                    <Table.Td>{f.label}</Table.Td>
                    <Table.Td ta="right">{fmtUnidad(f.proyectado, f.unidad)}</Table.Td>
                    <Table.Td ta="right">{fmtUnidad(f.real, f.unidad)}</Table.Td>
                    <Table.Td ta="right">
                      <Badge variant="light" color={colorCumplimiento(f.cumplimiento)}>
                        {fmt(f.cumplimiento)}%
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Stack>
  );
}
