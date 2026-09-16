// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, getByRole } from '@testing-library/dom';
import { createFontPicker } from '../font-picker';

afterEach(() => document.body.replaceChildren());
describe('font picker', () => {
  it('supports keyboard selection and returns focus to its trigger', () => {
    const changed = vi.fn();
    const picker = createFontPicker('theme', 'system-ui', changed);
    document.body.append(picker);
    const button = getByRole(picker, 'button', { name: 'Chat font' });
    button.focus();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Theme default');
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement?.textContent).toBe('Monospace');
    fireEvent.click(document.activeElement!);
    expect(changed).toHaveBeenCalledWith('mono');
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(picker.querySelector('[aria-label="Font preview"]')?.getAttribute('style')).toContain('Courier');
  });

  it('Escape closes without changing the preference', () => {
    const changed = vi.fn();
    const picker = createFontPicker('verdana', 'system-ui', changed);
    document.body.append(picker);
    fireEvent.click(getByRole(picker, 'button', { name: 'Chat font' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(changed).not.toHaveBeenCalled();
    expect(getByRole(picker, 'button', { name: 'Chat font' }).getAttribute('aria-expanded')).toBe('false');
  });
});
