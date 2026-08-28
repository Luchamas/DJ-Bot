/**
 * Teste de fumaca: valida a cadeia inteira (yt-dlp -> ffmpeg -> PCM, resolvers,
 * comandos, embeds) sem precisar conectar no Discord.
 *
 *   npm run smoke
 *
 * Util principalmente quando o YouTube muda a extracao e o bot para de tocar:
 * se a etapa [10] falhar, rode "npm run ytdlp:update".
 */
import { nowPlayingEmbed, addedTrackEmbed } from '../src/lib/embeds.js';
import { formatDuration, progressBar } from '../src/lib/format.js';
import { loadCommands } from '../src/lib/load-commands.js';
import { ehErroDeRede, loginComRetentativa } from '../src/lib/login.js';
import { buildActivity } from '../src/lib/presence.js';
import { resolveQuery, resolveStreamUrl } from '../src/lib/resolver.js';
import { hasSpotifyCredentials } from '../src/config.js';
import { checkYtdlp, createAudioStream } from '../src/lib/ytdlp.js';
import '../src/lib/queue.js';
import '../src/lib/guards.js';

const ok = (label, extra = '') => console.log(`  OK   ${label}${extra ? ' :: ' + extra : ''}`);
const fail = (label, error) => {
  console.log(`  FAIL ${label} :: ${error.message}`);
  process.exitCode = 1;
};

console.log('\n[1] modulos carregados');
ok('imports');

console.log('\n[2] comandos');
const commands = await loadCommands();
for (const command of commands) {
  try {
    JSON.stringify(command.data.toJSON());
  } catch (error) {
    fail(`/${command.data.name}`, error);
  }
}
ok(`${commands.length} comandos`, commands.map((c) => `/${c.data.name}`).join(' '));

console.log('\n[3] encoder de opus');
// 20ms de PCM 48kHz estereo 16-bit = 960 amostras * 2 canais * 2 bytes.
const silence = Buffer.alloc(960 * 2 * 2);
try {
  // @discordjs/opus e CommonJS e nao expoe exports nomeados para ESM:
  // pelo import() so chega o `default`. O prism-media usa require(), entao
  // enxerga OpusEncoder normalmente - o cuidado aqui e so deste script.
  const opus = await import('@discordjs/opus');
  const OpusEncoder = opus.default?.OpusEncoder ?? opus.OpusEncoder;
  const frame = new OpusEncoder(48_000, 2).encode(silence);
  ok('@discordjs/opus (nativo)', `frame de ${frame.length} bytes`);
} catch (error) {
  console.log(`  --   @discordjs/opus indisponivel (${error.message})`);
  console.log('  --   esperado no Node >= 24 ou sem compilador C++; o prism-media cai no opusscript');
  try {
    const OpusScript = (await import('opusscript')).default;
    const frame = new OpusScript(48_000, 2).encode(silence, 960);
    ok('opusscript (fallback em JS puro)', `frame de ${frame.length} bytes`);
  } catch (fallbackError) {
    fail('nenhum encoder de opus disponivel', fallbackError);
  }
}

console.log('\n[4] presence (texto do status)');
{
  const fake = (current, { elapsed = 0, paused = false } = {}) => ({
    current,
    isPaused: () => paused,
    playbackDurationMs: () => elapsed * 1000,
  });

  const scenarios = [
    ['ocioso', []],
    ['tocando', [fake({ title: 'Infinita Highway', duration: 373 }, { elapsed: 62 })]],
    ['pausado', [fake({ title: 'Infinita Highway', duration: 373 }, { elapsed: 62, paused: true })]],
    ['ao vivo', [fake({ title: 'lofi radio', duration: null, live: true })]],
    ['sem duracao', [fake({ title: 'Sem metadados', duration: null }, { elapsed: 45 })]],
    ['titulo enorme', [fake({ title: 'A'.repeat(300), duration: 373 }, { elapsed: 45 })]],
    ['2 servidores', [fake({ title: 'Um', duration: 60 }), fake({ title: 'Dois', duration: 60 })]],
  ];

  for (const [label, queues] of scenarios) {
    const { name } = buildActivity(queues);
    // 128 e o limite do Discord para o nome da activity.
    if (name.length > 128) fail(label, new Error(`nome com ${name.length} caracteres`));
    else ok(label.padEnd(14), `"${name}"`);
  }
}

console.log('\n[5] login com retentativa (queda de energia / DNS lento)');
{
  const erroDns = Object.assign(new Error('getaddrinfo EAI_AGAIN discord.com'), {
    code: 'EAI_AGAIN',
  });
  // O undici embrulha falhas de rede: o codigo real fica em error.cause.
  const erroEmbrulhado = Object.assign(new TypeError('fetch failed'), {
    cause: { code: 'ENOTFOUND' },
  });
  const erroToken = Object.assign(new Error('An invalid token was provided.'), {
    code: 'TokenInvalid',
  });

  if (ehErroDeRede(erroDns)) ok('EAI_AGAIN classificado como rede');
  else fail('EAI_AGAIN', new Error('nao foi classificado como erro de rede'));

  if (ehErroDeRede(erroEmbrulhado)) ok('erro embrulhado pelo undici (cause) detectado');
  else fail('cause', new Error('nao olhou dentro de error.cause'));

  if (!ehErroDeRede(erroToken)) ok('token invalido NAO conta como rede');
  else fail('token', new Error('token invalido seria repetido a toa'));

  // Temporizador injetado: o teste nao espera de verdade.
  const esperas = [];
  const esperar = (ms) => {
    esperas.push(ms / 1000);
    return Promise.resolve();
  };

  let tentativas = 0;
  const clienteQueVolta = {
    login: async () => {
      if (++tentativas < 4) throw erroDns;
      return 'pronto';
    },
  };
  await loginComRetentativa(clienteQueVolta, 'token', { esperar });
  ok('reconecta quando a rede volta', `${tentativas} tentativas, esperou ${esperas.join('s, ')}s`);

  let tentativasToken = 0;
  const clienteTokenRuim = {
    login: async () => {
      tentativasToken++;
      throw erroToken;
    },
  };
  try {
    await loginComRetentativa(clienteTokenRuim, 'token', { esperar });
  } catch {
    /* esperado */
  }
  if (tentativasToken === 1) ok('token invalido falha de primeira, sem insistir');
  else fail('token invalido', new Error(`tentou ${tentativasToken} vezes`));

  let tentativasOffline = 0;
  const clienteOffline = {
    login: async () => {
      tentativasOffline++;
      throw erroDns;
    },
  };
  try {
    await loginComRetentativa(clienteOffline, 'token', { tentativas: 5, esperar });
    fail('offline', new Error('deveria ter desistido'));
  } catch {
    if (tentativasOffline === 5) ok('desiste apos o limite', '5 tentativas');
    else fail('offline', new Error(`${tentativasOffline} tentativas`));
  }
}

