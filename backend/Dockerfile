# PrintX Backend (application control plane)
# Node 22+ is required by the toolchain used across the TypeScript services.
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
# The Strands ecosystem pins strict peer deps; keep installs consistent.
RUN npm install --legacy-peer-deps

COPY . .

ENV PORT=3001
EXPOSE 3001

# Runs the TypeScript entry via tsx (matches local dev).
CMD ["npm", "run", "start:dev"]
