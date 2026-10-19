FROM node:20-alpine

WORKDIR /app

# Copy package definitions
COPY package*.json ./
RUN npm install

# Copy all files (including pre-built dist)
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "src/start.js"]
