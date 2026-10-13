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
#
# REACT_APP_API_BASE_URL has a PRODUCTION DEFAULT so a plain
# `gcloud run deploy --source ./frontend` (which cannot pass --build-arg)
# still builds a bundle that talks to the live backend instead of falling
# back to http://localhost:3001. Override it with --build-arg when building
# against a different backend. This value is the public Cloud Run URL of the
# PrintX backend (not a secret).
ARG REACT_APP_API_BASE_URL=https://printx-backend-g4agh2djwq-el.a.run.app
# Firebase WEB config = PUBLIC client identifiers (not secrets); Google
# documents these as safe to embed in the shipped bundle. Defaulting them here
# means a plain `gcloud run deploy --source ./frontend` keeps shopkeeper Google
# Sign-In working even though it cannot pass --build-arg. Override with
# --build-arg to target a different Firebase project.
ARG REACT_APP_FIREBASE_API_KEY=AIzaSyCbTLYh41rnc-J0JcaTCR0GWip1Z7PnktI
ARG REACT_APP_FIREBASE_AUTH_DOMAIN=printx-506807.firebaseapp.com
ARG REACT_APP_FIREBASE_PROJECT_ID=printx-506807
ARG REACT_APP_FIREBASE_APP_ID=1:285454445619:web:a2f9a7e20cc38083e44746
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
