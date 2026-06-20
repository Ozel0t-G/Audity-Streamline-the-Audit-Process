FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/updater/package.json apps/updater/package.json
RUN npm install
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build --workspace @audity/web

FROM nginx:1.27-alpine
COPY apps/web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
ENV AUDITY_CSP_CONNECT_EXTRA="http://localhost:9000 http://127.0.0.1:9000"
ENV NGINX_ENVSUBST_FILTER="^AUDITY_"
USER nginx
EXPOSE 8080
