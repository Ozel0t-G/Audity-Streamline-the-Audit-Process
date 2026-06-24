FROM node:22-alpine AS build
WORKDIR /app
# node-pty is a native addon and needs a toolchain to compile.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
COPY apps/console-runner/package.json apps/console-runner/package.json
RUN npm install
COPY apps/console-runner apps/console-runner
RUN npm run build --workspace @audity/console-runner

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Unprivileged user with a writable home; the shell session runs as this user.
RUN adduser -D -h /home/console console
# Copy already-compiled deps (incl. node-pty's native binary) so no toolchain is
# needed at runtime, keeping the runtime image minimal.
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/console-runner/dist apps/console-runner/dist
COPY --from=build /app/apps/console-runner/package.json apps/console-runner/package.json
USER console
EXPOSE 3100
CMD ["node", "apps/console-runner/dist/server.js"]
