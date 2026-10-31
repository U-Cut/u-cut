# Runs U-Cut anywhere Docker does. It needs no Mac features, but rendering uses the CPU only.
#   docker build -t u-cut .
#   docker run --rm -p 4173:4173 -v u-cut-data:/data u-cut
# Then open http://localhost:4173
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates git \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libxcomposite1 libxdamage1 libxfixes3 \
    libxkbcommon0 libxrandr2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN corepack enable \
  && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile \
  && pnpm build \
  && node packages/engine/dist/bin.js setup

ENV UCUT_HOME=/data UCUT_BIND_ALL=1
VOLUME /data
EXPOSE 4173
CMD ["node", "packages/engine/dist/bin.js", "serve", "--no-open"]
