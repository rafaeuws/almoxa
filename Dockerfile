# ---- Imagem do Almoxarifado Cloud ----
FROM node:20-alpine

WORKDIR /app

# Instala dependências primeiro (melhor cache de build)
COPY package.json ./
RUN npm install --omit=dev

# Copia o restante do código
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
