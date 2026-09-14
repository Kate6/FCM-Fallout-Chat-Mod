const send = jest.fn();
class Command { constructor(input) { this.input = input; } }
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send })),
  PutObjectCommand: Command,
  HeadBucketCommand: Command,
  CreateBucketCommand: Command,
  GetObjectCommand: Command,
  DeleteObjectCommand: Command,
}));

const { deleteEmbedAsset, uploadEmbedAsset } = require('../src/config/storage');

describe('embed asset storage deletion', () => {
  beforeEach(() => send.mockReset().mockResolvedValue({}));

  it('deletes only a validated content-addressed key', async () => {
    const key = `embed-assets/${'a'.repeat(64)}.png`;
    await deleteEmbedAsset(key);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ Key: key }) }));
  });

  it.each(['embed-assets/../../secret', `embed-assets/${'a'.repeat(64)}.svg`, 'party-images/a.png'])
    ('rejects unsafe key %s', async key => {
      await expect(deleteEmbedAsset(key)).rejects.toThrow('Invalid embed asset object key');
      expect(send).not.toHaveBeenCalled();
    });

  it('uses an If-None-Match create-only PUT and reports ownership', async () => {
    const key = `embed-assets/${'b'.repeat(64)}.png`;
    await expect(uploadEmbedAsset(key, Buffer.from('png'), 'image/png')).resolves.toBe(true);
    expect(send.mock.calls[0][0].input).toMatchObject({ Key: key, IfNoneMatch: '*' });
  });

  it.each([
    Object.assign(new Error('exists'), { name: 'PreconditionFailed' }),
    { $metadata: { httpStatusCode: 412 } },
  ])('treats an object-store precondition failure as an idempotent existing object', async error => {
    send.mockRejectedValueOnce(error);
    const key = `embed-assets/${'c'.repeat(64)}.gif`;
    await expect(uploadEmbedAsset(key, Buffer.from('gif'), 'image/gif')).resolves.toBe(false);
  });
});
