import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  Loader,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMedplum } from '@medplum/react';
import {
  IconAlertTriangle,
  IconCurrencyDollar,
  IconDeviceFloppy,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import {
  capacidadMes,
  guardarParametros,
  parametrosDefault,
  periodoActual,
  slotsDia,
  sumaParticipaciones,
  useParametros,
  type ParametrosTablero,
  type Participacion,
  type RecursoCapacidad,
} from '../fhir/parametros';
import { useTipoCambio } from '../fhir/reportes';
import { fmt, fmt2 } from '../lib/format';

/** Opciones de período: los últimos 12 meses en formato `YYYY-MM`. */
function opcionesPeriodo(): { value: string; label: string }[] {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const hoy = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value, label: `${meses[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

/**
 * Parámetros (Anexo D · Punto 8) — superficie única de configuración del tablero, por período.
 * Andrés edita acá: TC (referencia), días/horas, %s de la cascada, gastos, umbrales, capacidad
 * de los 13 recursos y participaciones de los socios. Guardrail: Σ participaciones = 100%.
 */
export function ParametrosPage(): JSX.Element {
  const medplum = useMedplum();
  const [periodo, setPeriodo] = useState<string>(periodoActual());
  const { params: cargados, esDefault, loading } = useParametros(periodo);
  const { tcUsd } = useTipoCambio();

  const [p, setP] = useState<ParametrosTablero>(() => parametrosDefault(periodo));
  const [guardando, setGuardando] = useState(false);

  // Re-sembrar el formulario cuando cambia el período o termina la carga.
  useEffect(() => {
    if (!loading) {
      setP(cargados);
    }
  }, [loading, cargados]);

  const periodos = useMemo(() => opcionesPeriodo(), []);
  const set = <K extends keyof ParametrosTablero>(k: K, v: ParametrosTablero[K]): void =>
    setP((prev) => ({ ...prev, [k]: v }));

  const sumaPart = sumaParticipaciones(p);
  const partOk = Math.round(sumaPart) === 100;

  const setRecurso = (i: number, cambios: Partial<RecursoCapacidad>): void =>
    setP((prev) => ({ ...prev, recursos: prev.recursos.map((r, j) => (j === i ? { ...r, ...cambios } : r)) }));

  const setPart = (i: number, cambios: Partial<Participacion>): void =>
    setP((prev) => ({
      ...prev,
      participaciones: prev.participaciones.map((x, j) => (j === i ? { ...x, ...cambios } : x)),
    }));

  const agregarPart = (): void =>
    setP((prev) => ({ ...prev, participaciones: [...prev.participaciones, { nombre: '', pct: 0 }] }));

  const quitarPart = (i: number): void =>
    setP((prev) => ({ ...prev, participaciones: prev.participaciones.filter((_, j) => j !== i) }));

  const guardar = async (): Promise<void> => {
    if (!partOk) {
      notifications.show({
        color: 'red',
        title: 'No se puede guardar',
        message: `Las participaciones suman ${fmt2(sumaPart)}% (deben sumar 100%).`,
      });
      return;
    }
    setGuardando(true);
    try {
      await guardarParametros(medplum, { ...p, periodo });
      notifications.show({ color: 'teal', message: `Parámetros de ${periodo} guardados.` });
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Error al guardar',
        message: e instanceof Error ? e.message : 'No se pudo guardar.',
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Group gap="sm" align="center">
          <Title order={3}>Parámetros</Title>
          <Badge variant="light" color={esDefault ? 'orange' : 'teal'}>
            {esDefault ? 'Sin guardar (defaults)' : 'Guardado'}
          </Badge>
        </Group>
        <Group gap="xs">
          <Select
            data={periodos}
            value={periodo}
            onChange={(v) => v && setPeriodo(v)}
            allowDeselect={false}
            w={150}
            aria-label="Período"
          />
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            loading={guardando}
            disabled={loading}
            onClick={() => void guardar()}
          >
            Guardar
          </Button>
        </Group>
      </Group>

      {loading ? (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      ) : (
        <>
          <Text size="sm" c="dimmed">
            Fuente única de configuración del tablero para el período. La app, los bots y el reporte
            Excel leen estos valores. Versionado por mes: el P&amp;L histórico recalcula con lo vigente.
          </Text>

          {/* Operación y caja */}
          <Card withBorder radius="md" padding="lg">
            <Text fw={500} mb="md">
              Operación y caja
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              <NumberInput
                label="Días operativos / mes"
                value={p.diasOperativos}
                onChange={(v) => set('diasOperativos', Number(v) || 0)}
                min={0}
                max={31}
              />
              <NumberInput
                label="Horas operativas / día"
                value={p.horasOperativas}
                onChange={(v) => set('horasOperativas', Number(v) || 0)}
                min={0}
                max={24}
              />
              <TextInput
                label="TC ARS/USD (referencia)"
                description="Lo define el Measure tipo-cambio"
                value={tcUsd > 0 ? `$ ${fmt2(tcUsd)}` : '—'}
                readOnly
                leftSection={<IconCurrencyDollar size={16} />}
              />
              <NumberInput
                label="Saldo inicial caja chica (ARS)"
                value={p.saldoInicialCajaChica}
                onChange={(v) => set('saldoInicialCajaChica', Number(v) || 0)}
                thousandSeparator="."
                decimalSeparator=","
                min={0}
              />
              <NumberInput
                label="Saldo inicial efectivo (ARS)"
                value={p.saldoInicialEfectivo}
                onChange={(v) => set('saldoInicialEfectivo', Number(v) || 0)}
                thousandSeparator="."
                decimalSeparator=","
                min={0}
              />
            </SimpleGrid>
          </Card>

          {/* Cascada de honorarios */}
          <Card withBorder radius="md" padding="lg">
            <Text fw={500} mb={4}>
              Cascada de honorarios y deducciones
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              IV + Terapias Biológicas: de lo cobrado se descuenta Regenerar + la deducción fiscal; del
              neto van honorarios a médicos y el resto a BioWellness. Consultas (solo médicas): se
              descuenta la deducción fiscal y se reparte médicos / BioWellness.
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
              <NumberInput
                label="Deducción fiscal (%)"
                description="Impuestos + facturación + procesador"
                value={p.deduccion25Pct}
                onChange={(v) => set('deduccion25Pct', Number(v) || 0)}
                min={0}
                max={100}
                suffix="%"
              />
              <NumberInput
                label="Insumo Regenerar (% IV+TB)"
                value={p.regenerarPct}
                onChange={(v) => set('regenerarPct', Number(v) || 0)}
                min={0}
                max={100}
                suffix="%"
              />
              <NumberInput
                label="Honorarios médicos IV+TB (%)"
                description={`BioWellness: ${fmt(100 - p.honorariosIvtbPct)}%`}
                value={p.honorariosIvtbPct}
                onChange={(v) => set('honorariosIvtbPct', Number(v) || 0)}
                min={0}
                max={100}
                suffix="%"
              />
              <NumberInput
                label="Honorarios médicos Consultas (%)"
                description={`BioWellness: ${fmt(100 - p.consultasMedicosPct)}%`}
                value={p.consultasMedicosPct}
                onChange={(v) => set('consultasMedicosPct', Number(v) || 0)}
                min={0}
                max={100}
                suffix="%"
              />
            </SimpleGrid>
          </Card>

          {/* Gastos / nómina y umbrales */}
          <Card withBorder radius="md" padding="lg">
            <Text fw={500} mb="md">
              Gastos, nómina y umbrales
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
              <NumberInput
                label="Cargas sociales (%)"
                value={p.cargasSocialesPct}
                onChange={(v) => set('cargasSocialesPct', Number(v) || 0)}
                min={0}
                max={100}
                suffix="%"
              />
              <NumberInput
                label="Honorario Dr. Conrado (ARS)"
                value={p.honorarioConrado}
                onChange={(v) => set('honorarioConrado', Number(v) || 0)}
                thousandSeparator="."
                decimalSeparator=","
                min={0}
              />
              <NumberInput
                label="Margen objetivo (%)"
                value={p.margenObjetivoPct}
                onChange={(v) => set('margenObjetivoPct', Number(v) || 0)}
                min={0}
                max={100}
                suffix="%"
              />
              <NumberInput
                label="Ocupación alta (%)"
                value={p.ocupacionAltaPct}
                onChange={(v) => set('ocupacionAltaPct', Number(v) || 0)}
                min={0}
                max={100}
                suffix="%"
              />
            </SimpleGrid>
          </Card>

          {/* Capacidad de los 13 recursos */}
          <Card withBorder radius="md" padding="lg">
            <Text fw={500} mb={4}>
              Capacidad por recurso
            </Text>
            <Text size="xs" c="dimmed" mb="md">
              Slots/día = (horas × 60) ÷ duración. Los recursos marcados con tumbona compartida (Red
              Light + Recovery Pro) forman un pool de capacidad (regla R-07).
            </Text>
            <Table.ScrollContainer minWidth={560}>
              <Table verticalSpacing="xs" horizontalSpacing="md" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Recurso</Table.Th>
                    <Table.Th ta="right">Duración (min)</Table.Th>
                    <Table.Th ta="right">Slots/día</Table.Th>
                    <Table.Th ta="right">Capacidad/mes</Table.Th>
                    <Table.Th ta="center">Tumbona (R-07)</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {p.recursos.map((r, i) => (
                    <Table.Tr key={r.codigo}>
                      <Table.Td>{r.nombre}</Table.Td>
                      <Table.Td ta="right">
                        <NumberInput
                          value={r.duracionMin}
                          onChange={(v) => setRecurso(i, { duracionMin: Number(v) || 0 })}
                          min={1}
                          max={240}
                          w={90}
                          ml="auto"
                          size="xs"
                        />
                      </Table.Td>
                      <Table.Td ta="right">{fmt(slotsDia(r, p))}</Table.Td>
                      <Table.Td ta="right">{fmt(capacidadMes(r, p))}</Table.Td>
                      <Table.Td ta="center">
                        <Checkbox
                          checked={r.comparteTumbona}
                          onChange={(e) => setRecurso(i, { comparteTumbona: e.currentTarget.checked })}
                          aria-label={`${r.nombre} comparte tumbona`}
                        />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Card>

          {/* Participaciones */}
          <Card withBorder radius="md" padding="lg">
            <Group justify="space-between" align="center" mb="md">
              <Text fw={500}>Participaciones de socios</Text>
              <Badge size="lg" variant="light" color={partOk ? 'teal' : 'red'}>
                Σ {fmt2(sumaPart)}%
              </Badge>
            </Group>
            {!partOk && (
              <Alert color="red" icon={<IconAlertTriangle size={16} />} mb="md">
                Las participaciones deben sumar 100% para poder guardar (hoy: {fmt2(sumaPart)}%).
              </Alert>
            )}
            <Table verticalSpacing="xs" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Socio</Table.Th>
                  <Table.Th ta="right">Participación</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {p.participaciones.map((x, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>
                      <TextInput
                        value={x.nombre}
                        onChange={(e) => setPart(i, { nombre: e.currentTarget.value })}
                        placeholder="Nombre y apellido"
                        size="xs"
                      />
                    </Table.Td>
                    <Table.Td ta="right">
                      <NumberInput
                        value={x.pct}
                        onChange={(v) => setPart(i, { pct: Number(v) || 0 })}
                        min={0}
                        max={100}
                        suffix="%"
                        w={110}
                        ml="auto"
                        size="xs"
                      />
                    </Table.Td>
                    <Table.Td>
                      <Tooltip label="Quitar">
                        <ActionIcon variant="subtle" color="red" onClick={() => quitarPart(i)} aria-label="Quitar socio">
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Group mt="sm">
              <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={agregarPart}>
                Agregar socio
              </Button>
            </Group>
          </Card>
        </>
      )}
    </Stack>
  );
}
