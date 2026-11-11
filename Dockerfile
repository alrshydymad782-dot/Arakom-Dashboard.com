FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional
COPY server ./server
COPY public ./public
COPY tools ./tools
ENV DATA_DIR=/data
VOLUME /data
EXPOSE 3000
CMD ["node", "--no-warnings", "server/index.js"]
