FROM node:20-alpine

WORKDIR /app

# Copy package definitions
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install all dependencies
RUN npm install
RUN cd backend && npm install

# Copy entire application code
COPY . .

# Build the 3D frontend into /app/dist
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start unified server and background worker
CMD ["node", "backend/src/start.js"]
