import Component from "@glimmer/component";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { service } from "@ember/service";
import { and, eq, not } from "discourse/truth-helpers";
import DIconGridPicker from "discourse/ui-kit/d-icon-grid-picker";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";
import {
  LOGO_DEFAULTS,
  LOGO_PADDING,
  LOGO_SIZE,
  logoExceedsErrorCorrection,
  MAX_ERROR_CORRECTION,
  parseLogoConfig,
  stringifyLogoConfig,
} from "../../../lib/qr-settings/logo";
import { RANDOM_LOGO_EVENT } from "../../../lib/qr-settings/random";
import {
  LOGO_CONFIG_CHANGED_EVENT,
  publishActiveLogoConfig,
} from "../../../lib/watermark/active-state";
import WatermarkChoiceSegmented from "./choice-segmented";
import WatermarkColorField from "./color-field";
import WatermarkSlider from "./slider";
import WatermarkSwitch from "./switch";

export default class WatermarkQrLogo extends Component {
  @service appEvents;

  #notifier;

  constructor() {
    super(...arguments);
    this.appEvents.on(RANDOM_LOGO_EVENT, this, this.applyRoll);
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.appEvents.off(RANDOM_LOGO_EVENT, this, this.applyRoll);
  }

  @action
  applyRoll(config) {
    this.#emit(stringifyLogoConfig(config));
  }

  #emit(value) {
    this.args.changeValueCallback(value);
    this.#notifier?.dispatchEvent(new Event("input", { bubbles: true }));

