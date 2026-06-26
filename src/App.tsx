import { Center, Loader } from '@mantine/core';
import { useMedplum, useMedplumProfile } from '@medplum/react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { CampanasPage } from './pages/CampanasPage';
import { ClinicosPage } from './pages/ClinicosPage';
import { DashboardPage } from './pages/DashboardPage';
import { FinancieroPage } from './pages/FinancieroPage';
import { GestionPage } from './pages/GestionPage';
import { IngresosPage } from './pages/IngresosPage';
import { MembresiasPage } from './pages/MembresiasPage';
import { ParametrosPage } from './pages/ParametrosPage';
import { PipelinePage } from './pages/PipelinePage';
import { ReportesPage } from './pages/ReportesPage';
import { ResumenPage } from './pages/ResumenPage';
import { RetencionPage } from './pages/RetencionPage';
import { SegmentosPage } from './pages/SegmentosPage';
import { ServiciosPage } from './pages/ServiciosPage';
import { SignInPage } from './pages/SignInPage';

export function App(): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (!profile) {
    return <SignInPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<ResumenPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="reportes" element={<ReportesPage />} />
        <Route path="pipeline" element={<PipelinePage />} />
        <Route path="retencion" element={<RetencionPage />} />
        <Route path="segmentos" element={<SegmentosPage />} />
        <Route path="campanas" element={<CampanasPage />} />
        <Route path="servicios" element={<ServiciosPage />} />
        <Route path="membresias" element={<MembresiasPage />} />
        <Route path="ingresos" element={<IngresosPage />} />
        <Route path="financiero" element={<FinancieroPage />} />
        <Route path="clinicos" element={<ClinicosPage />} />
        <Route path="gestion" element={<GestionPage />} />
        <Route path="parametros" element={<ParametrosPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