console.log('\n[6] yt-dlp');
try {
  ok('versao', await checkYtdlp());
} catch (error) {
  fail('yt-dlp', error);
}

console.log('\n[7] resolvers');
const cases = [
  ['busca por texto', 'engenheiros do hawaii infinita highway'],
  ['video do youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['youtu.be curto', 'https://youtu.be/dQw4w9WgXcQ'],
  ['playlist do youtube', 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'],
  ['watch com &list (so o video)', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI'],
  ['faixa do spotify', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'],
  ['spotify com /intl-pt/', 'https://open.spotify.com/intl-pt/track/4cOdK2wGLETKBW3PvgPWqT'],
];

if (hasSpotifyCredentials) {
  // O album ja exercita a mesma paginacao que as playlists usam.
  cases.push(['album do spotify', 'https://open.spotify.com/album/6QaVfG1pHYl1z15ZxkvVDW']);

  // Playlists editoriais do proprio Spotify (as "37i9dQ...") sao bloqueadas pela
  // API desde nov/2024 e respondem 404 para apps novos. Para testar playlist,
  // aponte SMOKE_SPOTIFY_PLAYLIST para uma playlist publica criada por usuario.
  const playlist = process.env.SMOKE_SPOTIFY_PLAYLIST?.trim();
  if (playlist) cases.push(['playlist do spotify', playlist]);
  else console.log('  --   playlist do Spotify pulada (defina SMOKE_SPOTIFY_PLAYLIST no .env para testar)');
} else {
  console.log('  --   album/playlist do Spotify pulados (sem SPOTIFY_CLIENT_ID/SECRET no .env)');
}

let spotifyTrack = null;
for (const [label, input] of cases) {
  try {
    const { tracks, playlistTitle } = await resolveQuery(input);
    if (input.includes('spotify')) spotifyTrack ??= tracks[0];
    ok(
      label,
      `${tracks.length} faixa(s)${playlistTitle ? ` | ${playlistTitle}` : ''} | ` +
        `"${tracks[0].title}" [${formatDuration(tracks[0].duration)}]`,
    );
  } catch (error) {
    fail(label, error);
  }
}

console.log('\n[8] spotify -> youtube (resolucao tardia)');
try {
  console.log(`  streamUrl antes de tocar: ${spotifyTrack.streamUrl}`);
  ok('resolvido no youtube', await resolveStreamUrl(spotifyTrack));
} catch (error) {
  fail('resolveStreamUrl', error);
}

console.log('\n[9] embeds');
try {
  const fakeQueue = {
    current: { ...spotifyTrack, requestedBy: '@user' },
    volume: 100,
    loopMode: 'off',
    playbackDurationMs: () => 45_000,
  };
  JSON.stringify(nowPlayingEmbed(fakeQueue).toJSON());
  JSON.stringify(addedTrackEmbed(spotifyTrack, 3).toJSON());
  ok('nowPlaying + addedTrack serializam', progressBar(45, 213));
} catch (error) {
  fail('embeds', error);
}

console.log('\n[10] pipeline de audio (yt-dlp -> ffmpeg -> PCM)');
await new Promise((resolve) => {
  const started = Date.now();
  const { stream, destroy, getError } = createAudioStream(spotifyTrack.streamUrl);
  let bytes = 0;
  let firstByteAt = null;

  const timer = setTimeout(() => {
    destroy();
    if (bytes === 0) fail('pipeline', new Error(getError() || 'nenhum byte recebido em 45s'));
    resolve();
  }, 45_000);

  stream.on('data', (chunk) => {
    firstByteAt ??= Date.now() - started;
    bytes += chunk.length;
    // 48kHz estereo 16-bit = 192000 bytes/s; 2s ja provam a cadeia toda.
    if (bytes >= 384_000) {
      clearTimeout(timer);
      destroy();
      ok(
        'PCM recebido',
        `${(bytes / 1024).toFixed(0)} KB (~${(bytes / 192_000).toFixed(1)}s de audio), ` +
          `primeiro byte em ${firstByteAt}ms`,
      );
      resolve();
    }
  });

  stream.on('error', (error) => {
    clearTimeout(timer);
    fail('pipeline', error);
    resolve();
  });
});

console.log(`\n${process.exitCode ? 'HOUVE FALHAS' : 'TUDO PASSOU'}\n`);
process.exit(process.exitCode ?? 0);
