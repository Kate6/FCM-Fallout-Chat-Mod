/** Sticky, channel-scoped command help for the Discord bot-commands channel. */
import { Client, EmbedBuilder, type Message } from 'discord.js';
import env from '../config/environment';
import logger from '../config/logger';

const LEGACY_HELP_FOOTER = 'FCM bot command help';
const HELP_TITLE = 'Fallout Chat Mod Commands';
let refreshInFlight: Promise<void> | null = null;

export function buildBotCommandsHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(HELP_TITLE)
    .setColor(0xf1c40f)
    .addFields({
      name: 'Common Commands',
      value: '`/help` · `/camp` · `/wiki` · `/minerva` · `/nukecodes` · `/appearance` · `/events`',
      inline: false,
    });
}

function isOurHelpMessage(message: Message): boolean {
  return message.author.bot && message.embeds.some((embed) =>
    embed.footer?.text === LEGACY_HELP_FOOTER || (
      embed.title === HELP_TITLE && embed.fields.some((field) => field.name === 'Common Commands')
    ),
  );
}

export async function refreshStickyHelp(client: Client): Promise<void> {
  const channelId = env.DISCORD_BOT_COMMANDS_CHANNEL_ID;
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased() || !channel.isSendable()) {
    logger.warn({ channelId }, '[discord-command-help] configured channel is not text-based');
    return;
  }
  const messages = await channel.messages.fetch({ limit: 25 });
  const previous = messages.filter(isOurHelpMessage);
  await Promise.all([...previous.values()].map((message) => message.delete().catch(() => undefined)));
  await channel.send({ embeds: [buildBotCommandsHelpEmbed()] });
}

function scheduleRefresh(client: Client): void {
  if (refreshInFlight) return;
  refreshInFlight = refreshStickyHelp(client)
    .catch((err) => logger.warn({ err }, '[discord-command-help] sticky refresh failed'))
    .finally(() => { refreshInFlight = null; });
}

export function register(client: Client): void {
  if (!env.DISCORD_BOT_COMMANDS_CHANNEL_ID) return;
  client.once('ready', () => scheduleRefresh(client));
  client.on('messageCreate', (message) => {
    if (message.channelId !== env.DISCORD_BOT_COMMANDS_CHANNEL_ID || message.author.bot || message.webhookId) return;
    scheduleRefresh(client);
  });
}

export default { register, buildBotCommandsHelpEmbed, refreshStickyHelp };
