import { useState } from 'react';
import { Alert, Button, Group, Modal, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMedplum } from '@medplum/react';
import { IconSend } from '@tabler/icons-react';
import { CANAL_LABEL, CANALES, lanzarCampana } from '../fhir/campanas';
import type { Canal } from '../fhir/campanas';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Título del modal, p. ej. 'Lanzar campaña'. */
  titulo: string;
  /** Texto descriptivo del destino, p. ej. 'Segmento «VIP» · 42 miembros'. */
  resumenDestino: string;
  /** Resuelve el id del Group destino (existente o ad-hoc); se llama al confirmar el envío. */
  resolverGroupId: () => Promise<string>;
  asuntoInicial?: string;
  cuerpoInicial?: string;
  /** Se llama tras un envío exitoso (p. ej. para refrescar o limpiar selección). */
  onEnviada?: (campaniaId: string) => void;
}

/**
 * Modal de redacción y envío de campaña. Recolecta canal/asunto/cuerpo, pide
 * confirmación explícita (envía comunicaciones reales) y dispara `enviar-campana`.
 */
export function LanzarCampanaModal({
  opened,
  onClose,
  titulo,
  resumenDestino,
  resolverGroupId,
  asuntoInicial = '',
  cuerpoInicial = '',
  onEnviada,
}: Props): JSX.Element {
  const medplum = useMedplum();
  const [canal, setCanal] = useState<Canal>('email');
  const [asunto, setAsunto] = useState(asuntoInicial);
  const [cuerpo, setCuerpo] = useState(cuerpoInicial);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const valido = asunto.trim().length > 0 && cuerpo.trim().length > 0;

  const cerrar = (): void => {
    if (enviando) {
      return;
    }
    setConfirmando(false);
    onClose();
  };

  const enviar = async (): Promise<void> => {
    setEnviando(true);
    try {
      const groupId = await resolverGroupId();
      const { campaniaId } = await lanzarCampana(medplum, { groupId, canal, asunto, cuerpo });
      notifications.show({ color: 'teal', title: 'Campaña lanzada', message: `Enviada por ${CANAL_LABEL[canal]}.` });
      onEnviada?.(campaniaId);
      setConfirmando(false);
      onClose();
    } catch {
      notifications.show({ color: 'red', title: 'Error', message: 'No se pudo lanzar la campaña.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal opened={opened} onClose={cerrar} title={titulo} centered>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {resumenDestino}
        </Text>

        <Select
          label="Canal"
          value={canal}
          onChange={(v) => setCanal((v as Canal) ?? 'email')}
          data={CANALES.map((c) => ({ value: c, label: CANAL_LABEL[c] }))}
          allowDeselect={false}
          disabled={enviando}
        />
        <TextInput
          label="Asunto"
          value={asunto}
          onChange={(e) => setAsunto(e.currentTarget.value)}
          required
          disabled={enviando}
        />
        <Textarea
          label="Mensaje"
          value={cuerpo}
          onChange={(e) => setCuerpo(e.currentTarget.value)}
          autosize
          minRows={4}
          required
          disabled={enviando}
        />

        {confirmando && (
          <Alert color="orange" variant="light" title="Confirmar envío">
            Vas a enviar comunicaciones reales por {CANAL_LABEL[canal]} a {resumenDestino}. Esta acción no se puede deshacer.
          </Alert>
        )}

        <Group justify="flex-end" gap="sm" mt="xs">
          <Button variant="default" onClick={cerrar} disabled={enviando}>
            Cancelar
          </Button>
          {confirmando ? (
            <Button color="teal" leftSection={<IconSend size={16} />} loading={enviando} onClick={() => void enviar()}>
              Confirmar envío
            </Button>
          ) : (
            <Button disabled={!valido} onClick={() => setConfirmando(true)}>
              Revisar y enviar
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
