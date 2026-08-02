import { REST, Routes } from 'discord.js';
import { assertConfig, config } from './config.js';
import { loadCommands } from './lib/load-commands.js';

assertConfig();

const commands = await loadCommands();
const body = commands.map((command) => command.data.toJSON());
const rest = new REST().setToken(config.token);

const route = config.guildId
  ? Routes.applicationGuildCommands(config.clientId, config.guildId)
  : Routes.applicationCommands(config.clientId);

const registered = await rest.put(route, { body });

console.log(
  `✅ ${registered.length} comandos registrados ${
    config.guildId ? `no servidor ${config.guildId}` : 'globalmente (pode levar ate 1h)'
  }.`,
);
console.log(registered.map((command) => `   /${command.name}`).join('\n'));
