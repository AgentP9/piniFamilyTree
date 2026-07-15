FROM node:22-alpine

WORKDIR /app

COPY server.js .

# Data volume mount point
VOLUME ["/data"]

EXPOSE 3000

CMD ["node", "server.js"]
