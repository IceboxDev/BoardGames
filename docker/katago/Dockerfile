# The `katago` Railway service: KataGo's analysis engine (CPU / Eigen AVX2)
# behind server/src/katago/bridge.ts. Build from the repository root:
#   docker build -f docker/katago/Dockerfile .
#
# Pin the downloads: fill the *_SHA256 build args with the checksums printed by
# the first build (the build fails on a mismatch once they are set).
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @boardgames/server... \
 && pnpm --filter @boardgames/server build

FROM node:22-bookworm-slim
ARG KATAGO_VERSION=v1.15.3
ARG KATAGO_ZIP=katago-v1.15.3-eigenavx2-linux-x64.zip
ARG KATAGO_ZIP_SHA256=
ARG MODEL_URL=https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b18c384nbt-s9996604416-d4316597426.bin.gz
ARG MODEL_SHA256=
ARG HUMAN_MODEL_URL=https://github.com/lightvector/KataGo/releases/download/v1.15.0/b18c384nbt-humanv0.bin.gz
ARG HUMAN_MODEL_SHA256=
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip libzip4 libgomp1 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /katago
RUN set -eu; \
  check() { sum=$(sha256sum "$1" | cut -d' ' -f1); echo "sha256 $1 $sum"; \
            if [ -n "$2" ] && [ "$2" != "$sum" ]; then echo "checksum mismatch for $1" >&2; exit 1; fi; }; \
  curl -fsSL -o katago.zip "https://github.com/lightvector/KataGo/releases/download/${KATAGO_VERSION}/${KATAGO_ZIP}"; \
  check katago.zip "$KATAGO_ZIP_SHA256"; \
  unzip -q katago.zip && rm katago.zip && chmod +x katago; \
  curl -fsSL -o model.bin.gz "$MODEL_URL"; check model.bin.gz "$MODEL_SHA256"; \
  curl -fsSL -o human.bin.gz "$HUMAN_MODEL_URL"; check human.bin.gz "$HUMAN_MODEL_SHA256"
COPY docker/katago/analysis.cfg /katago/analysis.cfg
# The whole built workspace: pnpm's node_modules are relative symlinks.
COPY --from=build /app /app
ENV KATAGO_BIN=/katago/katago \
    KATAGO_MODEL=/katago/model.bin.gz \
    KATAGO_HUMAN_MODEL=/katago/human.bin.gz \
    KATAGO_CONFIG=/katago/analysis.cfg \
    PORT=8080
EXPOSE 8080
CMD ["node", "/app/packages/server/dist/katago/bridge.js"]
