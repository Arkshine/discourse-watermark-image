import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { trustHTML } from "@ember/template";
import WatermarkStepper from "./stepper";

export default class WatermarkRotationDial extends Component {
  ringElement;
  pointerActive = false;

  get degrees() {
    return parseInt(this.args.value, 10) || 0;
  }

  get indicatorStyle() {
    return trustHTML(`transform: rotate(${this.degrees}deg);`);
  }

  @action
  registerRing(element) {
    this.ringElement = element;
  }

  @action
  onPointerDown(event) {
    if (this.args.disabled) {
      return;
    }

    event.preventDefault();

    this.pointerActive = true;
    this.ringElement.setPointerCapture?.(event.pointerId);
    this.#updateFromPointer(event);
  }

  @action
  onPointerMove(event) {
    if (this.pointerActive) {
      this.#updateFromPointer(event);
    }
  }

  @action
  onPointerUp(event) {
    this.pointerActive = false;
    this.ringElement.releasePointerCapture?.(event.pointerId);
  }

  #updateFromPointer(event) {
    const rect = this.ringElement.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const degrees = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);

    const input = this.ringElement.parentElement.querySelector("input");
    input.value = degrees;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  <template>
    <div class="watermark-rotation-dial">
      <div
        class="watermark-rotation-dial__ring"
        {{didInsert this.registerRing}}
        {{on "pointerdown" this.onPointerDown}}
        {{on "pointermove" this.onPointerMove}}
        {{on "pointerup" this.onPointerUp}}
      >
        <span
          class="watermark-rotation-dial__indicator"
          style={{this.indicatorStyle}}
        ></span>
      </div>
      <WatermarkStepper
        @setting={{@setting}}
        @value={{@value}}
        @changeValueCallback={{@changeValueCallback}}
        @disabled={{@disabled}}
      />
    </div>
  </template>
}
