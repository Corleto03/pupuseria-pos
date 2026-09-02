#!/usr/bin/env bash
# ==============================================================================
# Script de Backup Automático para PostgreSQL - Pupusería POS
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${HOME}/backups/db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/pupuseria_db_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=7

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Iniciando copia de seguridad de la base de datos..."

# Ejecutar pg_dump dentro del contenedor de PostgreSQL pupuseria-pg
docker compose -f "${HOME}/apps/pupuseria-pos/docker-compose.prod.yml" exec -T db pg_dump -U postgres pupuseria | gzip > "${FILENAME}"

chmod 600 "${FILENAME}"

echo "[$(date)] Backup guardado exitosamente en: ${FILENAME}"

# Limpiar copias antiguas de más de 7 días
echo "[$(date)] Eliminando copias con antigüedad mayor a ${RETENTION_DAYS} días..."
find "${BACKUP_DIR}" -type f -name "pupuseria_db_*.sql.gz" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] Proceso de copia de seguridad finalizado."
