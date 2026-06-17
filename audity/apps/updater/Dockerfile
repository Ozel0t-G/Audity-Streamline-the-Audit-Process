FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/updater/package.json apps/updater/package.json
RUN npm install
COPY apps/updater apps/updater
RUN npm run build --workspace @audity/updater

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl docker-cli docker-cli-compose perl
COPY package.json package-lock.json ./
COPY apps/updater/package.json apps/updater/package.json
RUN npm install --omit=dev
COPY --from=build /app/apps/updater/dist apps/updater/dist
EXPOSE 3099
CMD ["node", "apps/updater/dist/server.js"]
