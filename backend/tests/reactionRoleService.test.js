const prisma = {
  reactionRolePanel: {
    upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn(),
  },
};
jest.mock('../src/config/prisma', () => ({ __esModule: true, default: prisma }));
const service = require('../src/services/reactionRoleService');

describe('reactionRoleService strict panel creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.reactionRolePanel.upsert.mockResolvedValue({});
    prisma.reactionRolePanel.deleteMany.mockResolvedValue({ count: 1 });
  });

  function message(react) {
    return {
      id: '44444444444444444', channelId: '11111111111111111', guildId: '55555555555555555',
      react, reactions: { removeAll: jest.fn().mockResolvedValue(undefined) },
    };
  }

  it('persists only a panel whose every reaction Discord accepts', async () => {
    const msg = message(jest.fn().mockResolvedValue({}));
    await expect(service.createPanel(msg, [
      { emoji: '🎮', matchKey: '🎮', reactValue: '🎮', roleId: '22222222222222222' },
      { emoji: '✅', matchKey: '✅', reactValue: '✅', roleId: '33333333333333333' },
    ])).resolves.toBeUndefined();
    expect(msg.react).toHaveBeenCalledTimes(2);
    expect(prisma.reactionRolePanel.deleteMany).not.toHaveBeenCalled();
  });

  it('treats invalid or deleted emoji rejection as failure and rolls back storage and reactions', async () => {
    const msg = message(jest.fn().mockRejectedValueOnce(new Error('Unknown Emoji')));
    await expect(service.createPanel(msg, [
      { emoji: 'notemoji', matchKey: 'notemoji', reactValue: 'notemoji', roleId: '22222222222222222' },
    ])).rejects.toMatchObject({ name: 'ReactionRolePanelError', causeClass: 'Error' });
    expect(prisma.reactionRolePanel.deleteMany).toHaveBeenCalledWith({ where: { messageId: msg.id } });
    expect(msg.reactions.removeAll).toHaveBeenCalledTimes(1);
  });

  it('rolls back previously accepted reactions when a later reaction fails', async () => {
    const msg = message(jest.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new TypeError('deleted custom emoji')));
    await expect(service.createPanel(msg, [
      { emoji: '🎮', matchKey: '🎮', reactValue: '🎮', roleId: '22222222222222222' },
      { emoji: '<:gone:33333333333333333>', matchKey: '33333333333333333', reactValue: 'gone:33333333333333333', roleId: '44444444444444444' },
    ])).rejects.toMatchObject({ name: 'ReactionRolePanelError', causeClass: 'TypeError' });
    expect(msg.react).toHaveBeenCalledTimes(2);
    expect(prisma.reactionRolePanel.deleteMany).toHaveBeenCalledTimes(1);
    expect(msg.reactions.removeAll).toHaveBeenCalledTimes(1);
  });
});
