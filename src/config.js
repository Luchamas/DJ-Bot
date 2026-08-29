import 'dotenv/config';

function int(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  token: process.env.DISCORD_TOKEN?.trim(),
  clientId: process.env.DISCORD_CLIENT_ID?.trim(),
  guildId: process.env.DISCORD_GUILD_ID?.trim() || null,

  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID?.trim() || null,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET?.trim() || null,
  },

  defaultVolume: Math.min(200, Math.max(0, int(process.env.DEFAULT_VOLUME, 100))),
  leaveOnEmptyMs: int(process.env.LEAVE_ON_EMPTY_SECONDS, 120) * 1000,
  leaveOnEndMs: int(process.env.LEAVE_ON_END_SECONDS, 180) * 1000,
  maxQueueSize: int(process.env.MAX_QUEUE_SIZE, 500),
  maxPlaylistSize: int(process.env.MAX_PLAYLIST_SIZE, 200),

  presence: {
    enabled: process.env.PRESENCE_ENABLED !== 'false',
    // O gateway aceita 5 atualizacoes de presence a cada 20s; 15s fica folgado.
    updateMs: Math.max(5, int(process.env.PRESENCE_UPDATE_SECONDS, 15)) * 1000,
    idleText: process.env.PRESENCE_IDLE_TEXT?.trim() || '/play',
  },

  ytdlp: {
    path: process.env.YTDLP_PATH?.trim() || null,
    // Hardware lento (Raspberry Pi com cartao SD) precisa de mais folga: o
    // binario do yt-dlp e um pacote PyInstaller que se descompacta a cada uso.
    timeoutMs: Math.max(10, int(process.env.YTDLP_TIMEOUT_SECONDS, 60)) * 1000,
    // O Python do yt-dlp nao faz Happy Eyeballs: com IPv6 configurado mas sem
    // rota, ele tenta IPv6 primeiro e fica pendurado ate o timeout - enquanto
    // ping e fetch do Node funcionam normalmente, mascarando o problema.
    // Desligue com YTDLP_FORCE_IPV4=false em rede que dependa de IPv6.
    forceIpv4: process.env.YTDLP_FORCE_IPV4 !== 'false',
    cookies: process.env.YTDLP_COOKIES?.trim() || null,
    cookiesFromBrowser: process.env.YTDLP_COOKIES_FROM_BROWSER?.trim() || null,
  },
};

export function assertConfig() {
  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN');
  if (!config.clientId) missing.push('DISCORD_CLIENT_ID');
  if (missing.length) {
    throw new Error(
      `Faltando no .env: ${missing.join(', ')}. Copie o .env.example para .env e preencha.`,
    );
  }
}

export const hasSpotifyCredentials = Boolean(config.spotify.clientId && config.spotify.clientSecret);
