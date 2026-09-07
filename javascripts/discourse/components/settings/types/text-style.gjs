import Component from "@glimmer/component";
import { concat, fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";
import WatermarkChoiceSegmented from "./choice-segmented";
import WatermarkColorField from "./color-field";
import WatermarkFontPicker from "./font-picker";
import WatermarkStepper from "./stepper";
import WatermarkSwitch from "./switch";

const DEFAULT_CONFIG = {
  font: '{"key":"site"}',
  weight: "normal",
  italic: false,
  textCase: "none",
  letterSpacing: "0",
  align: "center",
  color: "#ffffff",
  strokeColor: "#000000",
  strokeWidth: "4",
  shadowColor: "#000000",
  shadowBlur: "0",
  backgroundEnabled: false,
  backgroundColor: "#000000",
};

const WEIGHT_SETTING = {
  setting: "weight",
  validValues: ["normal", "bold"],
};

const CASE_SETTING = {
  setting: "textCase",
  validValues: ["none", "uppercase", "lowercase"],
};

const ALIGN_SETTING = {
  setting: "align",
  validValues: ["left", "center", "right"],
};

const FILL_COLOR_SETTING = { allowGradient: true };
const PLAIN_COLOR_SETTING = {};

// % of the rendered font size
const PERCENT_SETTING = { min: 0, max: 20 };

function parseConfig(value) {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(value) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

const Param = <template>
  <div class="watermark-text-style__param" data-param={{@param}} ...attributes>
    <div class="watermark-text-style__param-header">
      <label class="watermark-text-style__param-label">
        {{i18n (themePrefix (concat "settings_ui.text_style.params." @param))}}
      </label>

      {{#if @overridden}}
        <button
          type="button"
          class="watermark-text-style__param-reset"
          title={{i18n (themePrefix "settings_ui.reset_param")}}
          disabled={{@disabled}}
          {{on "click" @onReset}}
        >{{dIcon "arrow-rotate-left"}}</button>
      {{/if}}
    </div>
    <div class="watermark-text-style__param-control">
      {{yield}}
    </div>
  </div>
</template>;

export default class WatermarkTextStyle extends Component {
  weightSetting = WEIGHT_SETTING;
  caseSetting = CASE_SETTING;
  alignSetting = ALIGN_SETTING;
  fillColorSetting = FILL_COLOR_SETTING;
  plainColorSetting = PLAIN_COLOR_SETTING;
  percentSetting = PERCENT_SETTING;

  #notifier;

  get config() {
    return parseConfig(this.args.value);
  }

  get overridden() {
    const config = this.config;

    return Object.fromEntries(
      Object.keys(DEFAULT_CONFIG).map((key) => [
        key,
        JSON.stringify(config[key]) !== JSON.stringify(DEFAULT_CONFIG[key]),
      ])
    );
  }

  @action
  registerNotifier(element) {
    this.#notifier = element;
  }

  @action
  update(key, value) {
    this.args.changeValueCallback(
      JSON.stringify({ ...this.config, [key]: value })
    );
    this.#notifier?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  @action
  reset(key) {
    this.update(key, DEFAULT_CONFIG[key]);
  }

  <template>
    <div class="watermark-text-style" ...attributes>
      <input
        type="hidden"
        class="watermark-text-style__notifier"
        {{didInsert this.registerNotifier}}
      />

      <div class="watermark-text-style__row">
        <Param
          @param="font"
          @overridden={{this.overridden.font}}
          @onReset={{fn this.reset "font"}}
          @disabled={{@disabled}}
        >
          <WatermarkFontPicker
            @value={{this.config.font}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "font"}}
          />
        </Param>

        <Param
          @param="weight"
          @overridden={{this.overridden.weight}}
          @onReset={{fn this.reset "weight"}}
          @disabled={{@disabled}}
        >
          <WatermarkChoiceSegmented
            @value={{this.config.weight}}
            @setting={{this.weightSetting}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "weight"}}
          />
        </Param>

        <Param
          @param="italic"
          @overridden={{this.overridden.italic}}
          @onReset={{fn this.reset "italic"}}
          @disabled={{@disabled}}
        >
          <WatermarkSwitch
            @value={{this.config.italic}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "italic"}}
          />
        </Param>

        <Param
          @param="case"
          @overridden={{this.overridden.textCase}}
          @onReset={{fn this.reset "textCase"}}
          @disabled={{@disabled}}
        >
          <WatermarkChoiceSegmented
            @value={{this.config.textCase}}
            @setting={{this.caseSetting}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "textCase"}}
          />
        </Param>

        <Param
          @param="letter_spacing"
          @overridden={{this.overridden.letterSpacing}}
          @onReset={{fn this.reset "letterSpacing"}}
          @disabled={{@disabled}}
        >
          <WatermarkStepper
            @value={{this.config.letterSpacing}}
            @setting={{this.percentSetting}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "letterSpacing"}}
          />
        </Param>

        <Param
          @param="align"
          @overridden={{this.overridden.align}}
          @onReset={{fn this.reset "align"}}
          @disabled={{@disabled}}
        >
          <WatermarkChoiceSegmented
            @value={{this.config.align}}
            @setting={{this.alignSetting}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "align"}}
          />
        </Param>
      </div>

      <div class="watermark-text-style__row">
        <Param
          @param="color"
          @overridden={{this.overridden.color}}
          @onReset={{fn this.reset "color"}}
          @disabled={{@disabled}}
        >
          <WatermarkColorField
            @value={{this.config.color}}
            @setting={{this.fillColorSetting}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "color"}}
          />
        </Param>
      </div>

      <div class="watermark-text-style__row">
        <Param
          @param="stroke_width"
          @overridden={{this.overridden.strokeWidth}}
          @onReset={{fn this.reset "strokeWidth"}}
          @disabled={{@disabled}}
        >
          <WatermarkStepper
            @value={{this.config.strokeWidth}}
            @setting={{this.percentSetting}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "strokeWidth"}}
          />
        </Param>

        <Param
          @param="stroke_color"
          @overridden={{this.overridden.strokeColor}}
          @onReset={{fn this.reset "strokeColor"}}
          @disabled={{@disabled}}
        >
          <WatermarkColorField
            @value={{this.config.strokeColor}}
            @setting={{this.plainColorSetting}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "strokeColor"}}
          />
        </Param>
      </div>

      <div class="watermark-text-style__row">
        <Param
          @param="shadow_blur"
          @overridden={{this.overridden.shadowBlur}}
          @onReset={{fn this.reset "shadowBlur"}}
          @disabled={{@disabled}}
        >
          <WatermarkStepper
            @value={{this.config.shadowBlur}}
            @setting={{this.percentSetting}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "shadowBlur"}}
          />
        </Param>

        <Param
          @param="shadow_color"
          @overridden={{this.overridden.shadowColor}}
          @onReset={{fn this.reset "shadowColor"}}
          @disabled={{@disabled}}
        >
          <WatermarkColorField
            @value={{this.config.shadowColor}}
            @setting={{this.plainColorSetting}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "shadowColor"}}
          />
        </Param>
      </div>

      <div class="watermark-text-style__row">
        <Param
          @param="background"
          @overridden={{this.overridden.backgroundEnabled}}
          @onReset={{fn this.reset "backgroundEnabled"}}
          @disabled={{@disabled}}
        >
          <WatermarkSwitch
            @value={{this.config.backgroundEnabled}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "backgroundEnabled"}}
          />
        </Param>

        <Param
          @param="background_color"
          @overridden={{this.overridden.backgroundColor}}
          @onReset={{fn this.reset "backgroundColor"}}
          @disabled={{@disabled}}
        >
          <WatermarkColorField
            @value={{this.config.backgroundColor}}
            @setting={{this.plainColorSetting}}
            @disabled={{@disabled}}
            @changeValueCallback={{fn this.update "backgroundColor"}}
          />
        </Param>
      </div>
    </div>
  </template>
}
