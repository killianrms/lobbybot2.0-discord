FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build the TypeScript project
RUN npm run build

CMD ["node", "dist/index.js"]
