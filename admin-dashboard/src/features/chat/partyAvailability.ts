/** Only an explicit missing endpoint disables Party. Auth/network/server failures
 * remain retryable: they are not evidence that the feature was removed. */
export async function loadPartyDirectory<T>(load: () => Promise<unknown>): Promise<{ parties: T[] } | null> {
  try {
    const data = await load();
    if (!data || typeof data !== 'object' || !('parties' in data) || !Array.isArray(data.parties)) {
      throw new Error('Invalid party directory response');
    }
    return { parties: data.parties as T[] };
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) return null;
    throw error;
  }
}

export async function readPublicPartyDirectory(response: Response): Promise<unknown> {
  if (!response.ok) throw Object.assign(new Error('Party directory request failed'), { status: response.status });
  const body: unknown = await response.json();
  return body && typeof body === 'object' && 'data' in body ? body.data : body;
}

export function partyRecoveryInterval(status: string): number | false {
  return status === 'error' ? 30_000 : false;
}
