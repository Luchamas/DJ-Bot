import { config } from '../config.js';
import { isSpotifyUrl, resolveSpotify } from './spotify.js';
import { fetchPlaylist, fetchTrack, search } from './ytdlp.js';

function asUrl(input) {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Regras para links do YouTube:
 *  - /playlist?list=...            -> playlist inteira
 *  - /watch?v=...&list=...         -> so o video (o `v` indica intencao de faixa unica)
 *  - youtu.be/ID, /shorts/ID, etc. -> video unico
 */
function isYoutubePlaylist(url) {
  const host = url.hostname.replace(/^www\./, '');
  const isYoutube = /(^|\.)(youtube\.com|youtu\.be|music\.youtube\.com)$/.test(host);
  if (!isYoutube) return false;
  return url.searchParams.has('list') && !url.searchParams.has('v');
}

/** Outros sites (SoundCloud, Bandcamp, ...) tambem podem apontar para playlists. */
function looksLikePlaylist(url) {
  return isYoutubePlaylist(url) || /\/(sets|album|playlist)\//i.test(url.pathname);
}

/**
 * Transforma o texto do usuario numa lista de faixas.
 *
 * @param {string} input link ou termo de busca
 * @returns {Promise<{ tracks: object[], playlistTitle: string|null, truncated: boolean }>}
 */
export async function resolveQuery(input) {
  const query = input.trim();
  const limit = config.maxPlaylistSize;

  if (isSpotifyUrl(query)) {
    const { tracks, playlistTitle } = await resolveSpotify(query, limit);
    if (!tracks.length) throw new Error('Nao encontrei faixas nesse link do Spotify.');
    return { tracks, playlistTitle, truncated: tracks.length >= limit };
  }

  const url = asUrl(query);

  if (url) {
    if (looksLikePlaylist(url)) {
      const { tracks, title } = await fetchPlaylist(query, limit);
      return { tracks, playlistTitle: title, truncated: tracks.length >= limit };
    }
    // Qualquer outro link vai direto pro yt-dlp, que suporta centenas de sites.
    return { tracks: [await fetchTrack(query)], playlistTitle: null, truncated: false };
  }

  const results = await search(query, 1);
  if (!results.length) throw new Error(`Nada encontrado para **${query}**.`);
  return { tracks: results, playlistTitle: null, truncated: false };
}

/**
 * Faixas do Spotify entram na fila sem URL tocavel; aqui achamos o equivalente
 * no YouTube (feito na hora de tocar, para nao travar playlists grandes).
 */
export async function resolveStreamUrl(track) {
  if (track.streamUrl) return track.streamUrl;
  if (!track.query) throw new Error('Faixa sem origem tocavel.');

  const [match] = await search(`${track.query} audio`, 1);
  if (!match?.streamUrl) throw new Error(`Nao achei "${track.title}" no YouTube.`);

  track.streamUrl = match.streamUrl;
  track.duration ??= match.duration;
  track.thumbnail ??= match.thumbnail;
  return track.streamUrl;
}
