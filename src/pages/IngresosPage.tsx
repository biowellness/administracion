import { useState } from 'react';
import { Alert, Badge, Button, Card, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { KpiTile } from '../components/KpiTile';
import { TablaMontos } from '../components/TablaMontos';
import { filasDeMedida, hojasIngresos, useTipoCambio } from '../fhir/reportes';
import { measureFinanzas } from '../fhir/systems';
import { groupValue, useMeasureReport } from '../hooks/useMeasureReport';
import { exportarExcel } from '../lib/excel';
import { fmt } from '../lib/format';

/**
 * Ingresos (6.8 · Fase 2) — ingresos del día y del mes, comparativo vs. mes anterior,
 * desglose por tipo de cobro / servicio / médico (liquidación de splits) y el detalle
 * IV+TB con el 85/15 y deducciones. Todo desde MeasureReports de kpis-finanzas; montos
 * en ARS y USD (al TC del período). Exportable a .xlsx con un clic.
 */
export function IngresosPage(): JSX.Element {
  const ingresos = useMeasureReport(measureFinanzas('ingresos'));
  const cobro = useMeasureReport(measureFinanzas('ingresos-cobro'));
  const servicio = useMeasureReport(measureFinanzas('ingresos-servicio'));
  const medico = useMeasureReport(measureFinanzas('ingresos-medico'));
  const ivtb = useMeasureReport(measureFinanzas('ingresos-iv-tb'));
  const margen = useMeasureReport(measureFinanzas('margen'));
  const { tcUsd } = useTipoCambio();
  const [exportando, setExportando] = useState(false);

  const loading =
    ingresos.loading || cobro.loading || servicio.loading || medico.loading || ivtb.loading || margen.loading;

  if (loading) {
    return (
      <Group justify="center" p="xl">
        <Loader />
      </Group>
    );
  }

  const dia = groupValue(ingresos.report, 'dia');
  const mes = groupValue(ingresos.report, 'mes');
  const mesAnterior = groupValue(ingresos.report, 'mes-anterior');
  const margenEstimado = groupValue(margen.report, 'estimado');
  const delta = mes - mesAnterior;
  const deltaPct = mesAnterior > 0 ? (delta / mesAnterior) * 100 : 0;
  const periodo = ingresos.report?.period?.start?.slice(0, 7) ?? '';
  const mostrarUsd = tcUsd > 0;
  const usd = (ars: number): string | undefined => (mostrarUsd ? `US$ ${fmt(ars / tcUsd)}` : undefined);

  const exportar = async (): Promise<void> => {
    setExportando(true);
    try {
      const hojas = hojasIngresos(
        {
          ingresos: ingresos.report,
          cobro: cobro.report,
          servicio: servicio.report,
          medico: medico.report,
          ivtb: ivtb.report,
        },
        tcUsd
      );
      await exportarExcel(`biowellness-ingresos-${new Date().toISOString().slice(0, 10)}.xlsx`, hojas);
      notifications.show({ color: 'teal', message: 'Ingresos exportados.' });
    } catch {
      notifications.show({ color: 'red', title: 'Error', message: 'No se pudo exportar.' });
    } finally {
      setExportando(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Ingresos</Title>
        <Group gap="xs">
          <Badge variant="light" color={mostrarUsd ? 'teal' : 'gray'}>
            {mostrarUsd ? `TC USD $${tcUsd}` : 'TC USD sin dato'}
          </Badge>
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

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <KpiTile label="Ingresos del mes" value={`$${fmt(mes)}`} sub={usd(mes)} color="teal" />
        <KpiTile label="Ingresos del día" value={`$${fmt(dia)}`} sub={usd(dia)} />
        <KpiTile
          label="vs. mes anterior"
          value={`${delta >= 0 ? '+' : ''}${fmt(deltaPct)}%`}
          color={delta >= 0 ? 'teal' : 'red'}
          sub={`Mes ant.: $${fmt(mesAnterior)}`}
        />
        <KpiTile label="Margen estimado" value={`$${fmt(margenEstimado)}`} sub={usd(margenEstimado)} />
      </SimpleGrid>

      {!mostrarUsd && (
        <Alert color="gray" variant="light">
          Sin tipo de cambio del período (Measure <Text span fw={500}>tipo-cambio</Text>): los montos se
          muestran solo en ARS.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb="sm">
            Por tipo de cobro
          </Text>
          <TablaMontos filas={filasDeMedida(cobro.report, { tcUsd })} mostrarUsd={mostrarUsd} conceptoLabel="Tipo de cobro" />
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb="sm">
            Por servicio
          </Text>
          <TablaMontos filas={filasDeMedida(servicio.report, { tcUsd })} mostrarUsd={mostrarUsd} conceptoLabel="Servicio" />
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Text fw={500} mb="sm">
            Por médico / terapeuta (liquidación)
          </Text>
          <TablaMontos filas={filasDeMedida(medico.report, { tcUsd })} mostrarUsd={mostrarUsd} conceptoLabel="Profesional" />
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Group justify="space-between" mb="sm">
            <Text fw={500}>IV + TB (85/15 con deducciones)</Text>
          </Group>
          <TablaMontos filas={filasDeMedida(ivtb.report, { tcUsd, incluirGlobal: true })} mostrarUsd={mostrarUsd} conceptoLabel="Concepto" />
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
