# Node 22 de proposito: e a versao mais nova com binario pronto do
# @discordjs/opus (encoder nativo). Em versoes mais novas o npm tentaria
# compilar do zero, o que exige toolchain C++ dentro da imagem.
#
# Base Debian (e nao Alpine) porque os binarios do ffmpeg-static e do yt-dlp
# sao ligados a glibc e nao rodam sobre a musl do Alpine.
FROM node:22-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

# ca-certificates: o download do yt-dlp e as chamadas HTTPS (Spotify, YouTube)
# precisam da cadeia de certificados.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY scripts ./scripts

# O postinstall baixa o yt-dlp da arquitetura certa (x86_64 ou aarch64),
# e o ffmpeg-static traz o ffmpeg. Nada de ffmpeg do apt.
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

RUN chown -R node:node /app
USER node

CMD ["node", "src/index.js"]
