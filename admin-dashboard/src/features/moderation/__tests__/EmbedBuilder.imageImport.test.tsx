import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiGet = vi.fn();
const apiPost = vi.fn();

vi.mock('../../../services/api', () => ({
  api: {
    get: (...args: unknown[]) => apiGet(...args),
    post: (...args: unknown[]) => apiPost(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../chat/EmojiPicker', () => ({ default: () => null }));

import EmbedBuilder from '../EmbedBuilder';

function renderBuilder() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmbedBuilder />
    </QueryClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('EmbedBuilder image imports', () => {
  beforeEach(() => {
    apiGet.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    ['author icon url', 'https://images.example/author.png?token=author-secret'],
    ['thumbnail url', 'https://images.example/thumb.png?token=thumb-secret'],
    ['image url', 'https://images.example/banner.png?token=image-secret'],
    ['footer icon url', 'https://images.example/footer.png?token=footer-secret'],
  ])('imports the %s and replaces only that field', async (label, sourceUrl) => {
    apiPost.mockResolvedValue({ publicUrl: 'https://falloutchatmod.com/embed-assets/id/digest.png' });
    renderBuilder();

    const target = screen.getByLabelText(new RegExp(`^${label}$`, 'i')) as HTMLInputElement;
    const otherLabel = label === 'author icon url' ? 'footer icon url' : 'author icon url';
    const otherImageUrl = screen.getByLabelText(new RegExp(`^${otherLabel}$`, 'i')) as HTMLInputElement;
    fireEvent.change(otherImageUrl, { target: { value: 'https://example.com/unchanged.png' } });
    fireEvent.change(target, { target: { value: sourceUrl } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Import ${label}$`, 'i') }));

    await waitFor(() => expect(target.value).toBe('https://falloutchatmod.com/embed-assets/id/digest.png'));
    expect(apiPost).toHaveBeenCalledWith('/api/moderation/discord-embed-assets/import', {
      sourceUrl,
      confirm: true,
    });
    expect(otherImageUrl.value).toBe('https://example.com/unchanged.png');
    expect(screen.getByRole('status').textContent).toMatch(/managed FCM URL/i);
  });

  it('shows progress, gives a safe actionable rejection, and permits retry', async () => {
    let rejectImport: ((reason: unknown) => void) | undefined;
    apiPost.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectImport = reject; }));
    renderBuilder();

    const sourceUrl = 'https://user:password@images.example/private.png?token=do-not-show';
    const input = screen.getByLabelText(/^image url$/i);
    fireEvent.change(input, { target: { value: sourceUrl } });
    fireEvent.click(screen.getByRole('button', { name: /import image url/i }));

    expect(await screen.findByText(/fetching and validating image/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /import image url/i })).toBeDisabled();
    rejectImport?.({ status: 422, message: `Rejected ${sourceUrl}` });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/not permitted/i);
    expect(alert.textContent).not.toContain('password');
    expect(alert.textContent).not.toContain('do-not-show');

    apiPost.mockResolvedValueOnce({ publicUrl: 'https://falloutchatmod.com/embed-assets/id/retry.png' });
    fireEvent.click(screen.getByRole('button', { name: /import image url/i }));
    await waitFor(() => expect((input as HTMLInputElement).value).toContain('/retry.png'));
    expect(apiPost).toHaveBeenCalledTimes(2);
  });

  it('keeps manual image URL entry and asks for a URL before importing', async () => {
    renderBuilder();
    const input = screen.getByLabelText(/^thumbnail url$/i) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'https://example.com/manual.png' } });
    expect(input.value).toBe('https://example.com/manual.png');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /import thumbnail url/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter a public HTTPS image URL first/i);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('does not apply a stale import after the image field is edited and locks publish actions while pending', async () => {
    const pending = deferred<{ publicUrl: string }>();
    apiPost.mockReturnValueOnce(pending.promise);
    renderBuilder();
    const input = screen.getByLabelText(/^image url$/i) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'https://images.example/first.png' } });
    fireEvent.click(screen.getByRole('button', { name: /import image url/i }));
    expect(screen.getByRole('button', { name: /send to discord/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /save template/i })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'https://images.example/newer.png' } });
    pending.resolve({ publicUrl: 'https://falloutchatmod.com/embed-assets/id/stale.png' });

    await waitFor(() => expect(input.value).toBe('https://images.example/newer.png'));
    expect(screen.queryByText(/managed FCM URL/i)).toBeNull();
    expect(screen.getByRole('button', { name: /send to discord/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /save template/i })).not.toBeDisabled();
  });

  it('invalidates a pending import when NEW EMBED resets the editor', async () => {
    const pending = deferred<{ publicUrl: string }>();
    apiPost.mockReturnValueOnce(pending.promise);
    renderBuilder();
    const input = screen.getByLabelText(/^thumbnail url$/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://images.example/pending.png' } });
    fireEvent.click(screen.getByRole('button', { name: /import thumbnail url/i }));

    fireEvent.click(screen.getByRole('button', { name: /new embed/i }));
    pending.resolve({ publicUrl: 'https://falloutchatmod.com/embed-assets/id/stale.png' });

    await waitFor(() => expect(input.value).toBe(''));
    expect(screen.queryByText(/managed FCM URL/i)).toBeNull();
    expect(screen.queryByText(/fetching and validating/i)).toBeNull();
  });

  it('invalidates a pending import when another template is loaded', async () => {
    apiGet.mockImplementation((path: string) => Promise.resolve(path === '/api/moderation/discord-embeds'
      ? [{ id: 7, name: 'Loaded template', data: { imageUrl: 'https://example.com/template.png' } }]
      : []));
    const pending = deferred<{ publicUrl: string }>();
    apiPost.mockReturnValueOnce(pending.promise);
    renderBuilder();
    const input = screen.getByLabelText(/^image url$/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://images.example/pending.png' } });
    fireEvent.click(screen.getByRole('button', { name: /import image url/i }));

    fireEvent.click(await screen.findByRole('button', { name: /^load$/i }));
    pending.resolve({ publicUrl: 'https://falloutchatmod.com/embed-assets/id/stale.png' });

    await waitFor(() => expect(input.value).toBe('https://example.com/template.png'));
    expect(screen.queryByText(/managed FCM URL/i)).toBeNull();
    expect(screen.queryByText(/fetching and validating/i)).toBeNull();
  });
});
