FROM node:20-alpine

WORKDIR /app

# copy package files first — install layer only rebuilds if these change
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001
CMD ["node", "src/index.js"]


