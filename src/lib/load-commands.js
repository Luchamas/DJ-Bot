import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const commandsDir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'commands');

/**
 * Importa todo arquivo .js de src/commands que exporte `data` e `execute`.
 * @returns {Promise<Array<{ data: object, execute: Function }>>}
 */
export async function loadCommands() {
  const files = (await readdir(commandsDir)).filter((file) => file.endsWith('.js'));
  const commands = [];

  for (const file of files) {
    const module = await import(pathToFileURL(join(commandsDir, file)).href);

    if (!module.data || typeof module.execute !== 'function') {
      console.warn(`[commands] ${file} ignorado: precisa exportar "data" e "execute".`);
      continue;
    }
    commands.push({ data: module.data, execute: module.execute });
  }

  return commands;
}
