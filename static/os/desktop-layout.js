const KEY = 'blackterm_desktop_positions_v3';
function readPositions() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function mountDesktopLayout(container) {
  const icons = [...container.querySelectorAll('.desktop-icon')];
  let positions = readPositions();
  let drag = null;
  let topIconZ = 10;
  const bounds = () => {
    const width = container.clientWidth || Math.max(240, window.innerWidth - 32);
    const columns = Math.max(2, Math.min(8, Math.floor(width / 120)));
    const height = Math.max(container.clientHeight || Math.max(220, window.innerHeight - 126), window.innerWidth <= 700 ? Math.ceil(icons.length / columns) * 108 + 20 : 0);
    container.style.setProperty('--desktop-board-height', `${height}px`);
    return { width, height };
  };
  const dimensions = el => ({ width: el.offsetWidth || 104, height: el.offsetHeight || 98 });
  const clamp = (value, limit) => Math.max(0, Math.min(Math.max(0, limit), value));
  const key = (el, i) => el.dataset.openApp || `file:${el.dataset.desktopFile || i}`;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(positions)); return true; } catch { return false; } }
  function place(el, x, y) {
    const area = bounds(), size = dimensions(el);
    el.style.left = `${clamp(x, area.width - size.width)}px`;
    el.style.top = `${clamp(y, area.height - size.height)}px`;
  }
  function remember(el, id) {
    const area = bounds(), size = dimensions(el);
    positions[id] = { z: Number(el.style.zIndex) || 10, x: parseFloat(el.style.left) / Math.max(1, area.width - size.width), y: parseFloat(el.style.top) / Math.max(1, area.height - size.height) };
    const saved = save();
    document.querySelector('#desktop-layout-status')?.replaceChildren(document.createTextNode(saved ? 'Desktop layout saved' : 'Moved for this session · browser storage unavailable'));
  }
  function layout() {
    const area = bounds();
    const columns = Math.max(2, Math.min(8, Math.floor(area.width / 120)));
    const rows = Math.ceil(icons.length / columns);
    const gapX = Math.min(124, area.width / columns);
    const gapY = Math.min(116, Math.max(70, area.height / Math.max(rows, 1)));
    const startX = Math.max(0, (area.width - columns * gapX) / 2);
    const startY = Math.max(0, Math.min(80, (area.height - rows * gapY) / 3));
    icons.forEach((el, i) => {
      const stored = positions[key(el, i)];
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
        const size = dimensions(el);
        el.style.zIndex = String(Number.isFinite(stored.z) ? Math.max(1, Math.min(10000, stored.z)) : 1);
        topIconZ = Math.max(topIconZ, Number(el.style.zIndex));
        place(el, stored.x * (area.width - size.width), stored.y * (area.height - size.height));
      } else place(el, startX + (i % columns) * gapX, startY + Math.floor(i / columns) * gapY);
    });
  }
  icons.forEach((el, i) => {
    const id = key(el, i);
    el.dataset.desktopKey = id;
    el.draggable = false;
    el.title = `${el.querySelector('strong')?.textContent || 'App'} · drag to move · Alt + arrow keys to move`;
    el.addEventListener('dragstart', event => event.preventDefault());
    el.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !document.querySelector('#desktop').classList.contains('os-ready')) return;
      el.style.zIndex = String(++topIconZ);
      drag = { el, id, pointer: event.pointerId, x: event.clientX, y: event.clientY, left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0, moved: false };
      el.setPointerCapture(event.pointerId);
    });
    el.addEventListener('pointermove', event => {
      if (!drag || drag.el !== el || drag.pointer !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      el.classList.add('icon-moving');
      el.dataset.suppressOpen = 'true';
      place(el, drag.left + dx, drag.top + dy);
    });
    function finish(event) {
      if (!drag || drag.el !== el || drag.pointer !== event.pointerId) return;
      if (drag.moved) { remember(el, id); setTimeout(() => delete el.dataset.suppressOpen, 350); }
      el.classList.remove('icon-moving');
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
      drag = null;
    }
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
    el.addEventListener('lostpointercapture', finish);
    el.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      el.style.zIndex = String(++topIconZ);
      const step = event.shiftKey ? 40 : 12;
      place(el, (parseFloat(el.style.left) || 0) + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), (parseFloat(el.style.top) || 0) + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
      remember(el, id);
    });
  });
  window.addEventListener('resize', layout);
  document.addEventListener('blackterm:arrange-desktop', () => { positions = {}; icons.forEach(el => el.style.zIndex = "1"); topIconZ = 10; save(); layout(); });
  layout();
  return { layout };
}
