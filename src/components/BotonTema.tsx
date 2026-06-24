import { ActionIcon, Tooltip, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

/** Botón para alternar entre modo claro y oscuro (persiste en localStorage). */
export function BotonTema(): JSX.Element {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light', { getInitialValueInEffect: true });
  const oscuro = computed === 'dark';

  return (
    <Tooltip label={oscuro ? 'Modo claro' : 'Modo oscuro'}>
      <ActionIcon
        variant="subtle"
        color="gray"
        size="lg"
        aria-label="Cambiar tema"
        onClick={() => setColorScheme(oscuro ? 'light' : 'dark')}
      >
        {oscuro ? <IconSun size={20} /> : <IconMoon size={20} />}
      </ActionIcon>
    </Tooltip>
  );
}
