/**
 * Unit tests for releaseAnnouncement.ts — target-specific opt-in role pings,
 * env-aware download links, and the Nexus endorsement copy used in the Discord
 * release announcement.
 */

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_NEXUS_MOD_URL,
  nexusModUrl,
  downloadPageUrl,
  releaseDownloadFieldValue,
  nexusEndorseFieldValue,
  releaseAnnouncementMessage,
  releaseAnnouncementTitle,
} from '../releaseAnnouncement';

describe('releaseAnnouncement', () => {
  const orig = {
    NEXUS_MOD_URL: process.env.NEXUS_MOD_URL,
    DOWNLOAD_PAGE_URL: process.env.DOWNLOAD_PAGE_URL,
    RELEASE_DOWNLOAD_HOST: process.env.RELEASE_DOWNLOAD_HOST,
  };
  afterEach(() => {
    for (const k of Object.keys(orig) as (keyof typeof orig)[]) {
      if (orig[k] === undefined) delete process.env[k];
      else process.env[k] = orig[k];
    }
  });

  test('overlay release pings only the overlay notification role', () => {
    assert.deepEqual(releaseAnnouncementMessage('overlay', {
      overlayRoleId: '1548813456684355614',
      hudRoleId: '1549274868120424479',
    }), {
      content: '<@&1548813456684355614>',
      allowedMentions: { parse: [], roles: ['1548813456684355614'] },
    });
  });

  test('combined release pings both opt-in notification roles and supports silent delivery', () => {
    assert.deepEqual(releaseAnnouncementMessage('both', {
      overlayRoleId: '1548813456684355614',
      hudRoleId: '1549274868120424479',
    }, true), {
      content: '<@&1548813456684355614> <@&1549274868120424479>',
      allowedMentions: { parse: [], roles: ['1548813456684355614', '1549274868120424479'] },
      flags: 4096,
    });
  });

  test('fails closed when a selected release target lacks its notification role', () => {
    assert.throws(() => releaseAnnouncementMessage('hud', { overlayRoleId: '1548813456684355614' }));
  });

  test('uses a target-specific title', () => {
    assert.equal(releaseAnnouncementTitle('1.3.99', 'overlay'), 'Fallout Chat Mod Overlay Update v1.3.99');
    assert.equal(releaseAnnouncementTitle('1.3.99', 'hud', { version: '2.10.9', url: 'https://example.test/hud.zip' }), 'Fallout Chat Mod HUD Mod Update v2.10.9');
    assert.equal(releaseAnnouncementTitle('1.3.99', 'both'), 'Fallout Chat Mod Overlay + HUD Mod Update v1.3.99');
  });

  describe('nexusModUrl', () => {
    test('defaults to the FCM Nexus page', () => {
      delete process.env.NEXUS_MOD_URL;
      assert.equal(nexusModUrl(), DEFAULT_NEXUS_MOD_URL);
      assert.ok(nexusModUrl().includes('nexusmods.com/fallout76/mods/4082'));
    });
    test('honours NEXUS_MOD_URL override', () => {
      process.env.NEXUS_MOD_URL = 'https://www.nexusmods.com/fallout76/mods/9999';
      assert.equal(nexusModUrl(), 'https://www.nexusmods.com/fallout76/mods/9999');
    });
  });

  describe('downloadPageUrl', () => {
    test('defaults to prod, overridable per environment', () => {
      delete process.env.DOWNLOAD_PAGE_URL;
      assert.equal(downloadPageUrl(), 'https://falloutchatmod.com');
      process.env.DOWNLOAD_PAGE_URL = 'https://dev.falloutchatmod.com';
      assert.equal(downloadPageUrl(), 'https://dev.falloutchatmod.com');
    });
  });

  describe('releaseDownloadFieldValue (env-aware platform links — the prod-404 fix)', () => {
    test('uses the configured host for Windows, both Linux packages, and the Linux ZIP', () => {
      process.env.RELEASE_DOWNLOAD_HOST = 'dev.falloutchatmod.com';
      const v = releaseDownloadFieldValue('1.3.91-dev', 'overlay');
      assert.ok(v.includes('🪟 [Windows](https://dev.falloutchatmod.com/downloads/electron/Fallout%20Chat%20Mod%20Setup%201.3.91-dev%20(Windows).zip)'));
      assert.ok(v.includes('🐧 [Linux AppImage](https://dev.falloutchatmod.com/downloads/electron/Fallout%20Chat%20Mod-1.3.91-dev.AppImage)'));
      assert.ok(v.includes('[Linux .deb](https://dev.falloutchatmod.com/downloads/electron/Fallout%20Chat%20Mod-1.3.91-dev.deb)'));
      assert.ok(v.includes('[Linux ZIP + install docs](https://dev.falloutchatmod.com/downloads/electron/Fallout%20Chat%20Mod-1.3.91-dev.AppImage%20(Linux).zip)'));
    });
    test('defaults to the prod host when RELEASE_DOWNLOAD_HOST is unset', () => {
      delete process.env.RELEASE_DOWNLOAD_HOST;
      const v = releaseDownloadFieldValue('1.2.3', 'overlay');
      // Assert the exact prod links rather than a bare host substring — a bare
      // `includes('host')` trips CodeQL's incomplete-url-substring-sanitization
      // and proves nothing about the host. The full prod URLs exclude the dev host.
      assert.ok(v.includes('🪟 [Windows](https://falloutchatmod.com/downloads/electron/Fallout%20Chat%20Mod%20Setup%201.2.3%20(Windows).zip)'));
      assert.ok(v.includes('🐧 [Linux AppImage](https://falloutchatmod.com/downloads/electron/Fallout%20Chat%20Mod-1.2.3.AppImage)'));
      assert.ok(v.includes('[Linux .deb](https://falloutchatmod.com/downloads/electron/Fallout%20Chat%20Mod-1.2.3.deb)'));
      assert.ok(v.includes('[Linux ZIP + install docs](https://falloutchatmod.com/downloads/electron/Fallout%20Chat%20Mod-1.2.3.AppImage%20(Linux).zip)'));
    });

    test('includes the target HUD package when release metadata provides one', () => {
      process.env.RELEASE_DOWNLOAD_HOST = 'dev.falloutchatmod.com';
      const v = releaseDownloadFieldValue('1.3.91-dev', 'both', {
        version: '2.10.8',
        url: 'https://dev.falloutchatmod.com/downloads/electron/ZFE%20FCM%20HUD%20Mod-2.10.8%20(DEV).zip',
      });
      assert.ok(v.includes('[FCM HUD Mod ZIP (ZFE / xScal) v2.10.8](https://dev.falloutchatmod.com/downloads/electron/ZFE%20FCM%20HUD%20Mod-2.10.8%20(DEV).zip)'));
    });

    test('HUD-only release exposes the HUD package without overlay installers', () => {
      const v = releaseDownloadFieldValue('1.3.91-dev', 'hud', {
        version: '2.10.8',
        url: 'https://dev.falloutchatmod.com/downloads/electron/ZFE%20FCM%20HUD%20Mod-2.10.8%20(DEV).zip',
      });
      assert.ok(v.includes('FCM HUD Mod ZIP'));
      assert.ok(!v.includes('[Windows]('));
    });
  });

  describe('nexusEndorseFieldValue', () => {
    test('has the endorse link, the encouragement, and the download caveat', () => {
      delete process.env.NEXUS_MOD_URL;
      const v = nexusEndorseFieldValue();
      assert.ok(v.includes('[endorse it on Nexus](https://www.nexusmods.com/fallout76/mods/4082)'));
      assert.ok(v.includes('Enjoying Fallout Chat Mod?'));
      assert.ok(v.includes('downloaded the mod from there at least once'));
      // the "grab it on Nexus first, then hit Endorse" tail was dropped per request
      assert.ok(!v.includes('grab it on Nexus first'));
    });
  });
});
