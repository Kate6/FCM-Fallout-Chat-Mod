/**
 * Normalize the public Fallout cards that can travel over the Discord bridge.
 *
 * Discord has no typed metadata on an embed, while FCM does.  These helpers
 * recover the same bounded metadata from the public embed shape emitted by
 * `discordOverlayCommandEmbeds`, so a compatible card sent by another bot or
 * webhook can still render as a native card in the overlay.  They deliberately
 * recognize only FCM's stable card titles; arbitrary embeds remain ordinary
 * Discord messages and are subject to the normal media policy.
 */

export type DiscordRelayEmbedField = {
  name?: string | null;
  value?: string | null;
};

export type DiscordRelayEmbed = {
  title?: string | null;
  url?: string | null;
  image?: { url?: string | null } | null;
  thumbnail?: { url?: string | null } | null;
  footer?: { text?: string | null } | null;
  fields?: readonly DiscordRelayEmbedField[];
};

export type NormalizedDiscordRelayCard = {
  content: string;
  metadata: Record<string, unknown>;
};

const MAX_URL_LENGTH = 320;
const MAX_FIELD_VALUE_LENGTH = 120;
const MAX_FIELDS = 4;
const MAX_LOCATIONS = 2;
const MAX_INVENTORY_ITEMS = 8;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function publicHttpsUrl(value: unknown): string | null {
  const candidate = text(value);
  return candidate && candidate.length <= MAX_URL_LENGTH && /^https:\/\//i.test(candidate) ? candidate : null;
}

function trim(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, Math.max(0, maximum - 1))}…`;
}

function fieldMap(embed: DiscordRelayEmbed): Map<string, string> {
  const fields = new Map<string, string>();
  for (const field of embed.fields ?? []) {
    const name = text(field.name)?.toLowerCase();
    const value = text(field.value);
    if (name && value && !fields.has(name)) fields.set(name, value);
  }
  return fields;
}

function wikiTitleFromUrl(url: string | null, fallback: string): string {
  if (!url) return fallback;
  try {
    const pathname = new URL(url).pathname;
    const page = pathname.slice(pathname.lastIndexOf('/') + 1);
    return page ? decodeURIComponent(page).replace(/_/g, ' ') : fallback;
  } catch {
    return fallback;
  }
}

function lines(value: string | undefined, limit: number): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((row) => trim(row, MAX_FIELD_VALUE_LENGTH));
}

function normalizeWiki(embed: DiscordRelayEmbed, name: string): NormalizedDiscordRelayCard {
  const fields = fieldMap(embed);
  const articleUrl = publicHttpsUrl(embed.url);
  const imageUrl = publicHttpsUrl(embed.image?.url ?? embed.thumbnail?.url);
  const imageIsMap = Boolean(publicHttpsUrl(embed.image?.url) && fields.has('map'));
  const metadataFields = Object.fromEntries(
    [...fields.entries()]
      .filter(([key]) => !['type', 'map', 'where to find it'].includes(key))
      .slice(0, MAX_FIELDS)
      .map(([key, value]) => [key, trim(value, MAX_FIELD_VALUE_LENGTH)]),
  );

  return {
    content: `[WIKI] ${name}`,
    metadata: {
      type: 'wiki_share',
      name,
      kind: fields.get('type') ?? null,
      wikiTitle: wikiTitleFromUrl(articleUrl, name),
      articleUrl,
      imageUrl,
      imageIsMap,
      locations: lines(fields.get('where to find it'), MAX_LOCATIONS),
      fields: metadataFields,
      attribution: text(embed.footer?.text) ?? 'Fallout Wiki · CC-BY-SA 3.0',
    },
  };
}

function normalizeCamp(embed: DiscordRelayEmbed, name: string): NormalizedDiscordRelayCard {
  const fields = fieldMap(embed);
  const categoryParts = (fields.get('category') ?? 'Unknown › Unknown').split('›').map((part) => part.trim());
  const budget = fields.get('budget');
  const parsedBudget = budget && /^\d+$/.test(budget) ? Number(budget) : null;

  return {
    content: `[CAMP] ${name}`,
    metadata: {
      type: 'camp_item',
      name,
      category: categoryParts[0] || 'Unknown',
      subCategory: categoryParts[1] || 'Unknown',
      budgetCost: parsedBudget,
      plan: fields.get('plan') ?? null,
      source: text(embed.footer?.text) ?? '76 CAMP Database + Fallout Wiki',
      sourceUrl: publicHttpsUrl(embed.url) ?? 'https://mrsblobby.github.io/76-CAMPDatabase/Live/',
      imageUrl: publicHttpsUrl(embed.thumbnail?.url ?? embed.image?.url),
      sourceLabel: fields.get('source') ?? null,
    },
  };
}

function normalizeMinerva(embed: DiscordRelayEmbed): NormalizedDiscordRelayCard {
  const fields = fieldMap(embed);
  const status = fields.get('status') ?? 'Next sale';
  const list = fields.get('list')?.match(/#?(\d+)/)?.[1];
  const isActive = /active/i.test(status);
  const sales = lines(fields.get('for sale'), MAX_INVENTORY_ITEMS);

  return {
    content: `[MINERVA] ${fields.get('location') ?? 'Unknown location'} — List #${list ?? 'Unknown'}`,
    metadata: {
      type: 'minerva',
      location: fields.get('location') ?? 'Unknown',
      listNumber: list ? Number(list) : 0,
      isSuperSale: /super sale/i.test(embed.title ?? '') || /super sale/i.test(fields.get('list') ?? ''),
      isActive,
      startUtc: isActive ? '' : fields.get('starts') ?? '',
      endUtc: isActive ? fields.get('ends') ?? '' : '',
      nextLocation: null,
      nextListNumber: null,
      nextIsSuperSale: null,
      nextStartUtc: null,
      sourceName: text(embed.footer?.text) ?? 'Fallout Builds',
      sourceUrl: publicHttpsUrl(embed.url) ?? 'https://www.falloutbuilds.com/fo76/minerva',
      inventory: sales,
    },
  };
}

