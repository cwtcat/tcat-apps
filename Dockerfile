# --- Build the static site ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build   # produces /app/dist

# --- Serve the built files with Nginx ---
FROM nginx:alpine
# SPA routing: fall back to index.html on refresh/deep links
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Optional: simple healthcheck
HEALTHCHECK CMD wget -qO- http://localhost/ >/dev/null || exit 1
