#!/usr/bin/env bash
#
# Borra los datos de demo sembrados por infra/seed-demo-bundle.json.
# Identifica los recursos por su meta.tag (demo|seed-48h), busca por tipo y los
# elimina por id, en orden de dependencias (primero los que referencian).
#
# Requiere: curl y jq. Variables:
#   MEDPLUM_BASE_URL  (default https://api.medplum.com.ar/)
#   MEDPLUM_TOKEN     token de admin del proyecto (obligatorio)
#
# Uso:  MEDPLUM_TOKEN=xxxxx bash infra/cleanup-demo.sh
#
set -euo pipefail

BASE="${MEDPLUM_BASE_URL:-https://api.medplum.com.ar/}"
BASE="${BASE%/}"
TOKEN="${MEDPLUM_TOKEN:?Definí MEDPLUM_TOKEN con un token de admin}"
TAG="https://bio.medplum.com.ar/fhir/CodeSystem/demo|seed-48h"

# Orden: primero los recursos que referencian a otros; al final los referenciados.
TYPES=(MeasureReport Communication Provenance Flag Task Group Appointment Slot Coverage Schedule ActivityDefinition Patient Practitioner Location Organization)

for T in "${TYPES[@]}"; do
  ids=$(curl -sS -G "$BASE/fhir/R4/$T" \
    --data-urlencode "_tag=$TAG" \
    --data-urlencode "_count=1000" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/fhir+json" \
    | jq -r '.entry[]?.resource.id // empty')

  if [ -z "$ids" ]; then
    echo "$T: nada que borrar"
    continue
  fi

  n=0
  for id in $ids; do
    curl -sS -o /dev/null -X DELETE "$BASE/fhir/R4/$T/$id" \
      -H "Authorization: Bearer $TOKEN"
    n=$((n + 1))
  done
  echo "$T: borrados $n"
done

# 2) Duplicados SUELTOS de MeasureReport sin meta.tag (p.ej. el tipo-cambio cargado
#    aparte con measure-tipo-cambio.json). El borrado por _tag no los alcanza, y dejan
#    el "conditional PUT matched multiple resources" al re-sembrar. Se borran por id
#    buscando por el Measure canónico (borra TODAS las copias del período/measure).
MEASURES_SUELTOS=(
  "https://bio.medplum.com.ar/fhir/Measure/tipo-cambio"
)
for M in "${MEASURES_SUELTOS[@]}"; do
  ids=$(curl -sS -G "$BASE/fhir/R4/MeasureReport" \
    --data-urlencode "measure=$M" \
    --data-urlencode "_count=1000" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/fhir+json" \
    | jq -r '.entry[]?.resource.id // empty')
  n=0
  for id in $ids; do
    curl -sS -o /dev/null -X DELETE "$BASE/fhir/R4/MeasureReport/$id" \
      -H "Authorization: Bearer $TOKEN"
    n=$((n + 1))
  done
  echo "MeasureReport sueltos ($M): borrados $n"
done

echo "Limpieza de demo completa."
