FROM postgres:16-alpine
WORKDIR /app
COPY db/migrations /migrations
COPY scripts/migrate.sh /usr/local/bin/aperture-migrate
RUN chmod +x /usr/local/bin/aperture-migrate
ENTRYPOINT ["/usr/local/bin/aperture-migrate"]
