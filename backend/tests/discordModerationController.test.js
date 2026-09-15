const embedService = {
  list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(),
  validateEmbed: jest.fn(), validateReactionRoles: jest.fn(), send: jest.fn(),
};
const listTextChannels = jest.fn();
const listAssignableRoles = jest.fn();
const reactionRoleService = { listPanels: jest.fn(), deletePanel: jest.fn() };

jest.mock('../src/config/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/services/autoModService', () => ({ resetCache: jest.fn(), invalidateSettingsCache: jest.fn() }));
jest.mock('../src/services/aiModerationService', () => ({ invalidateAiModerationCache: jest.fn() }));
jest.mock('../src/services/voiceService', () => ({ invalidateVoiceCache: jest.fn() }));
jest.mock('../src/services/discordService', () => ({ invalidateModLogCache: jest.fn() }));
jest.mock('../src/services/discordEmbedService', () => ({ __esModule: true, default: embedService }));
jest.mock('../src/services/discordContextService', () => ({ listTextChannels, listAssignableRoles }));
jest.mock('../src/services/reactionRoleService', () => ({ __esModule: true, default: reactionRoleService }));
jest.mock('../src/utils/resolveActorId', () => ({ resolveInternalActorId: jest.fn().mockResolvedValue('actor-id') }));

const controller = require('../src/controllers/moderationController');

function response() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

describe('Discord moderation controller contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    embedService.validateEmbed.mockReturnValue(null);
    embedService.validateReactionRoles.mockReturnValue({ error: null, mappings: [] });
  });

  it('preserves list/create/update/delete response contracts', async () => {
    const next = jest.fn();
    embedService.list.mockResolvedValue([{ id: 1, name: 'One' }]);
    embedService.create.mockResolvedValue({ id: 2, name: 'Two', data: { title: 'T' } });
    embedService.get.mockResolvedValue({ id: 2 });
    embedService.update.mockResolvedValue({ id: 2, name: 'Changed', data: { title: 'U' } });
    embedService.remove.mockResolvedValue(undefined);

    const listed = response();
    await controller.listDiscordEmbeds({}, listed, next);
    expect(listed.body).toEqual({ data: [{ id: 1, name: 'One' }] });

    const created = response();
    await controller.createDiscordEmbed({ body: { name: 'Two', data: { title: 'T' } } }, created, next);
    expect(created.statusCode).toBe(201);
    expect(created.body).toEqual({ data: { id: 2, name: 'Two', data: { title: 'T' } } });

    const updated = response();
    await controller.updateDiscordEmbed({ params: { id: '2' }, body: { name: 'Changed', data: { title: 'U' } } }, updated, next);
    expect(updated.body).toEqual({ data: { id: 2, name: 'Changed', data: { title: 'U' } } });

    const deleted = response();
    await controller.deleteDiscordEmbed({ params: { id: '2' } }, deleted, next);
    expect(deleted.body).toEqual({ data: { deleted: true } });
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves validation status and service delegation for sending', async () => {
    const invalidNext = jest.fn();
    embedService.validateEmbed.mockReturnValueOnce('bad embed');
    await controller.sendDiscordEmbed(
      { body: { channelId: '12345678901234567', embed: {} } }, response(), invalidNext,
    );
    expect(invalidNext.mock.calls[0][0]).toMatchObject({ status: 422, message: 'bad embed' });

    embedService.validateEmbed.mockReturnValue(null);
    embedService.send.mockResolvedValue({ sent: true, messageId: '22345678901234567', reactionRoles: 1 });
    const sent = response();
    const next = jest.fn();
    const body = {
      channelId: '12345678901234567', embed: { title: 'Roles' },
      reactionRoles: [{ emoji: '🎮', roleId: '32345678901234567' }],
    };
    await controller.sendDiscordEmbed({ body, adminUser: { id: 'admin' } }, sent, next);
    expect(embedService.send).toHaveBeenCalledWith({ ...body, actorId: 'actor-id' });
    expect(sent.body).toEqual({ data: { sent: true, messageId: '22345678901234567', reactionRoles: 1 } });
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves channel, role, and reaction-panel response contracts', async () => {
    listTextChannels.mockResolvedValue([{ id: 'c', name: 'general' }]);
    listAssignableRoles.mockResolvedValue([{ id: 'r', name: 'PC', color: 1 }]);
    reactionRoleService.listPanels.mockResolvedValue([{ messageId: 'm' }]);
    reactionRoleService.deletePanel.mockResolvedValue(true);
    const next = jest.fn();

    const channels = response();
    await controller.listDiscordChannels({}, channels, next);
    expect(channels.body).toEqual({ data: [{ id: 'c', name: 'general' }] });
    const roles = response();
    await controller.listDiscordRoles({}, roles, next);
    expect(roles.body).toEqual({ data: [{ id: 'r', name: 'PC', color: 1 }] });
    const panels = response();
    await controller.listReactionRolePanels({}, panels, next);
    expect(panels.body).toEqual({ data: [{ messageId: 'm' }] });
    const deleted = response();
    await controller.deleteReactionRolePanel({ params: { messageId: '12345678901234567' } }, deleted, next);
    expect(deleted.body).toEqual({ data: { deleted: true } });
  });
});
