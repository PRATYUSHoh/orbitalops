FROM node:20-alpine

WORKDIR /app

# Copy package definitions
COPY package*.json ./
COPY backend/package*.json ./backend/

RUN npm install
RUN cd backend && npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "backend/src/start.js"]
