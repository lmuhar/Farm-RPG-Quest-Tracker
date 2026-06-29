FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run build:server

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY package*.json ./
RUN npm ci --omit=dev
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "dist-server/index.js"]
