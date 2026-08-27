#!/usr/bin/env bash
# Convertit en masse les fragments FLAC listés dans manifest.tsv vers Opus mono
# (bon rapport qualité/poids pour de la voix). Reprend automatiquement là où
# une exécution précédente s'est arrêtée : un fragment déjà converti est sauté,
# un fragment source introuvable ou en échec est journalisé sans bloquer le reste.
#
# Usage :
#   scripts/convert_batch.sh                # défauts : 24k, 8 jobs en parallèle
#   BITRATE=32k JOBS=16 scripts/convert_batch.sh
set -uo pipefail
cd "$(dirname "$0")/.."

set -a
source .env
set +a

BITRATE="${BITRATE:-24k}"
JOBS="${JOBS:-8}"

MANIFEST="$OUT_DIR/manifest.tsv"
LOG_DIR="$OUT_DIR/logs"
mkdir -p "$LOG_DIR"
ERR_LOG="$LOG_DIR/errors.log"
MISSING_LOG="$LOG_DIR/missing.log"
OK_LOG="$LOG_DIR/success.log"

if [ ! -f "$MANIFEST" ]; then
  echo "Manifeste introuvable : $MANIFEST — lancez d'abord scripts/export_manifest.sh" >&2
  exit 1
fi

TOTAL=$(wc -l < "$MANIFEST" | tr -d ' ')
echo "Conversion vers Opus ${BITRATE} mono — $TOTAL fragments au total, parallélisme=$JOBS"
echo "Logs : $LOG_DIR/{success,errors,missing}.log"

convert_one() {
  local rel_src="$1" out_name="$2"
  local src="$SRC_ROOT/$rel_src"
  local dest="$OUT_DIR/$out_name"
  local tmp="$OUT_DIR/.tmp.$$.${out_name}"

  # déjà converti (reprise) : on saute
  if [ -s "$dest" ]; then
    return 0
  fi

  if [ ! -f "$src" ]; then
    printf '%s\t%s\n' "$(date '+%F %T')" "$rel_src" >> "$MISSING_LOG"
    return 0
  fi

  if ffmpeg -y -nostdin -loglevel error -i "$src" \
      -c:a libopus -b:a "$BITRATE" -ac 1 -application voip -f opus "$tmp" \
      2>>"$ERR_LOG"; then
    mv -f "$tmp" "$dest"
    printf '%s\t%s\n' "$(date '+%F %T')" "$rel_src" >> "$OK_LOG"
  else
    printf '%s\t%s\tFFMPEG_FAILED\n' "$(date '+%F %T')" "$rel_src" >> "$ERR_LOG"
    rm -f "$tmp"
  fi
}
export -f convert_one
export SRC_ROOT OUT_DIR BITRATE ERR_LOG MISSING_LOG OK_LOG

START=$(date +%s)

# chaque ligne du manifeste (src<TAB>out_name) est passée telle quelle à bash -c ;
# xargs -L1 découpe la ligne sur les espaces/tabulations en arguments positionnels
xargs -P "$JOBS" -L1 bash -c 'convert_one "$1" "$2"' _ < "$MANIFEST"

END=$(date +%s)
DONE=$(find "$OUT_DIR" -maxdepth 1 -name '*.opus' | wc -l | tr -d ' ')
FAILED=$( [ -f "$ERR_LOG" ] && grep -c $'\t' "$ERR_LOG" || echo 0)
MISSING=$( [ -f "$MISSING_LOG" ] && wc -l < "$MISSING_LOG" || echo 0)

echo "---"
echo "Terminé en $((END-START))s"
echo "Convertis (cumulé, y compris reprises précédentes) : $DONE / $TOTAL"
echo "Échecs ffmpeg : $FAILED (détail : $ERR_LOG)"
echo "Sources manquantes sur disque : $MISSING (détail : $MISSING_LOG)"
du -sh "$OUT_DIR" 2>/dev/null | awk '{print "Taille du dossier de sortie : " $1}'
