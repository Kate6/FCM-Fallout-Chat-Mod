const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const api = 'https://discord.com/api/v10';

async function request(token, path, options = {}) {
  let response = await fetch(api + path, { ...options, headers: { Authorization: `Bot ${token}`, ...(options.headers || {}) } });
  if (response.status === 429) {
    const retry = await response.json();
    await new Promise((resolve) => setTimeout(resolve, Math.ceil((retry.retry_after || 1) * 1000) + 100));
    response = await fetch(api + path, { ...options, headers: { Authorization: `Bot ${token}`, ...(options.headers || {}) } });
  }
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}

(async () => {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN missing');
  let ensured = 0;
  for (const panel of await prisma.reactionRolePanel.findMany()) {
    const message = await request(token, `/channels/${panel.channelId}/messages/${panel.messageId}`);
    for (const reaction of message.reactions || []) {
      const key = reaction.emoji.id || reaction.emoji.name;
      const mapping = panel.mappings.find((m) => m.matchKey === key);
      if (!mapping) continue;
      const emoji = encodeURIComponent(reaction.emoji.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji.name);
      const users = await request(token, `/channels/${panel.channelId}/messages/${panel.messageId}/reactions/${emoji}?limit=100`);
      for (const user of users) if (!user.bot) { await request(token, `/guilds/${panel.guildId}/members/${user.id}/roles/${mapping.roleId}`, { method: 'PUT' }); ensured++; }
    }
  }
  console.log(JSON.stringify({ roleAssignmentsEnsured: ensured }));
})().finally(() => prisma.$disconnect());
