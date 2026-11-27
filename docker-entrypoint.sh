#!/bin/sh
set -eu
PORT_VALUE="${PORT:-10000}"
case "$PORT_VALUE" in
  ''|*[!0-9]*) echo "Invalid PORT value" >&2; exit 1 ;;
esac
sed -ri "s/^Listen [0-9]+$/Listen ${PORT_VALUE}/" /etc/apache2/ports.conf
sed -ri "s#<VirtualHost \*:[0-9]+>#<VirtualHost *:${PORT_VALUE}>#" /etc/apache2/sites-available/000-default.conf
STORAGE_PATH_VALUE="${STORAGE_PATH:-/var/data/hendy-store}"
mkdir -p "$STORAGE_PATH_VALUE" /var/data
chown -R www-data:www-data "$STORAGE_PATH_VALUE" 2>/dev/null || true
chmod 770 "$STORAGE_PATH_VALUE" 2>/dev/null || true
exec apache2-foreground
