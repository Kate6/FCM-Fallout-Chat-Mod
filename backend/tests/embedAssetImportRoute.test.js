const assetService = {
  EmbedAssetError: class EmbedAssetError extends Error { constructor(message, status = 422) { super(message); this.status = status; } },
  importEmbedAsset: jest.fn(),
};
jest.mock('../src/services/embedAssetService', () => assetService);

const router = require('../src/routes/moderation');

function routeHandlers(path) {
  const layer = router.stack.find(item => item.route?.path === path);
  if (!layer) throw new Error(`missing route ${path}`);
  return layer.route.stack.map(item => item.handle);
}

describe('POST /api/moderation/discord-embed-assets/import route', () => {
  const [authorize, controller] = routeHandlers('/discord-embed-assets/import');

  beforeEach(() => {
    assetService.importEmbedAsset.mockReset();
  });

  it('rejects an unauthenticated request at the real role middleware', async () => {
    const next = jest.fn();
    await authorize({ headers: {}, session: {} }, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({ status: 401 });
    expect(assetService.importEmbedAsset).not.toHaveBeenCalled();
  });

  it('returns the imported asset envelope and records the Discord actor', async () => {
    const asset = { id: 'asset-id', publicUrl: 'https://falloutchatmod.com/embed-assets/id/hash.png' };
    assetService.importEmbedAsset.mockResolvedValue(asset);
    const req = { body: { sourceUrl: 'https://images.example/image.png', confirm: true }, session: { discordUser: { id: 'discord-actor' } } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await controller(req, res, next);
    expect(assetService.importEmbedAsset).toHaveBeenCalledWith(req.body.sourceUrl, 'discord-actor');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ data: asset });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects missing confirmation before fetching or storing the image', async () => {
    const req = { body: { sourceUrl: 'https://images.example/image.png' }, session: { discordUser: { id: 'discord-actor' } } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await controller(req, res, next);

    expect(next.mock.calls[0][0]).toMatchObject({
      status: 400,
      message: 'confirm must be true to import an external image',
    });
    expect(assetService.importEmbedAsset).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
