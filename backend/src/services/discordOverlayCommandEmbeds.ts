/**
 * Discord presentation for the structured cards returned by commandService.
 *
 * Keep this intentionally data-only: the overlay and Discord both consume the
 * exact command metadata, while discordService owns discord.js transport.
 */
import env from '../config/environment';

export interface DiscordCommandEmbedData {
  title: string;
  description?: string;
  url?: string;
  color: number;
  thumbnailUrl?: string;
  imageUrl?: string;
  footerText: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}

type CardMetadata = Record<string, unknown>;

const CARD_COLORS = {
  wiki_share: 0x57dbdb,
  camp_item: 0x79c267,
  minerva: 0xc79be8,
  nuke_codes: 0xf1c40f,
  server_status: 0x57dbdb,
} as const;

function asText(value: unknown, fallback = 'Unknown'): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function publicUrl(value: unknown): string | undefined {
  const raw = nullableText(value);
  if (!raw) return undefined;
  if (/^https:\/\//i.test(raw)) return raw;
  if (!raw.startsWith('/')) return undefined;
  return `${env.FCM_PUBLIC_BASE_URL.replace(/\/$/, '')}${raw}`;
}

function objectFields(value: unknown, limit = 10, omit = new Set<string>()): Array<{ name: string; value: string; inline?: boolean }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter(([name, fieldValue]) => fieldValue !== null && fieldValue !== undefined && String(fieldValue).trim() && !omit.has(name.toLowerCase()))
    .slice(0, limit)
    .map(([name, fieldValue]) => ({
      name: name.slice(0, 256),
      value: String(fieldValue).slice(0, 1024),
      inline: true,
    }));
}

function locationField(value: unknown): { name: string; value: string; inline?: boolean }[] {
  if (!Array.isArray(value)) return [];
  const rows = value.map((row) => Array.isArray(row)
    ? row.map((segment: any) => String(segment?.text ?? '')).join('').trim()
    : String(row ?? '').trim()).filter(Boolean).slice(0, 5);
  return rows.length ? [{ name: 'Where to find it', value: rows.join('\n').slice(0, 1024), inline: false }] : [];
}

/**
 * Return a public Discord embed only for overlay card metadata.  Plain command
 * results deliberately stay ephemeral so `/help` and validation errors do not
 * flood relay channels.
 */
export function buildDiscordOverlayCard(metadata: CardMetadata): DiscordCommandEmbedData | null {
  const type = metadata.type;
  if (typeof type !== 'string') return null;

  switch (type) {
    case 'wiki_share': {
      const articleUrl = publicUrl(metadata.articleUrl)
        ?? `https://fallout.fandom.com/wiki/${encodeURIComponent(asText(metadata.wikiTitle).replace(/ /g, '_'))}`;
      const imageUrl = publicUrl(metadata.imageUrl);
      const isMap = metadata.imageIsMap === true;
      return {
        title: `Fallout Wiki — ${asText(metadata.name)}`,
        url: articleUrl,
        color: CARD_COLORS.wiki_share,
        thumbnailUrl: isMap ? undefined : imageUrl,
        imageUrl: isMap ? imageUrl : undefined,
        footerText: asText(metadata.attribution, 'Fallout Wiki · CC-BY-SA 3.0'),
        fields: [
          { name: 'Type', value: asText(metadata.kind), inline: true },
          ...(isMap && imageUrl ? [{ name: 'Map', value: `[Open full-size map](${imageUrl})`, inline: true }] : []),
          ...locationField(metadata.locations),
          ...objectFields(metadata.fields, 10, new Set(['edid', 'formid', 'editor id', 'form id'])),
        ],
      };
    }
    case 'camp_item':
      return {
        title: `CAMP Item — ${asText(metadata.name)}`,
        url: publicUrl(metadata.sourceUrl),
        color: CARD_COLORS.camp_item,
        thumbnailUrl: publicUrl(metadata.imageUrl),
        footerText: asText(metadata.source, '76 CAMP Database + Fallout Wiki'),
        fields: [
          { name: 'Category', value: `${asText(metadata.category)} › ${asText(metadata.subCategory)}`, inline: true },
          { name: 'Budget', value: metadata.budgetCost == null ? 'Unknown' : String(metadata.budgetCost), inline: true },
          { name: 'Plan', value: asText(metadata.plan, 'No plan required'), inline: false },
          ...(nullableText(metadata.sourceLabel) ? [{ name: 'Source', value: asText(metadata.sourceLabel), inline: false }] : []),
          ...(metadata.atomPrice == null ? [] : [{ name: 'Atomic Shop', value: `${metadata.atomPrice} Atoms${nullableText(metadata.atomBundle) ? ` (${metadata.atomBundle})` : ''}`, inline: true }]),
        ],
      };
    case 'minerva':
      return {
        title: `Minerva's Big Sale${metadata.isSuperSale === true ? ' — Super Sale' : ''}`,
        url: publicUrl(metadata.sourceUrl),
        color: CARD_COLORS.minerva,
        footerText: asText(metadata.sourceName, 'Fallout Builds'),
        fields: [
          { name: 'Status', value: metadata.isActive === true ? 'Active now' : 'Next sale', inline: true },
          { name: 'Location', value: asText(metadata.location), inline: true },
          { name: 'List', value: `#${asText(metadata.listNumber)}`, inline: true },
          { name: metadata.isActive === true ? 'Ends' : 'Starts', value: asText(metadata.isActive === true ? metadata.endUtc : metadata.startUtc), inline: false },
        ],
      };
    case 'nuke_codes':
      return {
        title: 'Fallout 76 Nuke Codes',
        color: CARD_COLORS.nuke_codes,
        footerText: 'Codes via NukaCrypt',
        fields: [
          { name: 'Alpha', value: asText(metadata.alpha), inline: true },
          { name: 'Bravo', value: asText(metadata.bravo), inline: true },
          { name: 'Charlie', value: asText(metadata.charlie), inline: true },
          ...(nullableText(metadata.validUntil) ? [{ name: 'Valid until', value: asText(metadata.validUntil), inline: false }] : []),
        ],
      };
    case 'server_status':
      return {
        title: 'Fallout 76 Server Status',
        color: CARD_COLORS.server_status,
        footerText: 'Source: Bethesda',
        fields: [
          { name: 'Status', value: asText(metadata.label), inline: true },
          { name: 'Checked', value: asText(metadata.checkedAt), inline: true },
        ],
      };
    default:
      return null;
  }
}
