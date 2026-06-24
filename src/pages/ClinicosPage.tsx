import { useState } from 'react';
import { Alert, Badge, Button, Card, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { KpiTile } from '../components/KpiTile';
import { filasDeMedida } from '../fhir/reportes';
import { measureClinico } from '../fhir/systems';
import { groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { exportarExcel } from '../lib/excel';
import { fmt } from '../lib/format';

/**
 * Clínicos (6.8 · Fase 4) — SOLO señales agregadas (sin exponer valores de Observation,
 * respeta la AccessPolicy): pacientes sin visita 30/60/90 días, miembros con baja
 * utilización y consentimientos a vencer. Desde MeasureReports de kpis-clinico.
 */
export function ClinicosPage(): JSX.Element {
  const sinVisita = useMeasureReport(measureClinico('sin-visita'));
  const bajaUtil = useMeasureReport(measureClinico('baja-utilizacion'));
  const consentimientos = useMeasureReport(measureClinico('consentimientos'));
  const [exportando, setExportando] = useState(false);

  const loading = sinVisita.loading || bajaUtil.loading || consentimientos.loading;

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  const sv30 = groupValue(sinVisita.report, '30');
  const sv60 = groupValue(sinVisita.report, '60');
  const sv90 = groupValue(sinVisita.report, '90');
  const baja = groupValue(bajaUtil.report, 'miembros');
  const co30 = groupValue(consentimientos.report, '30');
  const co60 = groupValue(consentimientos.report, '60');
  const co90 = groupValue(consentimientos.report, '90');
  const periodo = sinVisita.report?.period?.start?.slice(0, 7) ?? '';

  const exportar = async (): Promise<void> => {
    setExportando(true);
    try {
      const colsCount = [
        { key: 'concepto', titulo: 'Tramo', ancho: 20 },
        { key: 'valor', titulo: 'Cantidad', formato: 'num' as const },
      ];
      await exportarExcel(`biowellness-clinicos-${new Date().toISOString().slice(0, 10)}.xlsx`, [
        { nombre: 'Sin visita', columnas: colsCount, filas: filasDeMedida(sinVisita.report, { incluirGlobal: true }) },
        { nombre: 'Baja utilización', columnas: colsCount, filas: filasDeMedida(bajaUtil.report, { incluirGlobal: true }) },
        { nombre: 'Consentimientos', columnas: colsCount, filas: filasDeMedida(consentimientos.report, { incluirGlobal: true }) },
      ]);
      notifications.show({ color: 'teal', message: 'Clínicos exportados.' });
    } catch {
      notifications.show({ color: 'red', title: 'Error', message: 'No se pudo exportar.' });
    } finally {
      setExportando(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Clínicos</Title>
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

      <Alert color="gray" variant="light">
        Señales agregadas, sin datos clínicos individuales (Ley 26.529 / 25.326). El detalle
        clínico queda reservado al equipo médico.
      </Alert>

      <Card withBorder radius="md" padding="lg">
        <Text fw={500} mb="sm">
          Pacientes sin visita
        </Text>
        <SimpleGrid cols={{ base: 3 }} spacing="sm">
          <KpiTile label="≥ 30 días" value={fmt(sv30)} />
          <KpiTile label="≥ 60 días" value={fmt(sv60)} color={sv60 > 0 ? 'orange' : undefined} />
          <KpiTile label="≥ 90 días" value={fmt(sv90)} color={sv90 > 0 ? 'red' : undefined} />
        </SimpleGrid>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb="sm">
            Baja utilización
          </Text>
          <KpiTile label="Miembros con baja utilización" value={fmt(baja)} color={baja > 0 ? 'orange' : undefined} />
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb="sm">
            Consentimientos a vencer
          </Text>
          <SimpleGrid cols={{ base: 3 }} spacing="sm">
            <KpiTile label="≤ 30 días" value={fmt(co30)} color={co30 > 0 ? 'red' : undefined} />
            <KpiTile label="≤ 60 días" value={fmt(co60)} color={co60 > 0 ? 'orange' : undefined} />
            <KpiTile label="≤ 90 días" value={fmt(co90)} />
          </SimpleGrid>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
