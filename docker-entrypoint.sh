#!/bin/sh
set -eu

PORT_VALUE="${PORT:-10000}"
case "$PORT_VALUE" in
  ''|*[!0-9]*) echo "Invalid PORT value" >&2; exit 1 ;;
esac

sed -ri "s/^Listen [0-9]+$/Listen ${PORT_VALUE}/" /etc/apache2/ports.conf
sed -ri "s#<VirtualHost \*:[0-9]+>#<VirtualHost *:${PORT_VALUE}>#" /etc/apache2/sites-available/000-default.conf

# Render Free filesystem is ephemeral. Application uploads and the database are
# deliberately not written here; Neon PostgreSQL and Object Storage are durable.
exec apache2-foreground
