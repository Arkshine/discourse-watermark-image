import { headerOffset } from "discourse/lib/offset-calculator";

const DRAGGING_CLASS = "is-dragging";

export function pointerPosition(event) {
  if (event.touches?.length) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  if (event.changedTouches?.length) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY,
    };
  }

  return { x: event.clientX, y: event.clientY };
}

export class DragPanel {
  constructor(handle, panel) {
    this.handle = handle;
    this.panel = panel;
    this.animationFrameId = null;
    this.currentX = 0;
    this.currentY = 0;
  }

  start(event) {
    const { x, y } = pointerPosition(event);
    const rect = this.panel.getBoundingClientRect();

    this.currentX = rect.left;
    this.currentY = rect.top;
    this.offsetX = x - this.currentX;
    this.offsetY = y - this.currentY;

    this.updateCSS();
    this.panel.classList.add(DRAGGING_CLASS);
  }

  move(event) {
    const { x, y } = pointerPosition(event);

    if (this.animationFrameId) {
      this.lastX = x;
      this.lastY = y;
      return;
    }

    this.animationFrameId = requestAnimationFrame(() => {
      this.updatePosition(this.lastX ?? x, this.lastY ?? y);
      this.lastX = this.lastY = null;
      this.animationFrameId = null;
    });
  }

  updatePosition(pointerX, pointerY) {
    const minY = headerOffset();
    const maxX = window.innerWidth - this.panel.offsetWidth;
    const maxY = Math.max(minY, window.innerHeight - this.panel.offsetHeight);

    const targetX = Math.max(0, Math.min(pointerX - this.offsetX, maxX));
    const targetY = Math.max(minY, Math.min(pointerY - this.offsetY, maxY));

    const lerp = 0.3;
    this.currentX += (targetX - this.currentX) * lerp;
    this.currentY += (targetY - this.currentY) * lerp;

    this.updateCSS();
  }

  updateCSS() {
    this.panel.style.left = "0px";
    this.panel.style.top = "0px";
    this.panel.style.right = "auto";
    this.panel.style.bottom = "auto";
    this.panel.style.setProperty(
      "transform",
      `translate3d(${Math.round(this.currentX)}px, ${Math.round(this.currentY)}px, 0)`,
      "important"
    );
  }

  end() {
    this.panel.classList.remove(DRAGGING_CLASS);

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
