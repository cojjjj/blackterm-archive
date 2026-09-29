const node = (tag, className, text) => Object.assign(document.createElement(tag), { className: className || '', textContent: text || '' });
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
const preferences = read('blackterm_display_v2', { theme: 'violet', calm: false });
function applyPreferences() {
  document.documentElement.dataset.archiveTheme = preferences.theme;
  document.documentElement.classList.toggle('archive-calm', preferences.calm);
}
applyPreferences();
export function installControlRoom({ apps, manager, api }) {
  const originalOpen = apps.open.bind(apps);
  apps.open = id => Promise.resolve().then(() => originalOpen(id)).catch(error => {
    const content = node('div', 'control-room', error.message || 'Unable to open application. Please retry.');
    manager.open({ id: 'launch-error', title: 'Transmission interrupted', content, width: 460, height: 240 });
  });
  const launch = id => apps.open(id);
  const button = (label, action, className = 'room-button') => {
    const el = node('button', className, label); el.type = 'button'; el.addEventListener('click', action); return el;
  };
  const panel = (eyebrow, title, detail) => {
    const el = node('section', 'control-room');
    el.append(node('p', 'room-eyebrow', eyebrow), node('h1', '', title), node('p', 'room-description', detail));
    return el;
  };
  apps.register('mission', { open: () => {
    const shell = panel('OBSERVER OPERATIONS / 01', 'Follow the signal.', 'Your recovered intelligence, open leads, and next steps in one place.');
    const metrics = node('div', 'room-metrics');
    const leads = node('div', 'room-leads');
    const status = node('p', 'room-status', 'Synchronizing Archive intelligence…');
    const actions = node('div', 'room-actions');
    actions.append(button('Open Archive →', () => launch('archive')), button('Launch terminal', () => launch('terminal')), button('Investigation notes', () => launch('notebook')));
    const refresh = button('Refresh intelligence ↻', load);
    shell.append(metrics, actions, node('h2', '', 'Available leads'), leads, status, refresh);
    const record = manager.open({ id: 'mission', title: 'Mission Control', content: shell, width: 850, height: 650 });
    if (record.body.firstElementChild !== shell) return record;
    async function load() {
      refresh.disabled = true; status.textContent = 'Synchronizing…';
      try {
        const [me, challenges, system] = await Promise.all([api('/api/me'), api('/api/challenges'), api('/api/system/status')]);
        metrics.replaceChildren();
        for (const [label, value] of [['IDENTITY', me.codename], ['DECODED', `${me.solved} / ${me.total}`], ['PROGRESS', `${me.progress}%`]]) {
          const card = node('div', 'room-metric'); card.append(node('small', '', label), node('strong', '', value)); metrics.append(card);
        }
        leads.replaceChildren();
        for (const challenge of challenges.filter(c => !c.solved)) {
          const row = node('div', 'room-lead');
          row.append(node('span', 'lead-id', challenge.id), node('strong', '', challenge.title || challenge.name || 'Unresolved signal'), button('Investigate →', () => launch('archive'))); leads.append(row);
        }
        if (!leads.children.length) leads.append(node('p', 'room-description', 'All available signals decoded. Open the Generator for a new investigation.'));
        status.textContent = system.progress_persistent ? 'Archive connected · progress stored on this server.' : 'Archive connected · server progress is temporary on this deployment. Notebook saves in this browser; export a backup.';
      } catch (error) { status.textContent = `${error.message} Use Refresh intelligence to reconnect.`; }
      finally { refresh.disabled = false; }
    }
    load(); return record;
  }});
  apps.register('notebook', { open: () => {
    const shell = panel('PERSONAL EVIDENCE / LOCAL', 'Connect the fragments.', 'Keep hypotheses, decoded fragments, and next steps. Saved in this browser.');
    const editor = node('textarea', 'room-notebook'); editor.setAttribute('aria-label', 'Investigation notes'); editor.placeholder = 'CASE / SIGNAL\n\nEvidence:\n\nHypothesis:\n\nNext step:';
    editor.value = read('blackterm_notebook_v2', ''); editor.maxLength = 200000;
    const status = node('p', 'room-status', 'Ready · browser notebook');
    editor.addEventListener('input', () => { status.textContent = write('blackterm_notebook_v2', editor.value) ? 'Saved in this browser.' : 'Could not save. Export your notes before closing.'; });
    const actions = node('div', 'room-actions');
    actions.append(button('Export notes ↓', () => {
      const url = URL.createObjectURL(new Blob([editor.value], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'blackterm-investigation-notes.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    const label = node('label', 'room-button', 'Import notes ↑'); const input = document.createElement('input'); input.type = 'file'; input.accept = '.txt,.md'; input.hidden = true;
    input.addEventListener('change', async () => {
      const file = input.files[0]; if (!file) return;
      if (file.size > 200000) { status.textContent = 'Choose a text file smaller than 200 KB.'; return; }
      try {
        const text = await file.text();
        if (editor.value && !confirm('Replace this notebook with the imported notes? Export a backup first if needed.')) return;
        editor.value = text; editor.dispatchEvent(new Event('input'));
      } catch { status.textContent = 'Unable to read the selected file.'; }
      finally { input.value = ''; }
    }); label.append(input); actions.append(label);
    shell.append(actions, editor, status); return manager.open({ id: 'notebook', title: 'Investigation Notebook', content: shell, width: 740, height: 600 });
  }});
  apps.register('settings', { open: () => {
    const shell = panel('WORKSTATION / PREFERENCES', 'Make it yours.', 'Display preferences save in this browser. Ctrl+K opens the app launcher.');
    const themes = node('div', 'room-actions');
    const status = node('p', 'room-status');
    function save() { applyPreferences(); status.textContent = write('blackterm_display_v2', preferences) ? 'Preferences saved.' : 'Applied for this session; browser storage unavailable.'; }
    for (const [id, name] of [['violet', 'Violet void'], ['emerald', 'Emerald signal'], ['ice', 'Arctic blue']]) themes.append(button(name, () => { preferences.theme = id; save(); }));
    const label = node('label', 'room-setting'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = preferences.calm; checkbox.addEventListener('change', () => { preferences.calm = checkbox.checked; save(); }); label.append(checkbox, node('span', '', 'Quiet display — reduce motion, scanner effects, and ambient alerts'));
    shell.append(themes, label, button('Arrange desktop icons', () => { document.dispatchEvent(new CustomEvent('blackterm:arrange-desktop')); status.textContent = 'Desktop icons arranged.'; }), button('Bring windows back into view', () => { for (const record of manager.windows.values()) manager.clamp(record.element); status.textContent = 'Windows repositioned to fit your screen.'; }), node('p', 'room-description', 'Drag desktop icons anywhere; positions save in this browser. Alt + arrow keys moves a focused icon. Double-click a window title to maximize it. Escape closes the app launcher.'), status);
    return manager.open({ id: 'settings', title: 'Workstation Settings', content: shell, width: 660, height: 440 });
  }});
  const overlay = node('div', 'room-launcher hidden'); overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'App launcher');
  const card = node('div', 'launcher-card');
  const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Find an app or tool…'; search.setAttribute('aria-label', 'Search apps');
  const results = node('div', 'launcher-results');
  apps.register('recruitment', { open: () => {
    const frame = document.createElement('iframe');
    frame.src = '/recruitment'; frame.title = 'Developer Audition';
    frame.style.cssText = 'border:0;width:100%;height:100%;background:#0b0c16;';
    return manager.open({ id: 'recruitment', title: 'Developer Audition', content: frame, width: 1020, height: 740 });
  }});
  const labels = { recruitment: 'Developer Audition', mission: 'Mission Control', notebook: 'Investigation Notebook', settings: 'Workstation Settings', archive: 'Archive', terminal: 'Terminal', explorer: 'File Explorer', mail: 'Mail', processes: 'Process Monitor', relay: 'Relay Monitor', worldmap: 'World Map', knowledge: 'Knowledge Base', editor: 'Puzzle Editor', audio: 'Audio Console', images: 'Image Viewer', hex: 'Hex Viewer', logs: 'Logs', generator: 'Investigation Generator', search: 'Search Index' };
  let previousFocus, active = 0;
  function close() { overlay.classList.add('hidden'); previousFocus?.focus(); }
  function select(index) { const buttons = [...results.querySelectorAll('button')]; active = Math.max(0, Math.min(index, buttons.length - 1)); buttons.forEach((el, i) => el.classList.toggle('selected', i === active)); buttons[active]?.scrollIntoView({ block: 'nearest' }); }
  function render() {
    results.replaceChildren();
    for (const [id, label] of Object.entries(labels).filter(([id, label]) => apps.apps.has(id) && `${label} ${id}`.toLowerCase().includes(search.value.toLowerCase()))) results.append(button(label, () => { close(); launch(id); }, 'launcher-result'));
    if (!results.children.length) results.append(node('p', 'room-description', 'No apps found. Try “terminal” or “notes”.'));
    select(0);
  }
  function open() { if (!document.querySelector('#desktop').classList.contains('os-ready') || document.querySelector('#desktop').classList.contains('hidden')) return; previousFocus = document.activeElement; overlay.classList.remove('hidden'); search.value = ''; render(); search.focus(); }
  search.addEventListener('input', render);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); select(active + (e.key === 'ArrowDown' ? 1 : -1)); }
    if (e.key === 'Enter' && e.target === search) { e.preventDefault(); results.querySelectorAll('button')[active]?.click(); }
    if (e.key === 'Tab') {
      const focusable = [search, ...card.querySelectorAll('button')]; const index = focusable.indexOf(document.activeElement);
      e.preventDefault(); focusable[(index + (e.shiftKey ? -1 : 1) + focusable.length) % focusable.length]?.focus();
    }
  });
  card.append(search, results, node('small', 'launcher-hint', '↑ ↓ Navigate · Enter Launch · Esc Close')); overlay.append(card); document.body.append(overlay);
  document.querySelector('#launcher-button').addEventListener('click', open);
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); overlay.classList.contains('hidden') ? open() : close(); } });
}
