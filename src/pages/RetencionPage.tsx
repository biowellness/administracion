import { SeccionEnConstruccion } from '../components/SeccionEnConstruccion';

/** Retención: Flags `churn-risk` por nivel + Tasks de recuperación. */
export function RetencionPage(): JSX.Element {
  return (
    <SeccionEnConstruccion
      titulo="Retención"
      descripcion="Riesgo de churn (Flag churn-risk por nivel) y Tasks de recuperación, con acción para iniciar recuperación."
    />
  );
}
