import type { AnchorHTMLAttributes, MouseEvent } from 'react';

type OAuthStartLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

/**
 * Adds a client-only cache buster to an OAuth start URL. The value is not an
 * OAuth credential: the backend still generates, stores, and validates the
 * single-use CSRF `state` value.
 */
export function withOAuthAttempt(href: string, attempt: string = globalThis.crypto.randomUUID()): string {
  const url = new URL(href, window.location.origin);
  url.searchParams.set('attempt', attempt);
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Keep the declarative href as a no-JavaScript fallback, but replace it just
 * before navigation. This prevents a browser from replaying an old cached 302
 * whose OAuth state has already been consumed or expired.
 */
export default function OAuthStartLink({ href, onClick, ...props }: OAuthStartLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!event.defaultPrevented) {
      event.currentTarget.setAttribute('href', withOAuthAttempt(href));
    }
    onClick?.(event);
  }

  return <a {...props} href={href} onClick={handleClick} />;
}
