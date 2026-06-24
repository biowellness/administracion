import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import type { TablerIcon } from '@tabler/icons-react';
import {
  IconCalendarStats,
  IconCash,
  IconChartBar,
  IconFileSpreadsheet,
  IconHeartHandshake,
  IconId,
  IconLayoutDashboard,
  IconLayoutKanban,
  IconLogout,
  IconReportMoney,
  IconSpeakerphone,
  IconUserCircle,
  IconUsersGroup,
} from '@tabler/icons-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { BotonTema } from './BotonTema';

interface NavItem {
  label: string;
  to: string;
  icon: TablerIcon;
}

const NAV: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: IconLayoutDashboard },
  { label: 'Resumen', to: '/', icon: IconChartBar },
  { label: 'Pipeline', to: '/pipeline', icon: IconLayoutKanban },
  { label: 'Retención', to: '/retencion', icon: IconHeartHandshake },
  { label: 'Segmentos', to: '/segmentos', icon: IconUsersGroup },
  { label: 'Campañas', to: '/campanas', icon: IconSpeakerphone },
  { label: 'Servicios', to: '/servicios', icon: IconCalendarStats },
  { label: 'Membresías', to: '/membresias', icon: IconId },
  { label: 'Ingresos', to: '/ingresos', icon: IconCash },
  { label: 'Financiero', to: '/financiero', icon: IconReportMoney },
  { label: 'Reportes', to: '/reportes', icon: IconFileSpreadsheet },
];

function esActiva(pathname: string, to: string): boolean {
  return to === '/' ? pathname === '/' : pathname.startsWith(to);
}

function nombrePerfil(profile: ReturnType<typeof useMedplumProfile>): string {
  const name = profile && 'name' in profile ? profile.name?.[0] : undefined;
  if (name) {
    return [name.given?.join(' '), name.family].filter(Boolean).join(' ') || 'Mi cuenta';
  }
  return 'Mi cuenta';
}

/** Shell con navegación lateral; renderiza la sección activa en el `Outlet`. */
export function AdminLayout(): JSX.Element {
  const [opened, { toggle, close }] = useDisclosure();
  const location = useLocation();
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4} c="teal">
              BioWellness
            </Title>
            <Text c="dimmed" size="sm" visibleFrom="sm">
              Administración
            </Text>
          </Group>

          <Group gap="xs" wrap="nowrap">
            <BotonTema />
            <Menu shadow="md" width={220} position="bottom-end">
              <Menu.Target>
                <Tooltip label="Cuenta">
                  <ActionIcon variant="subtle" color="gray" size="lg" aria-label="Cuenta">
                    <IconUserCircle size={22} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{nombrePerfil(profile)}</Menu.Label>
                <Menu.Item
                  leftSection={<IconLogout size={16} />}
                  onClick={() => medplum.signOut().catch(() => undefined)}
                >
                  Cerrar sesión
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <ScrollArea>
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                component={Link}
                to={item.to}
                label={item.label}
                leftSection={<Icon size={18} stroke={1.5} />}
                active={esActiva(location.pathname, item.to)}
                onClick={close}
              />
            );
          })}
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
