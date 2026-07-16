export class WindowManager {
  constructor({ layer, taskbar, template }) {
    this.storageKey = "blackterm_window_layouts";
    this.audioContext = null;
    this.layer = layer;
    this.taskbar = taskbar;
    this.template = template;
    this.windows = new Map();
    this.topZ = 20;
    this.cascade = 0;
  }

  loadLayouts() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || "{}");
    } catch {
      return {};
    }
  }

  loadLayout(id) {
    return this.loadLayouts()[id] || null;
  }

  saveLayout(record) {
    const { element, id, maximized } = record;
    const layouts = this.loadLayouts();
    layouts[id] = {
      left: element.style.left,
      top: element.style.top,
      width: element.style.width,
      height: element.style.height,
      maximized: Boolean(maximized),
      z: Number(element.style.zIndex || 0),
    };
    localStorage.setItem(this.storageKey, JSON.stringify(layouts));
  }

  tone(frequency = 420, duration = 0.035, volume = 0.018) {
    try {
      this.audioContext = this.audioContext || new AudioContext();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        this.audioContext.currentTime + duration,
      );
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch {
      // Audio is optional.
    }
  }

  open({ id, title, content, width = 760, height = 520, onOpen = null }) {
    const existing = this.windows.get(id);
    if (existing) {
      existing.element.classList.remove("minimized");
      this.focus(existing.element);
      return existing;
    }

    const fragment = this.template.content.cloneNode(true);
    const element = fragment.querySelector(".os-window");
    element.dataset.windowId = id;
    element.classList.add(`app-window-${id}`);
    const savedLayout = this.loadLayout(id);
    element.style.width = savedLayout?.width || `${Math.min(width, window.innerWidth - 30)}px`;
    element.style.height = savedLayout?.height || `${Math.min(height, window.innerHeight - 90)}px`;
    element.style.left = savedLayout?.left || `${80 + (this.cascade % 6) * 34}px`;
    element.style.top = savedLayout?.top || `${64 + (this.cascade % 6) * 28}px`;
    if (savedLayout?.z) {
      element.style.zIndex = savedLayout.z;
      this.topZ = Math.max(this.topZ, savedLayout.z);
    }
    this.cascade += 1;

    element.querySelector(".window-title").textContent = title;
    const body = element.querySelector(".window-content");
    if (content instanceof Node) body.appendChild(content);
    else body.innerHTML = content;

    this.layer.appendChild(element);

    const taskButton = document.createElement("button");
    taskButton.className = "task-button";
    taskButton.textContent = title;
    taskButton.addEventListener("click", () => {
      if (element.classList.contains("minimized")) {
        element.classList.remove("minimized");
        element.classList.add("window-restoring");
        setTimeout(() => element.classList.remove("window-restoring"), 170);
      }
      this.focus(element);
    });
    this.taskbar.appendChild(taskButton);

    const record = {
      id,
      title,
      element,
      body,
      taskButton,
      maximized: Boolean(savedLayout?.maximized),
    };
    this.windows.set(id, record);

    if (record.maximized) element.classList.add("maximized");
    this.bindWindow(record);
    this.focus(element);
    this.tone(540, 0.035, 0.012);
    requestAnimationFrame(() => {
      element.classList.add("window-opening");
      requestAnimationFrame(() => {
        element.classList.add("window-visible");
        setTimeout(() => element.classList.remove("window-opening"), 320);
      });
    });
    if (onOpen) onOpen(record);

    return record;
  }

  bindWindow(record) {
    const { element } = record;
    const titlebar = element.querySelector(".window-titlebar");
    const resize = element.querySelector(".window-resize-handle");

    element.addEventListener("pointerdown", () => this.focus(element));

    element.addEventListener("dragover", (event) => {
      event.preventDefault();
      element.classList.add("drop-target");
    });

    element.addEventListener("dragleave", () => {
      element.classList.remove("drop-target");
    });

    element.addEventListener("drop", (event) => {
      event.preventDefault();
      element.classList.remove("drop-target");

      const payload = event.dataTransfer.getData("application/x-blackterm-file");
      if (!payload) return;

      try {
        const file = JSON.parse(payload);
        element.dispatchEvent(new CustomEvent("blackterm:file-drop", {
          detail: file,
        }));
      } catch {
        // Ignore malformed drag data.
      }
    });

    element.querySelector('[data-window-action="close"]').addEventListener("click", () => {
      this.saveLayout(record);
      this.tone(240, 0.045, 0.012);
      element.classList.add("window-closing", "window-transitioning");
      setTimeout(() => {
        element.remove();
        record.taskButton.remove();
        this.windows.delete(record.id);
      }, 150);
    });

    element.querySelector('[data-window-action="minimize"]').addEventListener("click", () => {
      this.saveLayout(record);
      this.tone(310, 0.03, 0.01);
      element.classList.add("window-minimizing", "window-transitioning");
      setTimeout(() => {
        element.classList.add("minimized");
        element.classList.remove("window-minimizing", "window-transitioning");
      }, 130);
      record.taskButton.classList.remove("active");
    });

    element.querySelector('[data-window-action="maximize"]').addEventListener("click", () => {
      this.tone(record.maximized ? 360 : 520, 0.03, 0.01);
      element.classList.add("window-transitioning");

      if (!record.maximized) {
        record.restore = {
          left: element.style.left,
          top: element.style.top,
          width: element.style.width,
          height: element.style.height,
        };
        element.classList.add("maximizing");
        requestAnimationFrame(() => element.classList.add("maximized"));
      } else {
        element.classList.add("restoring-size");
        element.classList.remove("maximized");
        requestAnimationFrame(() => Object.assign(element.style, record.restore));
      }

      record.maximized = !record.maximized;
      this.focus(element);

      setTimeout(() => {
        element.classList.remove("window-transitioning", "maximizing", "restoring-size");
      }, 280);
    });

    this.makeDraggable(element, titlebar, record);
    this.makeResizable(element, resize, record);
  }

  focus(element) {
    this.topZ += 1;
    element.style.zIndex = this.topZ;

    for (const record of this.windows.values()) {
      const active = record.element === element && !element.classList.contains("minimized");
      record.element.classList.toggle("focused", active);
      record.element.classList.toggle("inactive", !active);
      record.taskButton.classList.toggle("active", active);
    }
  }

  makeDraggable(element, handle, record) {
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;

    handle.addEventListener("pointerdown", (event) => {
      if (record.maximized || event.target.closest(".window-controls")) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      startX = event.clientX;
      startY = event.clientY;
      originX = element.offsetLeft;
      originY = element.offsetTop;
      this.focus(element);
    });

    handle.addEventListener("pointermove", (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const maxX = Math.max(0, window.innerWidth - element.offsetWidth);
      const maxY = Math.max(42, window.innerHeight - element.offsetHeight - 42);
      element.style.left = `${Math.max(0, Math.min(maxX, originX + event.clientX - startX))}px`;
      element.style.top = `${Math.max(42, Math.min(maxY, originY + event.clientY - startY))}px`;
    });

    handle.addEventListener("pointerup", () => this.saveLayout(record));
  }

  makeResizable(element, handle, record) {
    let startX = 0;
    let startY = 0;
    let width = 0;
    let height = 0;

    handle.addEventListener("pointerdown", (event) => {
      if (record.maximized) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      startX = event.clientX;
      startY = event.clientY;
      width = element.offsetWidth;
      height = element.offsetHeight;
      this.focus(element);
    });

    handle.addEventListener("pointermove", (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      element.style.width = `${Math.max(420, width + event.clientX - startX)}px`;
      element.style.height = `${Math.max(280, height + event.clientY - startY)}px`;
    });

    handle.addEventListener("pointerup", () => this.saveLayout(record));
  }
}
