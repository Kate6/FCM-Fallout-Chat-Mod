/**
 * Break a private Discord response into message-sized pages without dropping
 * command lines. Discord allows 2,000 characters; callers retain a small
 * margin for compatibility with downstream formatting.
 */
export function splitDiscordResponse(value: string, limit = 1_900): string[] {
  const pages: string[] = [];
  let remaining = value;
  while (remaining.length > limit) {
    const lineBreak = remaining.lastIndexOf('\n', limit);
    const end = lineBreak > 0 ? lineBreak : limit;
    pages.push(remaining.slice(0, end));
    remaining = remaining.slice(lineBreak > 0 ? end + 1 : end);
  }
  if (remaining) pages.push(remaining);
  return pages;
}
