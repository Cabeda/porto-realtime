FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --include=dev
COPY tsconfig.json ./
COPY prisma/ ./prisma/
COPY src/ ./src/
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=builder /app/dist/ ./dist/
CMD ["node", "dist/src/index.js"]
