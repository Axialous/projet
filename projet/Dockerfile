FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
COPY serveur ./serveur
COPY jeu ./jeu

USER node

EXPOSE 3000

CMD ["node", "serveur/serveur.js"]
