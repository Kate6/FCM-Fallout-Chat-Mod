import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import EmojiPicker from '../EmojiPicker';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('uses a dedicated color-emoji font for Unicode and recent cells, not the chat font', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(['😀']) });
  try {
    render(<QueryClientProvider client={client}><EmojiPicker
      primaryColor="#ffffff" chromeColor="#000000" inputBgColor="#000000"
      fontFamily="Fallout Test Font" fontSize={14} hexAlpha={() => '#ffffff'}
      hexToRgba={() => '#000000'} glowEnabled={false} onInsert={() => {}} onClose={() => {}}
    /></QueryClientProvider>);
    const glyphs = await screen.findAllByText('😀');
    expect(glyphs.length).toBeGreaterThanOrEqual(2);
    for (const glyph of glyphs) {
      expect(glyph.style.fontFamily).toContain('Segoe UI Emoji');
      expect(glyph.style.fontFamily).toContain('Noto Color Emoji');
      expect(glyph.style.fontFamily).not.toContain('Fallout Test Font');
    }
  } finally {
    cleanup();
    client.clear();
  }
});
