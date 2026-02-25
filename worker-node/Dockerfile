FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY prisma/ ./prisma/
COPY src/ ./src/
RUN npx prisma generate
CMD ["npx", "tsx", "src/index.ts"]
