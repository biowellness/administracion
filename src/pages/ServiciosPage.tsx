import { SeccionEnConstruccion } from '../components/SeccionEnConstruccion';

/**
 * Servicios: ocupación de agenda por recurso + turnos por servicio + utilización de
 * membresías, leyendo los MeasureReports de `kpis-servicios`. Marca el cuello de botella
 * (tumbonas Red Light).
 */
export function ServiciosPage(): JSX.Element {
  return (
    <SeccionEnConstruccion
      titulo="Servicios"
      descripcion="Ocupación de agenda, turnos por servicio y utilización de membresías (kpis-servicios), marcando el cuello de botella de las tumbonas Red Light."
    />
  );
}