    publishActiveLogoConfig(value);
    this.appEvents.trigger(LOGO_CONFIG_CHANGED_EVENT, value);
  }

  get config() {
    return parseLogoConfig(this.args.value);
  }

  get stored() {
    try {
      return JSON.parse(this.args.value || "{}") ?? {};
    } catch {
      return {};
    }
  }

  get sourceSetting() {
    return { setting: "qrcode_logo_source", validValues: ["icon", "image"] };
  }

  get isBackground() {
    return Boolean(this.config.background);
  }

  get sizeSetting() {
    return { setting: "qrcode_logo_size", ...LOGO_SIZE };
  }

  get paddingSetting() {
    return { setting: "qrcode_logo_padding", ...LOGO_PADDING };
  }

  get colorSetting() {
    return {
      setting: "qrcode_logo_color",
      placeholder: String(settings.watermark_qrcode_color ?? ""),
      allowGradient: true,
    };
  }

  get warnErrorCorrection() {
    if (this.isBackground) {
      return false;
    }

    const { size, showDataBehind } = this.config;
    return (
      !showDataBehind && logoExceedsErrorCorrection(size, MAX_ERROR_CORRECTION)
    );
  }

  @action
  registerNotifier(element) {
    this.#notifier = element;
  }

  @action
  resetField(key) {
    const rest = { ...this.stored };

    delete rest[key];
    this.#emit(stringifyLogoConfig(rest));
  }

  @action
  update(key, value) {
    if (key === "size" || key === "padding") {
      value = Number(value);
    }

    const rest = { ...this.stored };

    if (value === LOGO_DEFAULTS[key]) {
      delete rest[key];
    } else {
      rest[key] = value;
    }

    this.#emit(stringifyLogoConfig(rest));
  }

  <template>
    <div class="watermark-qr-logo" ...attributes>
      <input
        type="hidden"
        class="watermark-qr-logo__notifier"
        {{didInsert this.registerNotifier}}
      />

      <div class="watermark-qr-logo__field" data-logo-field="enabled">
        <WatermarkSwitch
          @value={{this.config.enabled}}
          @disabled={{@disabled}}
          @changeValueCallback={{fn this.update "enabled"}}
        />
      </div>

      {{#if this.config.enabled}}
        <div class="watermark-qr-logo__params">
          <div
            class="watermark-qr-logo__param
              {{if this.stored.source '--overridden'}}"
            data-logo-field="source"
          >
            <div class="watermark-qr-logo__param-header">
              <label class="watermark-qr-logo__label">
                {{i18n (themePrefix "settings_ui.qr_logo.source")}}
              </label>

              {{#if this.stored.source}}
                <button
                  type="button"
                  class="watermark-qr-logo__param-reset"
                  title={{i18n (themePrefix "settings_ui.reset_param")}}
                  disabled={{@disabled}}
                  {{on "click" (fn this.resetField "source")}}
                >{{dIcon "arrow-rotate-left"}}</button>
              {{/if}}
            </div>
            <WatermarkChoiceSegmented
              @value={{this.config.source}}
              @setting={{this.sourceSetting}}
              @disabled={{@disabled}}
              @changeValueCallback={{fn this.update "source"}}
            />
          </div>

          {{#if (eq this.config.source "icon")}}
            <div
              class="watermark-qr-logo__param
                {{if this.stored.icon '--overridden'}}"
            >
              <div class="watermark-qr-logo__param-header">
                <label class="watermark-qr-logo__label">
                  {{i18n (themePrefix "settings_ui.qr_logo.icon")}}
                </label>

                {{#if this.stored.icon}}
                  <button
                    type="button"
                    class="watermark-qr-logo__param-reset"
                    title={{i18n (themePrefix "settings_ui.reset_param")}}
                    disabled={{@disabled}}
                    {{on "click" (fn this.resetField "icon")}}
                  >{{dIcon "arrow-rotate-left"}}</button>
                {{/if}}
              </div>
              <DIconGridPicker
                @value={{this.config.icon}}
                @onChange={{fn this.update "icon"}}
                @showCaret={{true}}
                @disabled={{@disabled}}
              />
            </div>

            <div
              class="watermark-qr-logo__param --full
                {{if this.stored.color '--overridden'}}"
            >
              <div class="watermark-qr-logo__param-header">
                <label class="watermark-qr-logo__label">
                  {{i18n (themePrefix "settings_ui.qr_logo.color")}}
                </label>

                {{#if this.stored.color}}
                  <button
                    type="button"
                    class="watermark-qr-logo__param-reset"
                    title={{i18n (themePrefix "settings_ui.reset_param")}}
                    disabled={{@disabled}}
                    {{on "click" (fn this.resetField "color")}}
                  >{{dIcon "arrow-rotate-left"}}</button>
                {{/if}}
              </div>
              <WatermarkColorField
                @value={{this.config.color}}
                @setting={{this.colorSetting}}
                @disabled={{@disabled}}
                @changeValueCallback={{fn this.update "color"}}
              />
            </div>
          {{else}}
            <div class="watermark-qr-logo__param --full">
              <div class="watermark-qr-logo__hint">
                {{i18n (themePrefix "settings_ui.qr_logo.image_hint")}}
              </div>
            </div>
          {{/if}}

          <div
            class="watermark-qr-logo__param
              {{if this.stored.background '--overridden'}}"
          >
            <div class="watermark-qr-logo__param-header">
              <label class="watermark-qr-logo__label">
                {{i18n (themePrefix "settings_ui.qr_logo.background")}}
              </label>

              {{#if this.stored.background}}
                <button
                  type="button"
                  class="watermark-qr-logo__param-reset"
                  title={{i18n (themePrefix "settings_ui.reset_param")}}
                  disabled={{@disabled}}
                  {{on "click" (fn this.resetField "background")}}
                >{{dIcon "arrow-rotate-left"}}</button>
              {{/if}}
            </div>
            <WatermarkSwitch
              @value={{this.config.background}}
              @disabled={{@disabled}}
              @changeValueCallback={{fn this.update "background"}}
            />
          </div>

          {{#unless this.isBackground}}
            <div
              class="watermark-qr-logo__param
                {{if this.stored.showDataBehind '--overridden'}}"
            >
              <div class="watermark-qr-logo__param-header">
                <label class="watermark-qr-logo__label">
                  {{i18n (themePrefix "settings_ui.qr_logo.show_data_behind")}}
                </label>

                {{#if this.stored.showDataBehind}}
                  <button
                    type="button"
                    class="watermark-qr-logo__param-reset"
                    title={{i18n (themePrefix "settings_ui.reset_param")}}
                    disabled={{@disabled}}
                    {{on "click" (fn this.resetField "showDataBehind")}}
                  >{{dIcon "arrow-rotate-left"}}</button>
                {{/if}}
              </div>
              <WatermarkSwitch
                @value={{this.config.showDataBehind}}
                @disabled={{@disabled}}
                @changeValueCallback={{fn this.update "showDataBehind"}}
              />
            </div>
          {{/unless}}

          {{#if this.isBackground}}
            <div
              class="watermark-qr-logo__param
                {{if this.stored.transparentBackground '--overridden'}}"
            >
              <div class="watermark-qr-logo__param-header">
                <label class="watermark-qr-logo__label">
                  {{i18n
                    (themePrefix "settings_ui.qr_logo.transparent_background")
                  }}
                </label>

                {{#if this.stored.transparentBackground}}
                  <button
                    type="button"
                    class="watermark-qr-logo__param-reset"
                    title={{i18n (themePrefix "settings_ui.reset_param")}}
                    disabled={{@disabled}}
                    {{on "click" (fn this.resetField "transparentBackground")}}
                  >{{dIcon "arrow-rotate-left"}}</button>
                {{/if}}
              </div>
              <WatermarkSwitch
                @value={{this.config.transparentBackground}}
                @disabled={{@disabled}}
                @changeValueCallback={{fn this.update "transparentBackground"}}
              />
            </div>
          {{/if}}

          {{#unless this.isBackground}}
            <div
              class="watermark-qr-logo__param
                {{if this.stored.size '--overridden'}}"
            >
              <div class="watermark-qr-logo__param-header">
                <label class="watermark-qr-logo__label">
                  {{i18n (themePrefix "settings_ui.qr_logo.size")}}
                </label>

                {{#if this.stored.size}}
                  <button
                    type="button"
                    class="watermark-qr-logo__param-reset"
                    title={{i18n (themePrefix "settings_ui.reset_param")}}
                    disabled={{@disabled}}
                    {{on "click" (fn this.resetField "size")}}
                  >{{dIcon "arrow-rotate-left"}}</button>
                {{/if}}
              </div>
              <WatermarkSlider
                @value={{this.config.size}}
                @setting={{this.sizeSetting}}
                @disabled={{@disabled}}
                @changeValueCallback={{fn this.update "size"}}
              />
            </div>
          {{/unless}}

          {{#if (and (not this.config.showDataBehind) (not this.isBackground))}}
            <div
              class="watermark-qr-logo__param
                {{if this.stored.padding '--overridden'}}"
            >
              <div class="watermark-qr-logo__param-header">
                <label class="watermark-qr-logo__label">
                  {{i18n (themePrefix "settings_ui.qr_logo.padding")}}
                </label>

                {{#if this.stored.padding}}
                  <button
                    type="button"
                    class="watermark-qr-logo__param-reset"
                    title={{i18n (themePrefix "settings_ui.reset_param")}}
                    disabled={{@disabled}}
                    {{on "click" (fn this.resetField "padding")}}
                  >{{dIcon "arrow-rotate-left"}}</button>
                {{/if}}
              </div>

              <WatermarkSlider
                @value={{this.config.padding}}
                @setting={{this.paddingSetting}}
                @disabled={{@disabled}}
                @changeValueCallback={{fn this.update "padding"}}
              />
            </div>
          {{/if}}

          {{#if this.warnErrorCorrection}}
            <div class="watermark-qr-logo__warning --full">
              {{i18n (themePrefix "settings_ui.qr_logo.size_warning")}}
            </div>
          {{/if}}
        </div>
      {{/if}}
    </div>
  </template>
}
