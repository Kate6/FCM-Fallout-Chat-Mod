import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OAuthStartLink, { withOAuthAttempt } from '../OAuthStartLink';

describe('withOAuthAttempt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a fresh attempt without changing the intended OAuth route', () => {
    expect(withOAuthAttempt('/auth/discord?intent=link', 'first-attempt'))
      .toBe('/auth/discord?intent=link&attempt=first-attempt');
  });

  it('replaces an old attempt so each click gets a distinct URL', () => {
    expect(withOAuthAttempt('/auth/discord?intent=link&attempt=old', 'next-attempt'))
      .toBe('/auth/discord?intent=link&attempt=next-attempt');
  });

  it('refreshes the href before the browser follows the link', () => {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
    render(
      <OAuthStartLink href="/auth/discord?intent=link" onClick={(event) => event.preventDefault()}>
        Sign in
      </OAuthStartLink>,
    );

    const link = screen.getByRole('link', { name: 'Sign in' });
    fireEvent.click(link);

    expect(link).toHaveAttribute('href', '/auth/discord?intent=link&attempt=00000000-0000-4000-8000-000000000001');
  });
});
