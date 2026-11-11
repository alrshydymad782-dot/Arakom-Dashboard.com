# ---- بناء الواجهة (React) ----
FROM node:22-alpine AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- الخادم (Node.js) ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY --from=web /app/frontend/dist /app/frontend/dist
ENV MEDIA_DIR=/data/media
VOLUME /data
EXPOSE 4000
USER node
CMD ["node", "src/server.js"]
