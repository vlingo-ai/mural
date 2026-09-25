FROM node:22-alpine AS build
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
COPY shared/contracts/ /app/shared/contracts/
ARG VITE_MURAL_API_ORIGIN
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_MURAL_API_ORIGIN=${VITE_MURAL_API_ORIGIN}
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
RUN npm run build

FROM caddy:2-alpine
COPY deploy/phase-5-5b/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
