import { FONT_OPTIONS, FONT_SAMPLE, normalizeFontId, resolveFontFamily, type FontId } from '../../admin-dashboard/src/features/chat/overlayFonts';

/** A DOM popover: native select menus can disappear in transparent Electron windows. */
export function createFontPicker(value: unknown, themeFamily: string, onChange: (id: FontId) => void) {
  let selected = normalizeFontId(value);
  const root = document.createElement('div');
  root.className = 'ss-select';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ss-select-btn';
  button.setAttribute('aria-label', 'Chat font');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const list = document.createElement('div');
  list.className = 'ss-select-pop';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Chat font choices');
  const preview = document.createElement('div');
  preview.className = 'ss-note';
  preview.setAttribute('aria-label', 'Font preview');
  preview.textContent = FONT_SAMPLE;
  preview.style.cssText = 'font-size:14px;line-height:1.5;opacity:1';
  const options = FONT_OPTIONS.map(font => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'ss-select-item';
    option.setAttribute('role', 'option');
    option.textContent = font.label;
    option.style.cssText = 'display:block;width:100%;border:0;text-align:left;color:inherit;background:transparent;cursor:pointer;font:inherit';
    option.addEventListener('click', () => {
      selected = font.id;
      paint();
      close(true);
      onChange(selected);
    });
    list.append(option);
    return option;
  });
  function paint() {
    button.textContent = `${FONT_OPTIONS.find(font => font.id === selected)?.label} ▾`;
    preview.style.fontFamily = selected === 'theme' ? 'var(--shell-font)' : resolveFontFamily(selected, themeFamily);
    options.forEach((option, index) => option.setAttribute('aria-selected', String(FONT_OPTIONS[index].id === selected)));
  }
  function close(focus: boolean) {
    list.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus();
  }
  function open() {
    list.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    options[FONT_OPTIONS.findIndex(font => font.id === selected)].focus();
  }
  button.addEventListener('click', () => list.classList.contains('open') ? close(false) : open());
  button.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); event.stopPropagation(); open(); }
  });
  root.addEventListener('keydown', event => {
    if (!list.classList.contains('open')) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === 'Tab') close(false);
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const index = options.findIndex(option => option === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      options[next].focus();
    }
  });
  root.addEventListener('focusout', event => {
    if (!(event.relatedTarget instanceof Node) || !root.contains(event.relatedTarget)) close(false);
  });
  root.append(button, list, preview);
  paint();
  return root;
}
