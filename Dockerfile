# syntax=docker/dockerfile:1

# --- Build the SSR server + client assets ------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps against the lockfile first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Build the app. With ssr:true, React Router emits BOTH build/server (the SSR
# entry served by react-router-serve) and build/client (hashed browser assets).
COPY . .
RUN npm run build

# --- Run the Node SSR server (react-router-serve, no more nginx) -------------
FROM node:20-alpine AS runtime
WORKDIR /app

# Install only production deps so @react-router/serve + node runtime deps are
# present to actually run the server.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Bring in the built server + client output from the build stage.
COPY --from=build /app/build ./build

# react-router-serve listens on $PORT; pin it to 8080 to match the Service/HTTPRoute.
ENV PORT=8080
EXPOSE 8080

# "npm run start" -> react-router-serve ./build/server/index.js
CMD ["npm", "run", "start"]
