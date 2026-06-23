import { SeccionEnConstruccion } from '../components/SeccionEnConstruccion';

/**
 * Resumen / Embudo: tiles de KPI (leads, activos, conversión, churn, LTV) + embudo,
 * leyendo los MeasureReports `embudo`/`clientes`/`conversion`/`churn`/`ltv-promedio`.
 * Próximo paso: portar `AdminDashboard.tsx`.
 */
export function ResumenPage(): JSX.Element {
  return (
    <SeccionEnConstruccion
      titulo="Resumen"
      descripcion="KPIs del CRM (leads, activos, conversión, churn, LTV) y embudo de conversión. Próximo paso: portar AdminDashboard."
    />
  );
}
