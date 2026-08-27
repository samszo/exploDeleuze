#!/usr/bin/env bash
# Exporte, depuis la base Omeka S, la liste des fragments transcrits par Whisper
# et le chemin de leur .flac source. Le manifeste sert d'entrée à convert_batch.sh.
#
# Usage : scripts/export_manifest.sh
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
source .env
set +a

mkdir -p "$OUT_DIR"
MANIFEST="$OUT_DIR/manifest.tsv"

echo "Export des fragments (agent = WhisperSpeechToText) depuis $DB_NAME..."

MYSQL_PWD="$DB_PASS" mysql -N -B -u "$DB_USER" -h "$DB_HOST" "$DB_NAME" \
  -e "SELECT DISTINCT file FROM transcriptions WHERE agent = 'WhisperSpeechToText' ORDER BY file;" \
  | awk -F'/' '{
      fname = $NF
      sub(/\.[^.]+$/, "", fname)
      print $0 "\t" fname ".opus"
    }' > "$MANIFEST"

TOTAL=$(wc -l < "$MANIFEST" | tr -d ' ')
echo "Manifeste écrit : $MANIFEST ($TOTAL fragments)"
