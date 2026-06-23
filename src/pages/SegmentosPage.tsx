import { SeccionEnConstruccion } from '../components/SeccionEnConstruccion';

/** Segmentos & Campañas: Group con member count y criterios; lanzar y trackear campañas. */
export function SegmentosPage(): JSX.Element {
  return (
    <SeccionEnConstruccion
      titulo="Segmentos"
      descripcion="Group de segmentación con cantidad de miembros y criterios (characteristic)."
    />
  );
}
