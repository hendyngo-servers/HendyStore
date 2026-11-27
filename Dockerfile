FROM php:8.3-apache

RUN apt-get update \
    && apt-get install -y --no-install-recommends libsqlite3-dev libonig-dev \
    && docker-php-ext-install pdo_sqlite pdo_mysql mbstring opcache \
    && a2enmod headers rewrite deflate expires \
    && printf '%s\n' \
      'upload_max_filesize=210M' \
      'post_max_size=212M' \
      'max_execution_time=180' \
      'max_input_time=180' \
      'memory_limit=256M' \
      'expose_php=Off' \
      'opcache.enable=1' \
      'opcache.enable_cli=0' \
      'opcache.validate_timestamps=1' \
      'opcache.revalidate_freq=2' \
      > /usr/local/etc/php/conf.d/hendy-store.ini \
    && rm -rf /var/lib/apt/lists/*

COPY . /var/www/html/
COPY docker-entrypoint.sh /usr/local/bin/hendy-store-entrypoint
RUN chmod +x /usr/local/bin/hendy-store-entrypoint \
    && mkdir -p /var/www/html/storage /var/data/hendy-store \
    && chown -R www-data:www-data /var/www/html/storage /var/data/hendy-store \
    && chmod 770 /var/www/html/storage /var/data/hendy-store

EXPOSE 10000
CMD ["hendy-store-entrypoint"]
