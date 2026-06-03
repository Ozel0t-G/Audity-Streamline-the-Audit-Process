FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm install
COPY packages/shared packages/shared
COPY apps/worker apps/worker
RUN npm run build --workspace @audity/worker

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont postgresql16-client
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm install --omit=dev
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/worker/dist apps/worker/dist
USER node
EXPOSE 3001
CMD ["node", "apps/worker/dist/worker.js"]
