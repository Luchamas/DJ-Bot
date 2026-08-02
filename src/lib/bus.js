import { EventEmitter } from 'node:events';

/**
 * Barramento de eventos interno.
 *
 * Existe para a fila avisar mudancas sem importar o modulo de presence
 * (o que criaria um ciclo de imports entre queue.js e presence.js).
 */
export const bus = new EventEmitter();

/** Emitido sempre que o estado de reproducao de algum servidor muda. */
export const QUEUE_UPDATED = 'queue:updated';

export function notifyQueueUpdate() {
  bus.emit(QUEUE_UPDATED);
}
