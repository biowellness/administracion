import { Table, Text } from '@mantine/core';
import type { FilaMedida } from '../fhir/reportes';
import { fmt } from '../lib/format';

interface Props {
  filas: FilaMedida[];
  /** Mostrar la columna USD (cuando hay TC del período). */
  mostrarUsd: boolean;
  conceptoLabel?: string;
}

/** Tabla de montos: concepto + ARS (+ USD opcional). Reutilizable en Ingresos/Financiero. */
export function TablaMontos({ filas, mostrarUsd, conceptoLabel = 'Concepto' }: Props): JSX.Element {
  if (filas.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        Sin datos del período.
      </Text>
    );
  }
  return (
    <Table.ScrollContainer minWidth={360}>
      <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{conceptoLabel}</Table.Th>
            <Table.Th ta="right">ARS</Table.Th>
            {mostrarUsd && <Table.Th ta="right">USD</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {filas.map((f, i) => (
            <Table.Tr key={`${f.concepto}-${i}`}>
              <Table.Td>{f.concepto}</Table.Td>
              <Table.Td ta="right">${fmt(f.valor)}</Table.Td>
              {mostrarUsd && <Table.Td ta="right">{f.usd != null ? `US$ ${fmt(f.usd)}` : '—'}</Table.Td>}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
