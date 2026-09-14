/**
 * Discord application-command surface for overlay slash commands.
 *
 * `/fcm command` is deliberately a generic bridge to commandService so newly
 * configured overlay commands work in every environment without a Discord bot
 * code change. The Fallout lookup commands also get first-class names and
 * publish their matching structured card as a public Discord embed.
 */
import {
  Client,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import env from '../config/environment';
import logger from '../config/logger';
import prisma from '../config/prisma';
import { buildHelpResponse, getCommands, tryHandleCommand, type CommandResult } from './commandService';
import { buildDiscordOverlayCard } from './discordOverlayCommandEmbeds';
import { splitDiscordResponse } from '../lib/discordResponsePagination';
import { finalizeMessage } from './ingestMessage';
import { getUserByDiscordId, getUserById } from './userLookup';
import { getEffectiveRole, isPrivilegedRole } from './userRoleService';
import {
  REASON_CATEGORIES,
  createBan,
  deleteMessageById,
  kickUser,
  muteUser,
  reverseBan,
  unmuteUser,
} from './moderationActionsService';

const COMMAND_NAME = 'fcm';
const MODERATION_COMMAND = 'moderate';
const SPECIAL_COMMANDS = new Set(['wiki', 'camp', 'minerva', 'nukecodes', 'newcodes', 'serverstatus', 'help', 'appearance', 'events']);
const CATEGORY_CHOICES = REASON_CATEGORIES.map((name) => ({ name, value: name }));

type CommandContext = { channelId: string; channelName: string; parentChannelId: string | null };

function clip(value: string, limit = 1_900): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

async function replyWithPrivatePages(interaction: ChatInputCommandInteraction, value: string): Promise<void> {
  const [first, ...rest] = splitDiscordResponse(value);
  await interaction.reply({ content: first, flags: MessageFlags.Ephemeral });
  for (const page of rest) {
    await interaction.followUp({ content: page, flags: MessageFlags.Ephemeral });
  }
}

async function resolveContext(discordChannelId: string): Promise<CommandContext | null> {
  const explicit = await prisma.discordRelayMapping.findFirst({
    where: { discordChannelId },
    select: { inGameChannelId: true },
  });
  const channel = explicit
    ? await prisma.channel.findUnique({
      where: { id: explicit.inGameChannelId },
      select: { id: true, name: true, parentId: true },
    })
    : await prisma.channel.findFirst({
      where: { OR: [{ discordChannelId }, ...(discordChannelId === env.DISCORD_CHANNEL_ID ? [{ name: 'General' }] : [])] },
      select: { id: true, name: true, parentId: true },
    });
  return channel ? { channelId: channel.id, channelName: channel.name, parentChannelId: channel.parentId } : null;
}

async function requireLinkedUser(interaction: ChatInputCommandInteraction) {
  const user = await getUserByDiscordId(interaction.user.id);
  if (!user) {
    await interaction.reply({
      content: `Link your Discord account to Fallout Chat Mod first: ${env.FCM_PUBLIC_BASE_URL}/link`,
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return user;
}

function commandText(interaction: ChatInputCommandInteraction): string | null {
  if (interaction.commandName === COMMAND_NAME) return interaction.options.getString('command', true).trim();
  if (!SPECIAL_COMMANDS.has(interaction.commandName)) return null;
  switch (interaction.commandName) {
    case 'wiki': return `/wiki ${interaction.options.getString('query', true)}`;
    case 'camp': return `/camp ${interaction.options.getString('item', true)}`;
    case 'minerva': return '/minerva';
    case 'nukecodes':
    case 'newcodes': return '/nukecodes';
    case 'serverstatus': return '/serverstatus';
    default: return null;
  }
}

async function replyForCommand(interaction: ChatInputCommandInteraction, result: CommandResult): Promise<void> {
  if (!result.handled) {
    await interaction.reply({ content: 'Unknown command. Use `/fcm command:/help` for the available overlay commands.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (result.actionType === 'report') {
    await interaction.reply({ content: 'Use `/moderate` for staff actions or the overlay report form for player reports.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (result.actionType === 'relay') {
    await interaction.reply({ content: `Sent: ${clip(result.relayContent)}`, flags: MessageFlags.Ephemeral });
    return;
  }

  const card = result.metadata ? buildDiscordOverlayCard(result.metadata) : null;
  if (card) {
    const embed = new EmbedBuilder()
      .setTitle(card.title)
      .setColor(card.color)
      .setFooter({ text: card.footerText })
      .addFields(card.fields.slice(0, 25));
    if (card.description) embed.setDescription(card.description);
    if (card.url) embed.setURL(card.url);
    if (card.thumbnailUrl) embed.setThumbnail(card.thumbnailUrl);
    await interaction.reply({
      content: `${interaction.user} ran /${interaction.commandName}.`,
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
    return;
  }
  await interaction.reply({ content: clip(result.botMessage), flags: MessageFlags.Ephemeral });
}

async function handleOverlayCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (interaction.commandName === 'help') {
    await replyWithPrivatePages(interaction, buildHelpResponse(await getCommands()));
    return;
  }
  if (interaction.commandName === 'appearance') {
    await interaction.reply({ content: 'Use `/name` to set your chat name and `/cosmetics` to manage your appearance.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.commandName === 'events') {
    await handleEventsCommand(interaction);
    return;
  }
  const raw = commandText(interaction);
  if (!raw?.startsWith('/')) return;
  const [user, context] = await Promise.all([requireLinkedUser(interaction), resolveContext(interaction.channelId)]);
  if (!user) return;
  if (!context) {
    await interaction.reply({ content: 'This Discord channel is not mapped to an FCM chat channel.', flags: MessageFlags.Ephemeral });
    return;
  }
  const displayName = user.chatName ?? user.discordDisplayName ?? user.discordUsername ?? user.username;
  const result = await tryHandleCommand(raw, user.id, displayName, context.channelId, context.channelName, null, 0, context.parentChannelId);
  if (result.handled && result.actionType === 'relay') {
    await finalizeMessage({
      userId: user.id,
      channelId: result.targetChannelId,
      content: result.relayContent,
      displayName,
      source: 'discord',
      waitForPersistence: true,
    });
  }
  await replyForCommand(interaction, result);
}

async function handleEventsCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const eventCommands = (await getCommands()).filter((command) => command.actionType === 'announce');
  const requested = interaction.options.getString('command');
  if (!requested) {
    const lines = eventCommands.length === 0
      ? ['No event commands are configured right now.']
      : eventCommands.map((command) => `${command.trigger}${command.alias ? ` (${command.alias})` : ''} — ${command.description}`);
    await interaction.reply({ content: clip(`Event commands:\n${lines.join('\n')}`), flags: MessageFlags.Ephemeral });
    return;
  }
  const raw = requested.trim().toLowerCase();
  const trigger = raw.split(/\s+/, 1)[0];
  const configured = eventCommands.find((command) => command.trigger === trigger || command.alias === trigger);
  if (!configured) {
    await interaction.reply({ content: 'That is not an available event command. Run `/events` to see the list.', flags: MessageFlags.Ephemeral });
    return;
  }
  const [user, context] = await Promise.all([requireLinkedUser(interaction), resolveContext(interaction.channelId)]);
  if (!user) return;
  if (!context) {
    await interaction.reply({ content: 'This Discord channel is not mapped to an FCM chat channel.', flags: MessageFlags.Ephemeral });
    return;
  }
  const displayName = user.chatName ?? user.discordDisplayName ?? user.discordUsername ?? user.username;
  const result = await tryHandleCommand(requested.trim(), user.id, displayName, context.channelId, context.channelName, null, 0, context.parentChannelId);
  if (!result.handled || result.actionType !== 'relay') {
    await interaction.reply({ content: 'That event command could not be run.', flags: MessageFlags.Ephemeral });
    return;
  }
  await finalizeMessage({
    userId: user.id,
    channelId: result.targetChannelId,
    content: result.relayContent,
    displayName,
    source: 'discord',
    waitForPersistence: true,
  });
  await interaction.reply({ content: 'Event announcement sent.', flags: MessageFlags.Ephemeral });
}

async function requireModerator(interaction: ChatInputCommandInteraction) {
  const actor = await requireLinkedUser(interaction);
  if (!actor) return null;
  const role = await getEffectiveRole(actor.id);
  if (!isPrivilegedRole(role)) {
    await interaction.reply({ content: 'Only Fallout Chat Mod moderators and admins can use this command.', flags: MessageFlags.Ephemeral });
    return null;
  }
  return actor;
}

async function requireTarget(interaction: ChatInputCommandInteraction) {
  const userId = interaction.options.getString('user', true);
  const target = await getUserById(userId);
  if (!target) {
    await interaction.reply({ content: 'That Discord member has no linked Fallout Chat Mod account.', flags: MessageFlags.Ephemeral });
    return null;
  }
  return target;
}

function moderationTargetLabel(user: { chatName: string | null; username: string; discordDisplayName: string | null; discordUsername: string | null; discordId: string | null; steamId: string | null; steamDisplayName: string | null }): string {
  const chatIdentity = user.chatName || user.username;
  const identities = [
    user.discordDisplayName || user.discordUsername || user.discordId,
    user.steamDisplayName || user.steamId,
  ].filter(Boolean).join(' · ');
  return `${chatIdentity}${identities ? ` — ${identities}` : ''}`.slice(0, 100);
}

async function handleModerationAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (interaction.commandName !== MODERATION_COMMAND || interaction.options.getFocused(true).name !== 'user') return;
  try {
    const actor = await getUserByDiscordId(interaction.user.id);
    if (!actor || !isPrivilegedRole(await getEffectiveRole(actor.id))) {
      await interaction.respond([]);
      return;
    }
    const query = interaction.options.getFocused().trim();
    const users = await prisma.user.findMany({
      where: {
        ...(query ? {
          OR: [
            { discordId: { contains: query } },
            { steamId: { contains: query, mode: 'insensitive' } },
            { steamDisplayName: { contains: query, mode: 'insensitive' } },
            { fo76AccountName: { contains: query, mode: 'insensitive' } },
            { fo76CharacterName: { contains: query, mode: 'insensitive' } },
            { chatName: { contains: query, mode: 'insensitive' } },
            { username: { contains: query, mode: 'insensitive' } },
            { discordUsername: { contains: query, mode: 'insensitive' } },
            { discordDisplayName: { contains: query, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 25,
      select: { id: true, chatName: true, username: true, discordDisplayName: true, discordUsername: true, discordId: true, steamId: true, steamDisplayName: true },
    });
    await interaction.respond(users.map((user) => ({ name: moderationTargetLabel(user), value: user.id })));
  } catch (err) {
    logger.warn({ err, discordUserId: interaction.user.id }, '[discord-overlay-commands] moderation target autocomplete failed');
    await interaction.respond([]).catch(() => {});
  }
}

async function handleModeration(interaction: ChatInputCommandInteraction): Promise<void> {
  const actor = await requireModerator(interaction);
  if (!actor) return;
  const subcommand = interaction.options.getSubcommand(true);
  try {
    if (subcommand === 'unban') {
      await reverseBan(interaction.options.getString('ban-id', true), actor.id, interaction.options.getString('reason') ?? 'Reversed from Discord');
      await interaction.reply({ content: 'Ban reversed.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === 'delete-message') {
      await deleteMessageById(interaction.options.getString('message-id', true), actor.id, interaction.options.getString('reason') ?? 'Removed from Discord moderation command');
      await interaction.reply({ content: 'Message deleted.', flags: MessageFlags.Ephemeral });
      return;
    }

    const target = await requireTarget(interaction);
    if (!target) return;
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    if (subcommand === 'kick') {
      const result = await kickUser(target.id, actor.id, reason, { kickDiscord: true });
      await interaction.reply({
        content: result.discordKicked
          ? `Kicked ${target.chatName ?? target.username} from FCM and Discord.`
          : `Kicked ${target.chatName ?? target.username} from FCM. Discord kick was not applied: ${result.discordWarning ?? 'no linked Discord account'}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (subcommand === 'mute') {
      const minutes = interaction.options.getInteger('minutes', true);
      const category = interaction.options.getString('category') ?? 'Other';
      const result = await muteUser(target.id, actor.id, minutes * 60_000, category, reason);
      await interaction.reply({
        content: result.discordPropagated
          ? `Muted ${target.chatName ?? target.username} in FCM and Discord until ${result.until.toISOString()}.`
          : `Muted ${target.chatName ?? target.username} in FCM until ${result.until.toISOString()}, but the Discord timeout was not applied. Check bot permissions and role hierarchy.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (subcommand === 'unmute') {
      await unmuteUser(target.id, actor.id, reason);
      await interaction.reply({ content: `Unmuted ${target.chatName ?? target.username}.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (subcommand === 'ban') {
      const minutes = interaction.options.getInteger('minutes');
      const until = minutes ? new Date(Date.now() + minutes * 60_000) : null;
      const category = interaction.options.getString('category') ?? 'Other';
      const evidence = interaction.options.getString('evidence', true);
      const result = await createBan(target.id, actor.id, category, reason, until, [{ type: 'text', textContent: evidence }], { banDiscord: true });
      await interaction.reply({
        content: result.discordLockdown.guildBanApplied
          ? `Banned ${target.chatName ?? target.username} from FCM and Discord${until ? ` until ${until.toISOString()}` : ' permanently'}.`
          : `Banned ${target.chatName ?? target.username} from FCM, but Discord ban was not applied: ${result.discordLockdown.warnings.join(' ') || 'check Ban Members permission and role hierarchy'}.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    logger.warn({ err, command: subcommand, actorId: actor.id }, '[discord-overlay-commands] moderation action failed');
    await interaction.reply({ content: 'Moderation action failed. Check the target, permissions, and audit log.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

function buildOverlayCommand() {
  return new SlashCommandBuilder()
    .setName(COMMAND_NAME)
    .setDescription('Run an Fallout Chat Mod overlay command')
    .setDMPermission(false)
    .addStringOption((option) => option.setName('command').setDescription('For example: /help or /g hello').setRequired(true))
    .toJSON();
}

function buildSpecialCommand(name: string, description: string, option?: { name: string; description: string }) {
  const command = new SlashCommandBuilder().setName(name).setDescription(description).setDMPermission(false);
  if (option) command.addStringOption((input) => input.setName(option.name).setDescription(option.description).setRequired(true));
  return command.toJSON();
}

function buildEventsCommand() {
  return new SlashCommandBuilder()
    .setName('events')
    .setDescription('List or run Fallout Chat Mod event commands')
    .setDMPermission(false)
    .addStringOption((option) => option.setName('command').setDescription('Event command, for example /ss').setRequired(false))
    .toJSON();
}

function buildModerationCommand() {
  return new SlashCommandBuilder()
    .setName(MODERATION_COMMAND)
    .setDescription('Fallout Chat Mod moderation actions')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((sub) => sub.setName('kick').setDescription('Kick an FCM user for five minutes').addStringOption((opt) => opt.setName('user').setDescription('Search FCM, Discord, Steam name, or ID').setAutocomplete(true).setRequired(true)).addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(true)))
    .addSubcommand((sub) => sub.setName('mute').setDescription('Mute an FCM user').addStringOption((opt) => opt.setName('user').setDescription('Search FCM, Discord, Steam name, or ID').setAutocomplete(true).setRequired(true)).addIntegerOption((opt) => opt.setName('minutes').setDescription('1–40320 minutes').setMinValue(1).setMaxValue(40_320).setRequired(true)).addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(true)).addStringOption((opt) => opt.setName('category').setDescription('Category').addChoices(...CATEGORY_CHOICES)))
    .addSubcommand((sub) => sub.setName('unmute').setDescription('Unmute an FCM user').addStringOption((opt) => opt.setName('user').setDescription('Search FCM, Discord, Steam name, or ID').setAutocomplete(true).setRequired(true)).addStringOption((opt) => opt.setName('reason').setDescription('Reason')))
    .addSubcommand((sub) => sub.setName('ban').setDescription('Ban an FCM user').addStringOption((opt) => opt.setName('user').setDescription('Search FCM, Discord, Steam name, or ID').setAutocomplete(true).setRequired(true)).addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(true)).addStringOption((opt) => opt.setName('evidence').setDescription('Evidence summary for the audit record').setRequired(true)).addIntegerOption((opt) => opt.setName('minutes').setDescription('Leave blank for permanent').setMinValue(1).setMaxValue(43_200)).addStringOption((opt) => opt.setName('category').setDescription('Category').addChoices(...CATEGORY_CHOICES)))
    .addSubcommand((sub) => sub.setName('unban').setDescription('Reverse a ban by FCM ban ID').addStringOption((opt) => opt.setName('ban-id').setDescription('Ban UUID').setRequired(true)).addStringOption((opt) => opt.setName('reason').setDescription('Reason')))
    .addSubcommand((sub) => sub.setName('delete-message').setDescription('Delete an FCM chat message by ID').addStringOption((opt) => opt.setName('message-id').setDescription('Message UUID').setRequired(true)).addStringOption((opt) => opt.setName('reason').setDescription('Reason')))
    .toJSON();
}

async function registerCommands(client: Client): Promise<void> {
  if (!env.DISCORD_SERVER_ID) return;
  const commands = [
    buildOverlayCommand(),
    buildSpecialCommand('wiki', 'Look up Fallout 76 wiki data', { name: 'query', description: 'Item, creature, weapon, perk, or location' }),
    buildSpecialCommand('camp', 'Look up a CAMP item', { name: 'item', description: 'CAMP item name' }),
    buildSpecialCommand('minerva', "Show Minerva's current or next sale"),
    buildSpecialCommand('nukecodes', 'Show current nuke launch codes'),
    buildSpecialCommand('newcodes', 'Alias for current nuke launch codes'),
    buildSpecialCommand('serverstatus', 'Show Fallout 76 server status'),
    buildSpecialCommand('help', 'Show the private FCM quick command guide'),
    buildSpecialCommand('appearance', 'Show chat-name and appearance commands'),
    buildEventsCommand(),
    buildModerationCommand(),
  ];
  const manager = client.application?.commands;
  if (!manager) return;
  const existing = await manager.fetch({ guildId: env.DISCORD_SERVER_ID });
  for (const command of commands) {
    const current = existing.find((registered) => registered.name === command.name);
    // discord.js's edit overload is narrower than SlashCommandBuilder's valid
    // REST JSON output even though the API accepts the same command payload.
    if (current) await current.edit(command as unknown as Parameters<typeof current.edit>[0]);
    else await manager.create(command, env.DISCORD_SERVER_ID);
  }
  logger.info({ count: commands.length, guildId: env.DISCORD_SERVER_ID }, '[discord-overlay-commands] registered');
}

async function onInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isAutocomplete()) {
    await handleModerationAutocomplete(interaction);
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  try {
    if (interaction.commandName === MODERATION_COMMAND) await handleModeration(interaction);
    else if (interaction.commandName === COMMAND_NAME || SPECIAL_COMMANDS.has(interaction.commandName)) await handleOverlayCommand(interaction);
  } catch (err) {
    logger.error({ err, command: interaction.commandName }, '[discord-overlay-commands] interaction failed');
    if (!interaction.replied) await interaction.reply({ content: 'Command failed. Please try again.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

export function register(client: Client): void {
  client.on('interactionCreate', (interaction) => { void onInteraction(interaction); });
  client.once('ready', () => { void registerCommands(client).catch((err) => logger.warn({ err }, '[discord-overlay-commands] registration failed')); });
}

export default { register };
