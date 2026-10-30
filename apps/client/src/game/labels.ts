import { bubbleMs } from './remote-math';

/**
 * Name tags and chat bubbles above players, drawn as ordinary page elements over the 3D view. Text is
 * sharper and cheaper this way than 3D text, and tapping a tag opens that player's card.
 */
export class Labels {
  private readonly items = new Map<
    string,
    {
      root: HTMLDivElement;
      name: HTMLDivElement;
      bubble: HTMLDivElement;
      timer: number | undefined;
    }
  >();
  private tap: ((id: string) => void) | undefined;

  constructor(private readonly host: HTMLElement) {}

  onTap(handler: (id: string) => void): void {
    this.tap = handler;
  }

  /** Create or update a label. An empty name shows only the bubble (used for the player's own). */
  set(id: string, name: string, blocked = false): void {
    let item = this.items.get(id);
    if (!item) {
      const root = document.createElement('div');
      root.style.cssText =
        'position:absolute;left:0;top:0;display:none;flex-direction:column;align-items:center;gap:4px;will-change:transform;pointer-events:none';
      const bubble = document.createElement('div');
      bubble.style.cssText =
        'display:none;max-width:190px;padding:6px 10px;border-radius:14px;background:#fff;color:#1b2340;font:700 12px/1.25 system-ui,sans-serif;text-align:center;box-shadow:0 4px 12px rgba(27,35,64,.25);word-break:break-word';
      const nameEl = document.createElement('div');
      nameEl.style.cssText =
        'padding:2px 9px;border-radius:999px;background:rgba(27,35,64,.82);color:#fff;font:800 11px/1.4 system-ui,sans-serif;white-space:nowrap;pointer-events:auto;cursor:pointer';
      nameEl.addEventListener('click', () => this.tap?.(id));
      root.append(bubble, nameEl);
      this.host.appendChild(root);
      item = { root, name: nameEl, bubble, timer: undefined };
      this.items.set(id, item);
    }
    item.name.textContent = name;
    item.name.style.display = name && !blocked ? 'block' : 'none';
  }

  say(id: string, text: string, italic = false): void {
    const item = this.items.get(id);
    if (!item) return;
    item.bubble.textContent = text;
    item.bubble.style.fontStyle = italic ? 'italic' : 'normal';
    item.bubble.style.display = 'block';
    window.clearTimeout(item.timer);
    item.timer = window.setTimeout(() => (item.bubble.style.display = 'none'), bubbleMs(text));
  }

  /** Place a label at a screen position, or hide it. `scale` shrinks far-away ones a little. */
  place(id: string, x: number, y: number, visible: boolean, scale = 1): void {
    const item = this.items.get(id);
    if (!item) return;
    item.root.style.display = visible ? 'flex' : 'none';
    if (visible)
      item.root.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%) scale(${scale})`;
  }

  hideAllExcept(keep: ReadonlySet<string>): void {
    for (const [id, item] of this.items) if (!keep.has(id)) item.root.style.display = 'none';
  }

  remove(id: string): void {
    const item = this.items.get(id);
    if (!item) return;
    window.clearTimeout(item.timer);
    item.root.remove();
    this.items.delete(id);
  }

  dispose(): void {
    for (const id of [...this.items.keys()]) this.remove(id);
  }
}
