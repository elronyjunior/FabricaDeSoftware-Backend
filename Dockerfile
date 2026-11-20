# Mesma versão de Node usada no CI (.github/workflows/backend-test.yml).
FROM node:26-alpine
WORKDIR /app
ENV NODE_ENV=production

# Instala só as dependências de produção, exatamente as do package-lock.json.
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copia o código (o .dockerignore deixa de fora .env, node_modules, testes e docs).
COPY . .

# Não roda como root dentro do contêiner.
USER node

EXPOSE 3000

# As variáveis de ambiente (banco, JWT, Firebase, IA...) são passadas na execução:
#   docker run --env-file .env -p 3000:3000 fabrica-software-backend
CMD ["node", "index.js"]
