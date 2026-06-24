import { Box, Center, Group, Stack, Text, Title } from '@mantine/core';
import { SignInForm } from '@medplum/react';
import { BotonTema } from '../components/BotonTema';

/** Pantalla de login con el formulario de sign-in de Medplum. */
export function SignInPage(): JSX.Element {
  return (
    <Box pos="relative" h="100vh">
      <Group pos="absolute" top={12} right={12}>
        <BotonTema />
      </Group>
      <Center h="100%">
        <SignInForm>
          <Stack gap={2} align="center" mb="sm">
            <Title order={3}>BioWellness</Title>
            <Text c="dimmed" size="sm">
              Administración · ingresá con tu cuenta de Medplum
            </Text>
          </Stack>
        </SignInForm>
      </Center>
    </Box>
  );
}
