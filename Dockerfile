FROM node:20-alpine

WORKDIR /app

# คัดลอกและติดตั้ง dependencies
COPY package*.json ./
RUN npm ci --only=production

# คัดลอกซอร์สโค้ดและโฟลเดอร์ public
COPY src/ ./src/
COPY public/ ./public/
COPY server.js ./

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

# Mount Volume สำหรับโฟลเดอร์ data
VOLUME ["/app/data"]

CMD ["npm", "start"]
