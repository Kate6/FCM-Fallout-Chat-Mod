/**
 * Release-announcement copy + links (pure, unit-tested).
 *
 * Extracted from discordService so the target-specific role ping, env-aware
 * download links, and Nexus endorsement copy can be tested without loading
 * discord.js.
 * The download URLs come from the environment-aware `releaseDownloadUrls` module,
 * so dev/QA announcements link to the dev host instead of prod (where the dev
 * artifacts 404).
 */

import { MessageFlags, type MessageCreateOptions } from 'discord.js';
import {
  windowsZipUrl,
  linuxZipUrl,
  rawLinuxAppImageUrl,
  rawLinuxDebUrl,
} from './releaseDownloadUrls';

export interface HudModDownload {
  version: string;
  url: string;
}

export type ReleaseTarget = 'overlay' | 'hud' | 'both';

export type ReleaseNotificationRoles = {
  overlayRoleId?: string;
  hudRoleId?: string;
};

function validRoleId(roleId: string | undefined): roleId is string {
  return !!roleId && /^\d{17,20}$/.test(roleId);
}

/**
 * Build an explicit role-only mention allow-list. This intentionally never
 * enables Discord's broad @everyone or @here parsing.
 */
export function releaseAnnouncementMessage(
  target: ReleaseTarget,
  roles: ReleaseNotificationRoles,
  suppressNotifications = false,
): Pick<MessageCreateOptions, 'content' | 'allowedMentions' | 'flags'> {
  const roleIds = [
    ...(target === 'overlay' || target === 'both' ? [roles.overlayRoleId] : []),
    ...(target === 'hud' || target === 'both' ? [roles.hudRoleId] : []),
  ];
  if (roleIds.some((roleId) => !validRoleId(roleId))) {
    throw new Error(`Missing valid notification role ID for ${target} release announcement`);
  }
  const uniqueRoleIds = [...new Set(roleIds.filter(validRoleId))];
  const notificationOptions: Pick<MessageCreateOptions, 'flags'> = suppressNotifications
    ? { flags: MessageFlags.SuppressNotifications }
    : {};
  return {
    content: uniqueRoleIds.map((roleId) => `<@&${roleId}>`).join(' '),
    allowedMentions: { parse: [], roles: uniqueRoleIds },
    ...notificationOptions,
  };
}

export function releaseAnnouncementTitle(
  version: string,
  target: ReleaseTarget,
  hudMod?: HudModDownload,
): string {
  switch (target) {
    case 'overlay':
      return `Fallout Chat Mod Overlay Update v${version}`;
    case 'hud':
      return `Fallout Chat Mod HUD Mod Update v${hudMod?.version ?? version}`;
    case 'both':
      return `Fallout Chat Mod Overlay + HUD Mod Update v${version}`;
  }
}

/** FCM's Nexus Mods page (default); overridable so a different mod id can be set. */
export const DEFAULT_NEXUS_MOD_URL = 'https://www.nexusmods.com/fallout76/mods/4082';
export function nexusModUrl(): string {
  return process.env.NEXUS_MOD_URL || DEFAULT_NEXUS_MOD_URL;
}

/** The human "download page" link (prod default; a non-prod stack can override). */
export function downloadPageUrl(): string {
  return process.env.DOWNLOAD_PAGE_URL || 'https://falloutchatmod.com';
}

/** Embed "Download" field value — env-aware platform links + optional HUD package. */
export function releaseDownloadFieldValue(
  version: string,
  target: ReleaseTarget,
  hudMod?: HudModDownload,
  portableDownloadUrl?: string,
): string {
  const links: string[] = [];
  if (target === 'overlay' || target === 'both') {
    links.push(
      `🪟 [Windows](${windowsZipUrl(version)})`,
      ...(portableDownloadUrl ? [`[Windows Portable](${portableDownloadUrl})`] : []),
      `🐧 [Linux AppImage](${rawLinuxAppImageUrl(version)})`,
      `[Linux .deb](${rawLinuxDebUrl(version)})`,
      `[Linux ZIP + install docs](${linuxZipUrl(version)})`,
    );
  }
  if ((target === 'hud' || target === 'both') && hudMod) {
    links.push(`[FCM HUD Mod ZIP (ZFE / xScal) v${hudMod.version}](${hudMod.url})`);
  }
  links.push(`[Download page](${downloadPageUrl()})`);
  return links.join('  ·  ');
}

/** Embed "Endorse on Nexus" field value — encouragement + the download caveat. */
export function nexusEndorseFieldValue(): string {
  const url = nexusModUrl();
  return (
    `**Enjoying Fallout Chat Mod?** Please take a second to **[endorse it on Nexus](${url})** — ` +
    `endorsements are the single best way to help more Wastelanders find the mod, and it only takes one click. Thank you! ☢️\n\n` +
    `_Heads up — Nexus only lets you endorse after you've downloaded the mod from there at least once._`
  );
}
