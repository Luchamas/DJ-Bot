import { ActivityType } from 'discord.js';
import { config } from '../config.js';
import { QUEUE_UPDATED, bus } from './bus.js';
import { formatDuration } from './format.js';
import { listQueues } from './queue.js';

/**
 * Presence do bot com a faixa atual e o tempo decorrido.
 *
 * O Discord so aceita `name`, `type`, `state` e `url` na presence de um bot:
 * `timestamps` (o contador que anda sozinho no Rich Presence de usuario) e
 * ignorado pelo servidor. Por isso o tempo vai escrito no texto e este modulo
 * reescreve a presence de tempos em tempos.
 *
 * O gateway permite 5 atualizacoes de presence a cada 20 segundos, entao os
 * envios sao espacados por MIN_SEND_INTERVAL e so acontecem quando o texto
 * realmente muda.
 */

const MIN_SEND_INTERVAL = 5_000;
const NAME_LIMIT = 128;

let client = null;
let ticker = null;
let throttleTimer = null;
let lastSentAt = 0;
let lastName = null;

/**
 * Monta o texto da presence a partir das filas ativas.
 * Recebe a lista por parametro para poder ser testada sem gateway nem timers.
 */
export function buildActivity(queues = listQueues()) {
  const active = queues.filter((queue) => queue.current);

  if (!active.length) {
    return { name: config.presence.idleText, type: ActivityType.Listening };
  }

  // A presence e global (uma por bot), entao com varios servidores tocando ao
  // mesmo tempo nao da para mostrar uma faixa so sem enganar quem le.
  if (active.length > 1) {
    return { name: `🎵 ${active.length} servidores tocando`, type: ActivityType.Listening };
  }

  const queue = active[0];
  const track = queue.current;
  const elapsed = Math.floor(queue.playbackDurationMs() / 1000);

  let suffix;
  if (track.live) suffix = ' • 🔴 ao vivo';
  else if (track.duration) suffix = ` • ${formatDuration(elapsed)}/${formatDuration(track.duration)}`;
  else suffix = ` • ${formatDuration(elapsed)}`;

  const icon = queue.isPaused() ? '⏸️ ' : '';
  const room = NAME_LIMIT - icon.length - suffix.length;
  const title =
    track.title.length > room ? `${track.title.slice(0, Math.max(1, room - 1))}…` : track.title;

  return {
    name: `${icon}${title}${suffix}`,
    // Alguns clientes mostram `state` como segunda linha; onde nao mostram,
    // o tempo ja esta no `name`, que aparece sempre.
    state: suffix.replace(' • ', ''),
    type: ActivityType.Listening,
  };
}

/** Envia a presence, respeitando o intervalo minimo entre envios. */
function send() {
  if (!client?.isReady()) return;

  const activity = buildActivity();
  if (activity.name === lastName) return;

  const wait = MIN_SEND_INTERVAL - (Date.now() - lastSentAt);
  if (wait > 0) {
    // Reagenda uma unica vez: o proximo disparo ja pega o texto mais recente.
    if (!throttleTimer) throttleTimer = setTimeout(() => {
      throttleTimer = null;
      send();
    }, wait);
    return;
  }

  lastName = activity.name;
  lastSentAt = Date.now();

  try {
    client.user.setPresence({ status: 'online', activities: [activity] });
  } catch (error) {
    console.error('[presence]', error.message);
  }
}

/** Liga a atualizacao automatica da presence. */
export function startPresence(discordClient) {
  client = discordClient;
  if (!config.presence.enabled) return;

  bus.on(QUEUE_UPDATED, send);
  ticker = setInterval(send, config.presence.updateMs);
  ticker.unref();
  send();
}

export function stopPresence() {
  if (ticker) clearInterval(ticker);
  if (throttleTimer) clearTimeout(throttleTimer);
  ticker = null;
  throttleTimer = null;
  bus.off(QUEUE_UPDATED, send);
}