function normalizeNukeCodes(embed: DiscordRelayEmbed): NormalizedDiscordRelayCard {
  const fields = fieldMap(embed);
  return {
    content: `[NUKE CODES] Alpha ${fields.get('alpha') ?? 'Unknown'} · Bravo ${fields.get('bravo') ?? 'Unknown'} · Charlie ${fields.get('charlie') ?? 'Unknown'}`,
    metadata: {
      type: 'nuke_codes',
      alpha: fields.get('alpha') ?? 'Unknown',
      bravo: fields.get('bravo') ?? 'Unknown',
      charlie: fields.get('charlie') ?? 'Unknown',
      validUntil: fields.get('valid until') ?? null,
    },
  };
}

function normalizeServerStatus(embed: DiscordRelayEmbed): NormalizedDiscordRelayCard {
  const fields = fieldMap(embed);
  const status = fields.get('status') ?? 'Unknown';
  return {
    content: `[SERVER STATUS] ${status}`,
    metadata: {
      type: 'server_status',
      status,
      label: status,
      checkedAt: fields.get('checked') ?? '',
    },
  };
}

/**
 * Returns a typed FCM card only when the embed is one of the supported Fallout
 * cards. The first matching embed wins because Discord messages may carry an
 * unrelated link-preview beside the intentional card.
 */
export function normalizeDiscordRelayCard(embeds: readonly DiscordRelayEmbed[]): NormalizedDiscordRelayCard | null {
  for (const embed of embeds) {
    const title = text(embed.title);
    if (!title) continue;

    const wiki = title.match(/^Fallout Wiki\s+[—-]\s+(.+)$/i);
    if (wiki?.[1]) return normalizeWiki(embed, trim(wiki[1].trim(), 180));

    const camp = title.match(/^CAMP Item\s+[—-]\s+(.+)$/i);
    if (camp?.[1]) return normalizeCamp(embed, trim(camp[1].trim(), 180));

    if (/^Minerva's Big Sale(?:\s+[—-].+)?$/i.test(title)) return normalizeMinerva(embed);
    if (/^Fallout 76 Nuke Codes$/i.test(title)) return normalizeNukeCodes(embed);
    if (/^Fallout 76 Server Status$/i.test(title)) return normalizeServerStatus(embed);
  }
  return null;
}
