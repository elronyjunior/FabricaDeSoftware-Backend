FROM node:18-alpine
WORKDIR /app

# Copia os arquivos de dependência e instala
COPY package*.json ./
RUN npm install

# Copia o resto do código
COPY . .

# Expõe a porta que a sua API usa (exemplo: 3000)
EXPOSE 3000

# Comando para iniciar o backend
CMD ["node", "index.js"]