import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { trustHTML } from "@ember/template";
import { resolveColor } from "discourse/lib/color-transformations";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";

export default class WatermarkColorField extends Component {
  get swatchStyle() {
    return trustHTML(`background-color: ${this.args.value || "transparent"};`);
  }

  get pickerValue() {
    const hex = this.#resolvedHex(this.args.value);
    return hex ? `#${hex}` : "#000000";
  }

  get iconClass() {
    const hex = this.#resolvedHex(this.args.value);
    if (!hex) {
      return "--is-light";
    }

    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) / 255 > 0.5
      ? "--is-light"
      : "--is-dark";
  }

  @action
  update(event) {
    this.args.changeValueCallback(event.target.value);
  }

  #resolvedHex(value) {
    if (!value) {
      return null;
    }

    const variable = value.match(/^var\((--[^)]+)\)$|^(--[^)]+)$/);
    if (variable) {
      value = getComputedStyle(document.documentElement)
        .getPropertyValue(variable[1] || variable[2])
        .trim();
    }

    const resolved = resolveColor(value);
    return resolved?.startsWith("#") ? resolved.slice(1) : null;
  }

  <template>
    <div class="watermark-color-field" ...attributes>
      <span class="watermark-color-field__swatch {{this.iconClass}}">
        <span
          class="watermark-color-field__fill"
          style={{this.swatchStyle}}
        ></span>
        <input
          type="color"
          class="watermark-color-field__picker"
          value={{this.pickerValue}}
          disabled={{@disabled}}
          aria-label={{i18n (themePrefix "settings_ui.color.pick")}}
          {{on "input" this.update}}
        />
        {{dIcon "eye-dropper"}}
      </span>
      <input
        type="text"
        class="watermark-color-field__text"
        value={{@value}}
        disabled={{@disabled}}
        spellcheck="false"
        autocomplete="off"
        aria-label={{i18n (themePrefix "settings_ui.color.value")}}
        {{on "input" this.update}}
      />
    </div>
  </template>
}
