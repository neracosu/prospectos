#!/usr/bin/env bash
# Respaldo diario del panel de prospectos: la base neracosu_prospectos y ~/prospectos-archivos (recibos y
# documentos, que NO se regeneran nunca). Mismo patron que el respaldo de OCLS.
# Cron: 40 3 * * * /home/neracosu/public_html/prospectos.neracosu.com/scripts/respaldo.sh >> /home/neracosu/.config/prospectos/respaldo.log 2>&1
#
# Tres cosas quedan en ~/backups/prospectos:
#   db-FECHA.sql.gz         volcado de la base, 30 dias de rotacion
#   archivos-FECHA.tar.gz   recibos/ y documentos/ del dia, 30 dias de rotacion (propuestas/ no: se regenera)
#   archivos-espejo/        copia acumulativa SIN borrado: un recibo que desaparezca del original sigue aqui aunque
#                           pasen los 30 dias. Es lo que protege contra un rm accidental que nadie nota a tiempo.
# Es un respaldo en el MISMO disco: cubre errores humanos y de la aplicacion, no la perdida del servidor. Para eso
# hace falta copiar ~/backups/prospectos a otro sitio (decision de Neri, pendiente).
#
# Nunca se imprime ni se loguea la contrasena: mysqldump la toma del my.cnf (600). Todo se escribe a un temporal
# oculto y solo se mueve al nombre definitivo despues de verificarlo (gzip -t): un volcado cortado a mitad no
# puede pasar por un respaldo bueno. PROSPECTOS_RESPALDO_DIR / PROSPECTOS_RESPALDO_ARCHIVOS permiten un ensayo.
set -euo pipefail
umask 077
DESTINO="${PROSPECTOS_RESPALDO_DIR:-$HOME/backups/prospectos}"
CNF="$HOME/.config/prospectos/my.cnf"
BASE_DATOS="$(cat "$HOME/.config/prospectos/base-nombre")"
ARCHIVOS="${PROSPECTOS_RESPALDO_ARCHIVOS:-$HOME/prospectos-archivos}"
FECHA="$(date +%Y%m%d-%H%M)"
case "$BASE_DATOS" in *prospectos_test*) echo "ALTO: la base configurada es la de tests"; exit 2;; esac
mkdir -p "$DESTINO" "$DESTINO/archivos-espejo"
chmod 700 "$DESTINO"

TMP_DB="$DESTINO/.db-$FECHA.sql.gz.tmp"
TMP_TAR="$DESTINO/.archivos-$FECHA.tar.gz.tmp"
trap 'rm -f "$TMP_DB" "$TMP_TAR"' EXIT

# pipefail hace que el pipe falle si falla mysqldump, no solo gzip.
mysqldump --defaults-file="$CNF" --single-transaction --routines --triggers "$BASE_DATOS" | gzip -9 > "$TMP_DB"
gzip -t "$TMP_DB"
mv "$TMP_DB" "$DESTINO/db-$FECHA.sql.gz"

# Solo lo que no se regenera. Si todavia no existe ninguno de los dos directorios, no hay nada que empaquetar.
QUE=()
for d in recibos documentos; do [ -d "$ARCHIVOS/$d" ] && QUE+=("$d"); done
if [ "${#QUE[@]}" -gt 0 ]; then
  tar -czf "$TMP_TAR" -C "$ARCHIVOS" "${QUE[@]}"
  gzip -t "$TMP_TAR"
  mv "$TMP_TAR" "$DESTINO/archivos-$FECHA.tar.gz"
  # Espejo acumulativo: sin --delete a proposito. --ignore-existing: un recibo emitido no cambia; si el original
  # cambiara (no deberia), el espejo conserva el primero.
  for d in "${QUE[@]}"; do rsync -a --ignore-existing "$ARCHIVOS/$d/" "$DESTINO/archivos-espejo/$d/"; done
fi

# Rotacion: solo lo que genera esta rutina. Los temporales empiezan con punto y no coinciden.
/usr/bin/find "$DESTINO" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'archivos-*.tar.gz' \) -mtime +30 -delete
echo "$(date -Is) respaldo ok: base $(du -h "$DESTINO/db-$FECHA.sql.gz" | cut -f1), archivos ${QUE[*]:-ninguno}, total $(du -sh "$DESTINO" | cut -f1) en $DESTINO"
