import { SeccionEnConstruccion } from '../components/SeccionEnConstruccion';

/** Campañas: lanzar campaña a un Group (executeBot 'enviar-campana') + tracking por Communication. */
export function CampanasPage(): JSX.Element {
  return (
    <SeccionEnConstruccion
      titulo="Campañas"
      descripcion="Lanzamiento de campañas a un segmento (enviar-campana) y tracking de Communication (enviado/abierto/respondido)."
    />
  );
}
