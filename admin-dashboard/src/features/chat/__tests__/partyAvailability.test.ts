import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { loadPartyDirectory, readPublicPartyDirectory, partyRecoveryInterval } from '../partyAvailability';

describe('Party availability recovery', () => {
  it.each([401, 403, 429, 500, 503])('does not disable Party on HTTP %i', async status => {
    const error = Object.assign(new Error('temporary'), { status });
    await expect(loadPartyDirectory(() => Promise.reject(error))).rejects.toBe(error);
    await expect(readPublicPartyDirectory(new Response('', { status }))).rejects.toMatchObject({ status });
  });
  it('disables only for an explicit missing endpoint, including the public endpoint', async () => {
    await expect(loadPartyDirectory(() => readPublicPartyDirectory(new Response('', { status: 404 })))).resolves.toBeNull();
  });
  it.each([null, {}, { parties: null }, '<html>error</html>'])('keeps malformed success responses retryable: %j', async value => {
    await expect(loadPartyDirectory(async () => value)).rejects.toThrow('Invalid party');
  });
  it('recovers after network failure using the real query cache, without caching a disabled feature', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    try {
      const options = { queryKey: ['parties', 'test-account'] };
      await expect(client.fetchQuery({ ...options, queryFn: () => loadPartyDirectory(() => Promise.reject(new TypeError('offline'))) })).rejects.toThrow('offline');
      expect(client.getQueryData(options.queryKey)).toBeUndefined();
      expect(partyRecoveryInterval(client.getQueryState(options.queryKey)!.status)).toBe(30_000);
      await expect(client.fetchQuery({ ...options, queryFn: () => loadPartyDirectory(async () => ({ parties: [{ id: 'public-party' }] })) })).resolves.toEqual({ parties: [{ id: 'public-party' }] });
      expect(partyRecoveryInterval(client.getQueryState(options.queryKey)!.status)).toBe(false);
    } finally { client.clear(); }
  });
  it('reads only returned public data and does not request private parties', async () => {
    await expect(readPublicPartyDirectory(new Response(JSON.stringify({ data: { parties: [] } })))).resolves.toEqual({ parties: [] });
  });
});
