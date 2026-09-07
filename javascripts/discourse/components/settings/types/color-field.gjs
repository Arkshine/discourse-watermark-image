import Component from "@glimmer/component";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { debounce } from "@ember/runloop";
import { resolveColor } from "discourse/lib/color-transformations";
import dConcatClass from "discourse/ui-kit/helpers/d-concat-class";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";
import WatermarkChoiceSegmented from "./choice-segmented";
import WatermarkSlider from "./slider";

const STOP_UPDATE_DEBOUNCE = 50;

const GRADIENT_TYPES = {
  setting: "gradient_type",
  validValues: ["linear", "radial"],
};

const BLEND_MODES = {
  setting: "gradient_blend",
  validValues: ["smooth", "random"],
};

const GRADIENT_ANGLE = {
  setting: "gradient_angle",
  min: 0,
  max: 360,
  step: 15,
};

const SECOND_STOP = "#ffffff";
const MAX_STOPS = 6;

export default class WatermarkColorField extends Component {
  gradientTypes = GRADIENT_TYPES;
  gradientAngle = GRADIENT_ANGLE;
  blendModes = BLEND_MODES;

  #pendingStop = null;

  get gradient() {
    const value = this.args.value;
    return value && typeof value === "object" ? value : null;
  }

  get allowGradient() {
    return Boolean(this.args.setting?.allowGradient);
  }

  get stops() {
    return this.gradient?.stops ?? [this.args.value || ""];
  }

  get canAddStop() {
    return this.allowGradient && this.stops.length < MAX_STOPS;
  }

  get swatches() {
    const placeholder = this.args.setting?.placeholder;

    return this.stops.map((stop, index) => {
      const raw = stop || (index === 0 ? placeholder : "") || "";
      const effective =
        raw && typeof raw === "object" ? (raw.stops?.[0] ?? "") : raw;
      const hex = resolvedHex(effective);

      return {
        index,
        value: stop,
        text: stop.replace(/^#/, ""),
        inherited: !stop && index === 0 && Boolean(placeholder),
        picker: hex ? `#${hex}` : "#000000",
      };
    });
  }

  get blend() {
    return this.gradient?.blend ?? "smooth";
  }

  get isRandom() {
    return this.blend === "random";
  }

  get showAngle() {
    return !this.isRandom && this.gradient?.type === "linear";
  }

  get showGradient() {
    return Boolean(this.gradient) && !this.args.setting?.stopsOnly;
  }

  @action
  updateHex(index, event) {
    const digits = event.target.value.replace(/^#/, "");
    this.updateStop(index, { target: { value: digits && `#${digits}` } });
  }

  @action
  updateStop(index, event) {
    this.#pendingStop = { index, color: event.target.value };
    debounce(this, this.#commitStop, STOP_UPDATE_DEBOUNCE);
  }

  #commitStop() {
    const { index, color } = this.#pendingStop;

    if (!this.gradient) {
      this.args.changeValueCallback(color);
      return;
    }

    const stops = [...this.gradient.stops];
    stops[index] = color;
    this.#emit({ stops });
  }

  @action
  addStop() {
    if (!this.gradient) {
      this.args.changeValueCallback({
        type: "linear",
        angle: 45,
        stops: [this.args.value || "#000000", SECOND_STOP],
      });
      return;
    }
    const stops = this.gradient.stops;
    this.#emit({ stops: [...stops, stops[stops.length - 1] ?? SECOND_STOP] });
  }

  @action
  removeStop() {
    const stops = this.gradient?.stops ?? [];

    if (stops.length <= 2) {
      this.args.changeValueCallback(stops[0] ?? "");
      return;
    }

    this.#emit({ stops: stops.slice(0, -1) });
  }

  @action
  setType(type) {
    this.#emit({ type });
  }

  @action
  setBlend(blend) {
    this.#emit({ blend });
  }

  @action
  setAngle(angle) {
    this.#emit({ angle: Number(angle) });
  }

  #emit(changes) {
    this.args.changeValueCallback({ ...this.gradient, ...changes });
  }

  <template>
    <div class="watermark-color-field" ...attributes>
      <div class="watermark-color-field__stops">
        {{#each this.swatches key="index" as |swatch|}}
          <span
            class={{dConcatClass
              "watermark-color-field__stop"
              "form-kit__control-input"
              (if swatch.inherited "--inherited")
            }}
          >
            <input
              type="color"
              class="watermark-color-field__picker"
              value={{swatch.picker}}
              disabled={{@disabled}}
              aria-label={{i18n (themePrefix "settings_ui.color.pick")}}
              {{on "input" (fn this.updateStop swatch.index)}}
              {{on "change" (fn this.updateStop swatch.index)}}
            />
            <span class="watermark-color-field__hex">
              {{dIcon "hashtag" class="watermark-color-field__hash"}}
              <input
                type="text"
                class="watermark-color-field__text"
                value={{swatch.text}}
                disabled={{@disabled}}
                spellcheck="false"
                autocomplete="off"
                aria-label={{i18n (themePrefix "settings_ui.color.value")}}
                maxlength="6"
                {{on "input" (fn this.updateHex swatch.index)}}
              />
            </span>
          </span>
        {{/each}}

        {{#if this.canAddStop}}
          <button
            type="button"
            class="watermark-color-field__stop-action"
            title={{i18n (themePrefix "settings_ui.color.add_stop")}}
            disabled={{@disabled}}
            {{on "click" this.addStop}}
          >{{dIcon "plus"}}</button>
        {{/if}}

        {{#if this.gradient}}
          <button
            type="button"
            class="watermark-color-field__stop-action"
            title={{i18n (themePrefix "settings_ui.color.remove_stop")}}
            disabled={{@disabled}}
            {{on "click" this.removeStop}}
          >{{dIcon "xmark"}}</button>
        {{/if}}
      </div>

      {{#if this.showGradient}}
        <div class="watermark-color-field__gradient">
          <WatermarkChoiceSegmented
            @value={{this.blend}}
            @setting={{this.blendModes}}
            @disabled={{@disabled}}
            @changeValueCallback={{this.setBlend}}
          />

          {{#unless this.isRandom}}
            <WatermarkChoiceSegmented
              @value={{this.gradient.type}}
              @setting={{this.gradientTypes}}
              @disabled={{@disabled}}
              @changeValueCallback={{this.setType}}
            />
          {{/unless}}

          {{#if this.showAngle}}
            <WatermarkSlider
              @value={{this.gradient.angle}}
              @setting={{this.gradientAngle}}
              @disabled={{@disabled}}
              @changeValueCallback={{this.setAngle}}
            />
          {{/if}}
        </div>
      {{/if}}
    </div>
  </template>
}

function resolvedHex(value) {
  if (!value) {
    return null;
  }

  const resolved = resolveColor(value);

  return resolved?.startsWith("#") ? resolved.slice(1) : null;
}
