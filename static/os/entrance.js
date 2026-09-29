const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// The cinematic runs alongside real preparation. Access is granted only after preparation succeeds.
export async function openArchive(prepare, { skipAnimation = false } = {}) {
  const gate = document.querySelector('#gate');
  const overlay = document.querySelector('#transmission-boot');
  const status = document.querySelector('#transmission-stage');
  const detail = document.querySelector('#transmission-detail');
  const progress = document.querySelector('#transmission-progress');
  const percent = document.querySelector('#transmission-percent');
  const skip = document.querySelector('#transmission-skip');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('archive-calm');
  let skipped = skipAnimation || reduce, ready = false, failure = null;
  const onSkip = () => { skipped = true; skip.disabled = true; skip.textContent = 'Waiting for Archive…'; };
  const onKey = event => { if (event.key === 'Escape') onSkip(); };
  const update = (value, stage, description) => {
    progress.style.width = `${value}%`; percent.textContent = `${value}%`;
    status.textContent = stage; detail.textContent = description;
  };
  skip.disabled = false; skip.textContent = 'Skip sequence →';
  skip.addEventListener('click', onSkip); document.addEventListener('keydown', onKey);
  gate.classList.add('gate-engaged');
  overlay.classList.remove('hidden', 'transmission-exit');
  overlay.dataset.phase = 'acquire';
  skip.focus();
  update(4, 'ACQUIRING SIGNAL', 'Opening the observer channel');
  const task = Promise.resolve().then(prepare).then(() => { ready = true; }, error => { failure = error; });
  const stages = [
    [1100, 24, 'align', 'ALIGNING RELAYS', 'The signal is forming a path'],
    [2200, 48, 'decode', 'DECODING THE ARCHIVE', 'Fragments become a system'],
    [3400, 72, 'verify', 'VERIFYING OBSERVER', 'Establishing your workstation'],
    [4500, 92, 'open', 'OPENING THE VAULT', 'Your desktop is on the other side'],
  ];
  try {
    const start = performance.now(); let next = 0;
    while ((!skipped && performance.now() - start < 5500) || !ready) {
      if (failure) throw failure;
      const elapsed = performance.now() - start;
      while (next < stages.length && elapsed >= stages[next][0]) {
        const [, value, phase, title, text] = stages[next++];
        overlay.dataset.phase = phase; update(value, title, text);
      }
      if ((skipped || elapsed >= 5500) && !ready) update(92, 'CONNECTING TO ARCHIVE', 'Waiting for the server to finish preparing your desktop');
      await pause(50);
    }
    await task;
    if (failure) throw failure;
    overlay.dataset.phase = 'granted';
    update(100, 'ACCESS GRANTED', 'Welcome back, observer');
    document.querySelector('#desktop').classList.remove('hidden');
    document.querySelector('#desktop').classList.add('desktop-arrival');
    window.dispatchEvent(new Event('resize'));
    gate.classList.add('hidden');
    await pause(reduce || skipped ? 80 : 650);
    overlay.classList.add('transmission-exit');
    await pause(reduce || skipped ? 20 : 550);
  } finally {
    skip.removeEventListener('click', onSkip); document.removeEventListener('keydown', onKey);
    overlay.classList.add('hidden');
    gate.classList.remove('gate-engaged');
    if (ready && !failure) document.querySelector('#desktop-icons .desktop-icon')?.focus();
  }
}
