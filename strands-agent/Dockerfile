# PrintX Strands Agent (Bedrock reasoning + tool orchestration)
# The @strands-agents/sdk requires Node 22+.
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
# @strands-agents/sdk declares strict optional peer deps; use legacy resolution.
RUN npm install --legacy-peer-deps

COPY . .

ENV PORT=4000
EXPOSE 4000

# Runs the TypeScript entry via tsx (matches local dev).
CMD ["npm", "run", "start:dev"]
