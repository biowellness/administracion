import { useState } from 'react';
import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMedplum } from '@medplum/react';
import type { MedplumClient } from '@medplum/core';
import type { MeasureReport } from '@medplum/fhirtypes';
import { IconFileSpreadsheet } from '@tabler/icons-react';
import { exportarExcel } from '../lib/excel';
import type { HojaReporte } from '../lib/excel';
import { filasDeMedida, useTipoCambio } from '../fhir/reportes';
import { measureCrm, measureFinanzas, measureServicios } from '../fhir/systems';

async function ultimo(medplum: MedplumClient, canonical: string): Promise<MeasureReport | undefined> {
  const r = await medplum.searchResources('MeasureReport', { measure: canonical, _sort: '-date', _count: '1' });
  return r[0];
}

interface DefReporte {
  key: string;
  titulo: string;
  descripcion: string;
  construir: (medplum: MedplumClient, tcUsd: number) => Promise<HojaReporte[]>;
}

const REPORTES: DefReporte[] = [
  {
    key: 'crm',
    titulo: 'CRM / Embudo',
    descripcion: 'Embudo, clientes, conversión y churn del período.',
    construir: async (medplum) => {
      const [embudo, clientes, conversion, churn] = await Promise.all([
        ultimo(medplum, measureCrm('embudo')),
        ultimo(medplum, measureCrm('clientes')),
        ultimo(medplum, measureCrm('conversion')),
        ultimo(medplum, measureCrm('churn')),
      ]);
      return [
        {
          nombre: 'Embudo',
          columnas: [
            { key: 'concepto', titulo: 'Etapa', ancho: 24 },
            { key: 'valor', titulo: 'Cantidad', formato: 'num' },
          ],
          filas: filasDeMedida(embudo),
        },
        {
          nombre: 'Clientes',
          columnas: [
            { key: 'concepto', titulo: 'Tipo', ancho: 24 },
            { key: 'valor', titulo: 'Cantidad', formato: 'num' },
          ],
          filas: filasDeMedida(clientes, { incluirGlobal: true }),
        },
        {
          nombre: 'Conversión y churn',
          columnas: [
            { key: 'concepto', titulo: 'Métrica', ancho: 24 },
            { key: 'valor', titulo: 'Valor', formato: 'num' },
          ],
          filas: [
            ...filasDeMedida(conversion, { incluirGlobal: true }),
            ...filasDeMedida(churn, { incluirGlobal: true }),
          ],
        },
      ];
    },
  },
  {
    key: 'ingresos',
    titulo: 'Ingresos',
    descripcion: 'Ingresos del período por servicio y por médico (ARS y USD).',
    construir: async (medplum, tc) => {
      const [ingresos, porServicio, porMedico] = await Promise.all([
        ultimo(medplum, measureFinanzas('ingresos')),
        ultimo(medplum, measureFinanzas('ingresos-servicio')),
        ultimo(medplum, measureFinanzas('ingresos-medico')),
      ]);
      const colsMonto = [
        { key: 'concepto', titulo: 'Concepto', ancho: 28 },
        { key: 'valor', titulo: 'ARS', formato: 'ars' as const },
        { key: 'usd', titulo: 'USD', formato: 'usd' as const },
      ];
      return [
        { nombre: 'Resumen', columnas: colsMonto, filas: filasDeMedida(ingresos, { tcUsd: tc, incluirGlobal: true }) },
        { nombre: 'Por servicio', columnas: colsMonto, filas: filasDeMedida(porServicio, { tcUsd: tc }) },
        { nombre: 'Por médico', columnas: colsMonto, filas: filasDeMedida(porMedico, { tcUsd: tc }) },
      ];
    },
  },
  {
    key: 'financiero',
    titulo: 'Financiero / LTV',
    descripcion: 'LTV promedio y por segmento (ARS y USD).',
    construir: async (medplum, tc) => {
      const [ltvProm, ltvSeg] = await Promise.all([
        ultimo(medplum, measureCrm('ltv-promedio')),
        ultimo(medplum, measureCrm('ltv-segmento')),
      ]);
      const colsMonto = [
        { key: 'concepto', titulo: 'Concepto', ancho: 28 },
        { key: 'valor', titulo: 'ARS', formato: 'ars' as const },
        { key: 'usd', titulo: 'USD', formato: 'usd' as const },
      ];
      return [
        { nombre: 'LTV por segmento', columnas: colsMonto, filas: filasDeMedida(ltvSeg, { tcUsd: tc }) },
        { nombre: 'LTV promedio', columnas: colsMonto, filas: filasDeMedida(ltvProm, { tcUsd: tc, incluirGlobal: true }) },
      ];
    },
  },
  {
    key: 'servicios',
    titulo: 'Servicios / Utilización',
    descripcion: 'Turnos por servicio, ocupación de agenda y utilización de membresías.',
    construir: async (medplum) => {
      const [turnos, ocup, memb] = await Promise.all([
        ultimo(medplum, measureServicios('servicios-turnos')),
        ultimo(medplum, measureServicios('agenda-ocupacion')),
        ultimo(medplum, measureServicios('membresias-utilizacion')),
      ]);
      return [
        {
          nombre: 'Turnos por servicio',
          columnas: [
            { key: 'concepto', titulo: 'Servicio', ancho: 28 },
            { key: 'valor', titulo: 'Turnos', formato: 'num' },
          ],
          filas: filasDeMedida(turnos),
        },
        {
          nombre: 'Ocupación',
          columnas: [
            { key: 'concepto', titulo: 'Recurso', ancho: 28 },
            { key: 'valor', titulo: 'Ocupación %', formato: 'pct' },
          ],
          filas: filasDeMedida(ocup, { incluirGlobal: true }),
        },
        {
          nombre: 'Membresías',
          columnas: [
            { key: 'concepto', titulo: 'Plan', ancho: 28 },
            { key: 'valor', titulo: 'Utilización %', formato: 'pct' },
          ],
          filas: filasDeMedida(memb, { incluirGlobal: true }),
        },
      ];
    },
  },
];

