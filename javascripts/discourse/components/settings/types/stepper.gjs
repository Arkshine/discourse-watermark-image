import Component from "@glimmer/component";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { i18n } from "discourse-i18n";

export default class WatermarkStepper extends Component {
  get isFloat() {
    return this.args.setting?.type === "float";
  }

  get stepSize() {
    return this.isFloat ? 0.1 : 1;
  }

  get value() {
    const parsed = this.isFloat
      ? parseFloat(this.args.value)
      : parseInt(this.args.value, 10);

    return isNaN(parsed) ? 0 : parsed;
  }

  #clamp(value) {
    const { min, max } = this.args.setting ?? {};
    if (min != null) {
      value = Math.max(min, value);
    }

    if (max != null) {
      value = Math.min(max, value);
    }

    return this.isFloat ? Math.round(value * 100) / 100 : value;
  }

  @action
  step(direction, event) {
    const amount = (event.shiftKey ? 10 : 1) * this.stepSize;
    const input = event.target
      .closest(".watermark-stepper")
      .querySelector("input");

    input.value = this.#clamp(this.value + direction * amount);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  @action
  onInput(event) {
    const raw = event.target.value;
    if (raw === "" || raw.endsWith("-") || raw.endsWith(".")) {
      return;
    }

    const parsed = this.isFloat ? parseFloat(raw) : parseInt(raw, 10);
    if (!isNaN(parsed)) {
      this.args.changeValueCallback(String(parsed));
    }
  }

  <template>
    <div class="watermark-stepper" ...attributes>
      <button
        type="button"
        class="watermark-stepper__btn"
        aria-label={{i18n (themePrefix "settings_ui.stepper.decrease")}}
        disabled={{@disabled}}
        {{on "click" (fn this.step -1)}}
      >−</button>
      <input
        type="number"
        class="watermark-stepper__input"
        step={{this.stepSize}}
        min={{@setting.min}}
        max={{@setting.max}}
        value={{this.value}}
        disabled={{@disabled}}
        {{on "input" this.onInput}}
      />
      <button
        type="button"
        class="watermark-stepper__btn"
        aria-label={{i18n (themePrefix "settings_ui.stepper.increase")}}
        disabled={{@disabled}}
        {{on "click" (fn this.step 1)}}
      >+</button>
    </div>
  </template>
}
