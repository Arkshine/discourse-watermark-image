import { modifier } from "ember-modifier";
import { DragPanel } from "../lib/drag-panel";

export default modifier((element, [targetSelector], named = {}) => {
  let instance = null;
  let hasStarted = false;

  const onMove = (event) => instance?.move(event);

  const onEnd = () => {
    if (!hasStarted) {
      return;
    }

    hasStarted = false;
    instance?.end();
    instance = null;

    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("touchmove", onMove);
    document.removeEventListener("mouseup", onEnd);
    document.removeEventListener("touchend", onEnd);
    document.body.classList.remove("is-dragging");
  };

  const onStart = (event) => {
    if (hasStarted) {
      return;
    }

    if (event.target.closest("button, a, input, select, textarea, .btn")) {
      return;
    }

    const target = element.closest(targetSelector);

    if (!target) {
      return;
    }

    event.preventDefault();
    hasStarted = true;
    named.onStart?.();

    instance = new DragPanel(element, target);
    instance.start(event);

    document.addEventListener("mousemove", onMove, { passive: false });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("mouseup", onEnd, { passive: false });
    document.addEventListener("touchend", onEnd, { passive: false });
    document.body.classList.add("is-dragging");
  };

  element.addEventListener("mousedown", onStart, { passive: false });
  element.addEventListener("touchstart", onStart, { passive: false });

  return () => {
    element.removeEventListener("mousedown", onStart);
    element.removeEventListener("touchstart", onStart);
    onEnd();
  };
});
