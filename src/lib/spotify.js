/**
 * Resolve links do Spotify em metadados (titulo + artista).
 *
 * O Spotify nao permite streaming de audio por API: o fluxo padrao (usado por
 * praticamente todo bot de musica) e ler os metadados aqui e tocar o audio
 * equivalente vindo do YouTube.
 */
import { config, hasSpotifyCredentials } from '../config.js';

const SPOTIFY_URL =
  /(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?|spotify:)(track|album|playlist|artist)[/:]([A-Za-z0-9]+)/i;

export function isSpotifyUrl(input) {
  return SPOTIFY_URL.test(input);
}

export function parseSpotifyUrl(input) {
  const match = input.match(SPOTIFY_URL);
  return match ? { type: match[1].toLowerCase(), id: match[2] } : null;
}

let tokenCache = { value: null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;

  const credentials = Buffer.from(
    `${config.spotify.clientId}:${config.spotify.clientSecret}`,
  ).toString('base64');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(
      `Nao consegui autenticar no Spotify (HTTP ${res.status}). Confira SPOTIFY_CLIENT_ID/SECRET.`,
    );
  }

  const data = await res.json();
  tokenCache = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenCache.value;
}

async function api(path) {
  const token = await getToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) throw new Error('Conteudo do Spotify nao encontrado ou privado.');
  if (!res.ok) throw new Error(`Erro na API do Spotify (HTTP ${res.status}).`);
  return res.json();
}

function toTrack(item) {
  if (!item || item.type === 'episode') return null;

  const artists = (item.artists ?? []).map((artist) => artist.name).filter(Boolean);
  const title = item.name;
  if (!title) return null;

  return {
    title: artists.length ? `${artists.join(', ')} - ${title}` : title,
    url: item.external_urls?.spotify ?? null,
    // Resolvido no YouTube so na hora de tocar (playlists grandes carregam rapido).
    streamUrl: null,
    query: `${artists[0] ?? ''} ${title}`.trim(),
    author: artists[0] ?? null,
    duration: item.duration_ms ? Math.round(item.duration_ms / 1000) : null,
    thumbnail: item.album?.images?.[0]?.url ?? null,
    source: 'spotify',
    live: false,
  };
}

/** Percorre endpoints paginados do Spotify ate o limite. */
async function paginate(path, limit) {
  const tracks = [];
  let next = `${path}${path.includes('?') ? '&' : '?'}limit=50`;

  while (next && tracks.length < limit) {
    const page = await api(next);
    for (const entry of page.items ?? []) {
      const track = toTrack(entry.track ?? entry);
      if (track) tracks.push(track);
      if (tracks.length >= limit) break;
    }
    next = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null;
  }

  return tracks;
}

/** Fallback sem credenciais: da pra pegar o titulo de uma faixa unica via oEmbed. */
async function resolveViaOEmbed(url) {
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error('Nao consegui ler esse link do Spotify.');

  const data = await res.json();
  return {
    playlistTitle: null,
    tracks: [
      {
        title: data.title ?? 'Faixa do Spotify',
        url,
        streamUrl: null,
        query: data.title ?? '',
        author: null,
        duration: null,
        thumbnail: data.thumbnail_url ?? null,
        source: 'spotify',
        live: false,
      },
    ],
  };
}

/**
 * @returns {Promise<{ playlistTitle: string|null, tracks: object[] }>}
 */
export async function resolveSpotify(url, limit) {
  const parsed = parseSpotifyUrl(url);
  if (!parsed) throw new Error('Link do Spotify invalido.');

  if (!hasSpotifyCredentials) {
    if (parsed.type !== 'track') {
      throw new Error(
        'Para tocar albuns, playlists e artistas do Spotify preciso das credenciais: ' +
          'preencha SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no .env.',
      );
    }
    return resolveViaOEmbed(url);
  }

  switch (parsed.type) {
    case 'track': {
      const track = toTrack(await api(`/tracks/${parsed.id}`));
      if (!track) throw new Error('Faixa do Spotify indisponivel.');
      return { playlistTitle: null, tracks: [track] };
    }

    case 'album': {
      const album = await api(`/albums/${parsed.id}`);
      const tracks = (await paginate(`/albums/${parsed.id}/tracks`, limit)).map((track) => ({
        ...track,
        thumbnail: track.thumbnail ?? album.images?.[0]?.url ?? null,
      }));
      return { playlistTitle: album.name ?? 'Album', tracks };
    }

    case 'playlist': {
      const playlist = await api(`/playlists/${parsed.id}?fields=name`);
      const tracks = await paginate(
        `/playlists/${parsed.id}/tracks?additional_types=track`,
        limit,
      );
      return { playlistTitle: playlist.name ?? 'Playlist', tracks };
    }

    case 'artist': {
      const [artist, top] = await Promise.all([
        api(`/artists/${parsed.id}`),
        api(`/artists/${parsed.id}/top-tracks?market=BR`),
      ]);
      const tracks = (top.tracks ?? []).map(toTrack).filter(Boolean).slice(0, limit);
      return { playlistTitle: `Top faixas - ${artist.name}`, tracks };
    }

    default:
      throw new Error('Tipo de link do Spotify nao suportado.');
  }
}
