# syntax=docker/dockerfile:1

# --- Build the SPA static assets ---------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps against the lockfile first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Build the client bundle. With ssr:false, React Router emits a static SPA into
# build/client (index.html + hashed assets); there is no server to run.
COPY . .
RUN npm run build

# --- Serve the static client build with nginx --------------------------------
FROM nginx:1.27-alpine AS runtime

# SPA-aware config: unknown routes fall back to index.html so client-side
# routing works on deep links / refresh.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/client /usr/share/nginx/html

EXPOSE 8080
# The base image's default CMD (nginx -g "daemon off;") starts the server.