/**
 * Reportes — exportación `.xlsx` de un clic por familia, siempre con los últimos
 * MeasureReport del período. Montos en ARS y USD (al TC del período).
 */
export function ReportesPage(): JSX.Element {
  const medplum = useMedplum();
  const { tcUsd } = useTipoCambio();
  const [cargando, setCargando] = useState<string | undefined>();

  const exportar = async (def: DefReporte): Promise<void> => {
    setCargando(def.key);
    try {
      const hojas = await def.construir(medplum, tcUsd);
      const fecha = new Date().toISOString().slice(0, 10);
      await exportarExcel(`biowellness-${def.key}-${fecha}.xlsx`, hojas);
      notifications.show({ color: 'teal', message: `Reporte "${def.titulo}" exportado.` });
    } catch {
      notifications.show({ color: 'red', title: 'Error', message: 'No se pudo exportar el reporte.' });
    } finally {
      setCargando(undefined);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>Reportes</Title>
        <Badge variant="light" color={tcUsd > 0 ? 'teal' : 'gray'}>
          {tcUsd > 0 ? `TC USD $${tcUsd}` : 'TC USD sin dato'}
        </Badge>
      </Group>

      {tcUsd === 0 && (
        <Alert color="gray" variant="light">
          Sin tipo de cambio del período: las columnas USD saldrán vacías hasta que el
          Measure <Text span fw={500}>tipo-cambio</Text> tenga dato.
        </Alert>
      )}

      <Stack gap="sm">
        {REPORTES.map((def) => (
          <Card key={def.key} withBorder radius="md" padding="lg">
            <Group justify="space-between" align="center" wrap="nowrap">
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text fw={500}>{def.titulo}</Text>
                <Text size="sm" c="dimmed">
                  {def.descripcion}
                </Text>
              </Stack>
              <Button
                variant="light"
                leftSection={<IconFileSpreadsheet size={16} />}
                loading={cargando === def.key}
                onClick={() => void exportar(def)}
              >
                Exportar .xlsx
              </Button>
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
