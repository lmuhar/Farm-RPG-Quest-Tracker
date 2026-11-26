FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
# The Chrome extension's latest build is served at /extension.zip (+ /extension.json for update checks)
RUN npm run build && npm run build:server && npm run build:extension && cp extension/release/* dist/

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY package*.json ./
RUN npm ci --omit=dev
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "dist-server/index.js"]
