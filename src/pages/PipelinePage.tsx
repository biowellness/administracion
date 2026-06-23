import { SeccionEnConstruccion } from '../components/SeccionEnConstruccion';

/** Pipeline kanban: columnas por `Task.businessStatus`; arrastrar para avanzar etapa. */
export function PipelinePage(): JSX.Element {
  return (
    <SeccionEnConstruccion
      titulo="Pipeline"
      descripcion="Kanban del pipeline comercial por etapa (Task.businessStatus), con paciente, fuente, responsable y próxima acción."
    />
  );
}
