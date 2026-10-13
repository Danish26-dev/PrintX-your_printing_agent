# PrintX Frontend — PRODUCTION image for Cloud Run.
#
# Stage 1 builds the real static CRA/CRACO bundle. Stage 2 serves it with a
# small static server that honours Cloud Run's injected $PORT. The backend URL
# is baked in at BUILD time (CRA inlines REACT_APP_* vars), so pass it as a
# build arg when building the image for the deployed backend.
#
#   docker build \
#     --build-arg REACT_APP_API_BASE_URL=https://<backend-cloud-run-url> \
#     --build-arg REACT_APP_FIREBASE_API_KEY=... \
#     --build-arg REACT_APP_FIREBASE_AUTH_DOMAIN=... \
#     --build-arg REACT_APP_FIREBASE_PROJECT_ID=printx-506807 \
#     --build-arg REACT_APP_FIREBASE_APP_ID=... \
#     -t <image> ./frontend

# ---- Stage 1: build ----
FROM node:22-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Build-time public config (inlined into the static bundle by CRA).
ARG REACT_APP_API_BASE_URL
ARG REACT_APP_FIREBASE_API_KEY
ARG REACT_APP_FIREBASE_AUTH_DOMAIN
ARG REACT_APP_FIREBASE_PROJECT_ID
ARG REACT_APP_FIREBASE_APP_ID
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL \
    REACT_APP_FIREBASE_API_KEY=$REACT_APP_FIREBASE_API_KEY \
    REACT_APP_FIREBASE_AUTH_DOMAIN=$REACT_APP_FIREBASE_AUTH_DOMAIN \
    REACT_APP_FIREBASE_PROJECT_ID=$REACT_APP_FIREBASE_PROJECT_ID \
    REACT_APP_FIREBASE_APP_ID=$REACT_APP_FIREBASE_APP_ID \
    CI=false

RUN npm run build

# ---- Stage 2: serve ----
FROM node:22-slim AS serve
WORKDIR /app

# `serve` is a tiny static file server; it serves the SPA and rewrites unknown
# routes to index.html (-s). It binds to $PORT (Cloud Run injects it).
RUN npm install -g serve@14

COPY --from=build /app/build ./build

ENV PORT=3000
EXPOSE 3000

# Shell form so ${PORT} is expanded at runtime.
CMD ["sh", "-c", "serve -s build -l ${PORT}"]
