# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# (Optional) Pass Vite env at build time, e.g. VITE_API_URL
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- run stage ---
FROM nginx:alpine
# Replace default config with our SPA config
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy the built files from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx listens on 80 inside the container
EXPOSE 80
