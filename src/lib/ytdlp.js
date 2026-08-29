import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { config } from '../config.js';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Resolve o executavel do yt-dlp: env -> ./bin -> PATH. */
export function ytdlpPath() {
  if (config.ytdlp.path) return config.ytdlp.path;

  const local = join(root, 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  if (existsSync(local)) return local;

  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

/** Argumentos comuns a todas as chamadas (inclui cookies, se configurados). */
function baseArgs() {
  const args = ['--no-warnings', '--no-cache-dir', '--ignore-config'];
  if (config.ytdlp.cookies) args.push('--cookies', config.ytdlp.cookies);
  else if (config.ytdlp.cookiesFromBrowser)
    args.push('--cookies-from-browser', config.ytdlp.cookiesFromBrowser);
  return args;
}

/** Executa o yt-dlp e devolve o stdout como texto. */
function run(args, { timeout = config.ytdlp.timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ytdlpPath(), [...baseArgs(), ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(
        new Error(
          `yt-dlp nao respondeu em ${Math.round(timeout / 1000)}s. ` +
            'Em hardware lento aumente YTDLP_TIMEOUT_SECONDS; ' +
            'se persistir, verifique se o container alcanca o YouTube.',
        ),
      );
    }, timeout);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));

    child.on('error', (error) => {
      clearTimeout(timer);
      if (error.code === 'ENOENT') {
        reject(new Error('yt-dlp nao encontrado. Rode "npm run ytdlp:update" ou defina YTDLP_PATH.'));
      } else {
        reject(error);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(cleanError(stderr) || `yt-dlp saiu com codigo ${code}`));
    });
  });
}

function cleanError(stderr) {
  const line = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .find((l) => l.startsWith('ERROR:'));
  return line ? line.replace(/^ERROR:\s*/, '').slice(0, 300) : '';
}

/** Cada linha do stdout e um JSON (um por video). */
function parseJsonLines(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Normaliza um objeto do yt-dlp para o formato interno de faixa. */
export function toTrack(info) {
  const url =
    info.webpage_url ??
    info.url ??
    (info.id ? `https://www.youtube.com/watch?v=${info.id}` : null);

  return {
    title: info.title ?? 'Desconhecido',
    url,
    streamUrl: url,
    author: info.uploader ?? info.channel ?? info.artist ?? null,
    duration: info.duration ? Math.round(info.duration) : null,
    thumbnail: info.thumbnail ?? info.thumbnails?.at(-1)?.url ?? null,
    source: 'youtube',
    query: null,
    live: Boolean(info.is_live),
  };
}

/** Metadados de um unico video/faixa. */
export async function fetchTrack(url) {
  const stdout = await run(['--dump-single-json', '--no-playlist', url]);
  const [info] = parseJsonLines(stdout);
  if (!info) throw new Error('Nao consegui ler informacoes desse link.');
  return toTrack(info);
}

/** Metadados de uma playlist inteira (rapido: --flat-playlist nao abre cada video). */
export async function fetchPlaylist(url, limit) {
  const stdout = await run(
    ['--dump-json', '--flat-playlist', '--yes-playlist', '--playlist-end', String(limit), url],
    { timeout: config.ytdlp.timeoutMs * 2 },
  );

  const entries = parseJsonLines(stdout);
  if (!entries.length) throw new Error('Playlist vazia ou indisponivel.');

  const first = entries[0];
  return {
    title: first.playlist_title ?? first.playlist ?? 'Playlist',
    tracks: entries.filter((entry) => entry.id).map(toTrack),
  };
}

/** Busca no YouTube e devolve ate `limit` resultados. */
export async function search(query, limit = 1) {
  const stdout = await run(['--dump-json', '--flat-playlist', `ytsearch${limit}:${query}`]);
  return parseJsonLines(stdout).map(toTrack);
}

/**
 * Abre o audio de uma URL como um stream PCM 48kHz estereo.
 * yt-dlp baixa para o stdout -> ffmpeg converte -> @discordjs/voice consome.
 */
export function createAudioStream(url) {
  const ytdlp = spawn(
    ytdlpPath(),
    [
      ...baseArgs(),
      '--no-playlist',
      '--quiet',
      '--no-part',
      '--no-progress',
      '-f',
      'bestaudio[abr<=160]/bestaudio/best',
      '-o',
      '-',
      url,
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const ffmpeg = spawn(
    ffmpegPath,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-analyzeduration',
      '0',
      '-i',
      'pipe:0',
      '-vn',
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      'pipe:1',
    ],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );

  let ytdlpError = '';
  ytdlp.stderr.setEncoding('utf8');
  ytdlp.stderr.on('data', (chunk) => (ytdlpError += chunk));
  ffmpeg.stderr.resume();

  ytdlp.stdout.pipe(ffmpeg.stdin);

  // EPIPE e esperado quando matamos os processos no meio do stream.
  const ignore = () => {};
  ytdlp.stdout.on('error', ignore);
  ffmpeg.stdin.on('error', ignore);
  ytdlp.on('error', ignore);
  ffmpeg.on('error', ignore);

  const destroy = () => {
    ytdlp.kill('SIGKILL');
    ffmpeg.kill('SIGKILL');
  };

  ffmpeg.stdout.once('close', destroy);

  return {
    stream: ffmpeg.stdout,
    destroy,
    getError: () => cleanError(ytdlpError),
  };
}

/**
 * Checa se o binario responde, medindo quanto ele leva para arrancar.
 *
 * O tempo importa: o executavel do yt-dlp e um pacote PyInstaller que se
 * descompacta a cada execucao, e em hardware lento isso sozinho pode consumir
 * boa parte do timeout das consultas. Ver esse numero no boot evita caçar
 * problema de rede quando a causa e so lentidao.
 */
export async function checkYtdlp() {
  const inicio = Date.now();
  const stdout = await run(['--version'], {
    timeout: Math.min(config.ytdlp.timeoutMs, 30_000),
  });
  return { versao: stdout.trim(), ms: Date.now() - inicio };
}
