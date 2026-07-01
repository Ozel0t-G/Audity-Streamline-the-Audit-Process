# Audity License Generator — eigenständige Vendor-App (keine npm-Abhängigkeiten).
FROM node:20-alpine

WORKDIR /app
COPY server.mjs ./

EXPOSE 4000

# Läuft als root, damit der read-only gemountete Private-Key (mode 600, Host-UID)
# zuverlässig lesbar ist. Tool ist localhost/intern-only (siehe README).
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:4000/healthz || exit 1

CMD ["node", "server.mjs"]
