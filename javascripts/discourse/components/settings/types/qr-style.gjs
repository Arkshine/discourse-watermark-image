import Component from "@glimmer/component";
import { cached, tracked } from "@glimmer/tracking";
import { fn, hash } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import didUpdate from "@ember/render-modifiers/modifiers/did-update";
import { debounce } from "@ember/runloop";
import { service } from "@ember/service";
import { htmlSafe } from "@ember/template";
import ComboBox from "discourse/select-kit/components/combo-box";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";
import {
  applyTemplate,
  AXES,
  paramsFor,
  parseAxisConfig,
  PATTERN_CATALOGUE,
  resolveAxisParams,
  SHARED_PARAMS,
  stringifyAxisConfig,
  templateFor,
  TEMPLATES,
} from "../../../lib/qr-axes";
import {
  LOGO_DEFAULTS,
  parseLogoConfig,
  stringifyLogoConfig,
} from "../../../lib/qr-logo";
import {
  RANDOM_LOGO_EVENT,
  randomLogo,
  randomStyle,
} from "../../../lib/qr-random";
import { absoluteUploadURL, resolveIconSVG } from "../../../lib/watermark";
import {
  activeLogoConfig,
  LOGO_CONFIG_CHANGED_EVENT,
} from "../../../lib/watermark/active-state";
import { renderQrThumbnail } from "../../../lib/watermark/worker";
import WatermarkAxisGallery from "./axis-gallery";
import WatermarkChoiceSegmented from "./choice-segmented";
import WatermarkColorField from "./color-field";
import WatermarkSlider from "./slider";
import WatermarkStepper from "./stepper";
import WatermarkSwitch from "./switch";

export const PREVIEW_STYLE_EVENT = "watermark:preview-style";

const SEGMENTED_MAX_OPTIONS = 5;
const MAX_SEGMENTED_CHARS = 16;

const THUMBNAIL_SIZE = 320;
const THUMBNAIL_TEXT = "QR";

const CUSTOM_THUMBNAIL_DEBOUNCE = 300;

const GENERATED_COUNT = 4;
const LOW_BACKDROP_STRENGTH = 0.35;
const LIGHT_FOREGROUND_LUMINANCE = 0.65;

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255
  );
  const [r, g, b] = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function foregroundLuminance(foreground) {
  if (typeof foreground === "string") {
    return relativeLuminance(foreground);
  }

  return Math.max(...(foreground?.stops ?? []).map(relativeLuminance), 0);
}

function patternIcon(key) {
  return `qr-pattern-${key}`;
}

function eyeIcon(key, role) {
  return role === "frame" ? `qr-eye-frame-${key}` : `qr-eye-in-${key}`;
}

function frameIcon(key) {
  return `qr-frame-${key}`;
}

const SHAPE_ICONS = {
  square: '<rect x="3" y="3" width="18" height="18"/>',
  rounded: '<rect x="3" y="3" width="18" height="18" rx="4.5"/>',
  "extra-rounded": '<rect x="3" y="3" width="18" height="18" rx="7.2"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  diamond: '<path d="M12 3l9 9l-9 9l-9-9z"/>',
  "diamond-round":
    '<path d="M12,3c3.15,0 9,5.85 9,9s-5.85,9 -9,9s-9,-5.85 -9,-9s5.85,-9 9,-9z"/>',
};

const ICON_FOR = {
  pattern: (key) => patternIcon(key),
  eyeFrame: (key) => eyeIcon(key, "frame"),
  eyeIn: (key) => eyeIcon(key, "in"),
  frame: (key) => frameIcon(key),
};

const COLOUR_GROUPS = [
  { key: "basis", params: ["foreground", "background"] },
  {
    key: "eyes",
    params: ["eyeFrameColor", "eyeInColor", "finderColor", "finder"],
  },
  { key: "frame", params: ["frameColor"] },
  { key: "multicolor", match: (key) => /^color\d+$/.test(key) },
  { key: "advanced" },
];

function colourGroupFor(key) {
  const group = COLOUR_GROUPS.find(
    (candidate) => candidate.params?.includes(key) || candidate.match?.(key)
  );

  return group?.key ?? "advanced";
}

const ParamField = <template>
  <div
    class="watermark-qr-style__param
      {{if @field.full '--full'}}
      {{if @field.overridden '--overridden'}}"
    data-param={{@field.key}}
  >
    <div class="watermark-qr-style__param-header">
      <label class="watermark-qr-style__param-label">{{@field.label}}</label>

      {{#if @field.overridden}}
        <button
          type="button"
          class="watermark-qr-style__param-reset"
          title={{i18n (themePrefix "settings_ui.reset_param")}}
          disabled={{@disabled}}
          {{on "click" (fn @onReset @field.key)}}
        >{{dIcon "arrow-rotate-left"}}</button>
      {{/if}}
    </div>

    <div class="watermark-qr-style__param-control">
      {{#if @field.isColor}}
        <WatermarkColorField
          @value={{@field.value}}
          @setting={{@field.setting}}
          @disabled={{@disabled}}
          @changeValueCallback={{fn @onUpdate @field.key}}
        />
      {{/if}}
      {{#if @field.isSegmented}}
        <WatermarkChoiceSegmented
          @value={{@field.value}}
          @setting={{@field.setting}}
          @disabled={{@disabled}}
          @changeValueCallback={{fn @onUpdate @field.key}}
        />
      {{/if}}
      {{#if @field.isCombo}}
        <ComboBox
          @content={{@field.comboContent}}
          @value={{@field.value}}
          @onChange={{fn @onUpdate @field.key}}
          @options={{hash disabled=@disabled}}
          class="watermark-qr-style__combo"
        />
      {{/if}}
      {{#if @field.isStepper}}
        <WatermarkStepper
          @value={{@field.value}}
          @setting={{@field.setting}}
          @disabled={{@disabled}}
          @changeValueCallback={{fn @onUpdate @field.key}}
        />
      {{/if}}
      {{#if @field.isSlider}}
        <WatermarkSlider
          @value={{@field.value}}
          @setting={{@field.setting}}
          @disabled={{@disabled}}
          @changeValueCallback={{fn @onUpdate @field.key}}
        />
      {{/if}}
      {{#if @field.isBoolean}}
        <WatermarkSwitch
          @value={{@field.value}}
          @setting={{@field.setting}}
          @disabled={{@disabled}}
          @changeValueCallback={{fn @onUpdate @field.key}}
        />
      {{/if}}
    </div>
  </div>
</template>;

export default class WatermarkQrStyle extends Component {
  @service appEvents;

  @tracked expandedAxis = null;
  @tracked designOpen = false;
  @tracked colourGroup = null;
  @tracked templateThumbnails = {};
  @tracked customThumbnail = null;
  @tracked generated = [];
  @tracked stashedCustom = null;
  @tracked stashedThumbnail = null;
  @tracked
  liveLogoConfig =
    activeLogoConfig() ?? settings.watermark_qrcode_logo_config ?? null;

  #notifier;

  constructor() {
    super(...arguments);
    this.appEvents.on(
      LOGO_CONFIG_CHANGED_EVENT,
      this,
      this.onLogoConfigChanged
    );
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.appEvents.off(
      LOGO_CONFIG_CHANGED_EVENT,
      this,
      this.onLogoConfigChanged
    );
    this.#revokeThumbnails();
    this.#revokeGenerated();

    if (this.customThumbnail) {
      URL.revokeObjectURL(this.customThumbnail);
    }

    if (this.stashedThumbnail) {
      URL.revokeObjectURL(this.stashedThumbnail);
    }
  }

  @cached
  get config() {
    return parseAxisConfig(this.args.value);
  }

  @cached
  get liveLogo() {
    return parseLogoConfig(this.liveLogoConfig);
  }

  @cached
  get templates() {
    const active = templateFor(this.config, this.liveLogo);

    const entries = TEMPLATES.map((template) => ({
      key: template.key,
      label: template.label,
      active: template.key === active,
      image: this.templateThumbnails[template.key],
      icon: patternIcon(template.config.pattern),
    }));

    if (active) {
      if (!this.stashedCustom) {
        return entries;
      }

      return [
        {
          key: "custom",
          label: i18n(themePrefix("settings_ui.axes.custom")),
          active: false,
          image: this.stashedThumbnail,
          icon: patternIcon(this.stashedCustom.config.pattern),
        },
        ...entries,
      ];
    }

    return [
      {
        key: "custom",
        label: i18n(themePrefix("settings_ui.axes.custom")),
        active: true,
        image: this.customThumbnail,
        icon: patternIcon(this.config.pattern),
      },
      ...entries,
    ];
  }

  @cached
  get axes() {
    const config = this.config;
    const template = TEMPLATES.find(
      (entry) => entry.key === templateFor(config, this.liveLogo)
    );

    return AXES.map((axis) => {
      const icon = ICON_FOR[axis.key];

      const current = axis.catalogue.find(
        (entry) => entry.key === config[axis.key]
      );
      const disabledValues =
        current?.exclusive && template?.config[axis.key] === current.key
          ? axis.catalogue
              .filter((entry) => entry.key !== current.key)
              .map((entry) => entry.key)
          : undefined;

      return {
        key: axis.key,
        label: axis.label,
        value: config[axis.key],
        isGallery: axis.control === "gallery",
        expanded: this.expandedAxis === axis.key,
        compact: true,
        disabled: this.args.disabled,
        options: axis.catalogue.map((entry) => ({
          key: entry.key,
          label: entry.label,
          icon: icon ? icon(entry.key) : null,
        })),
        setting: {
          setting: axis.key,
          validValues: axis.catalogue,
          disabledValues,
          computedValueProperty: "key",
          computedNameProperty: "label",
        },
      };
    });
  }

  @cached
  get fields() {
    const config = this.config;

    const valueOf = (key) => config.params[key] ?? SHARED_PARAMS[key]?.default;
    const logoBackground = Boolean(
      this.liveLogoConfig?.enabled && this.liveLogoConfig?.background
    );

    return Object.entries(paramsFor(config))
      .filter(
        ([, spec]) => spec.visible?.(config, valueOf, logoBackground) ?? true
      )
      .map(([key, spec]) => ({
        ...this.#toField(config, key, spec),
        extra: !(key in SHARED_PARAMS),
      }));
  }

  @cached
  get colourGroups() {
    const groups = new Map();

    for (const field of this.fields.filter((candidate) => candidate.isColor)) {
      const key = colourGroupFor(field.key);
      groups.set(key, [...(groups.get(key) ?? []), field]);
    }

    return COLOUR_GROUPS.filter((group) => groups.has(group.key)).map(
      (group) => ({
        key: group.key,
        label: i18n(themePrefix(`settings_ui.axes.colors.${group.key}`)),
        fields: groups.get(group.key),
      })
    );
  }

  get activeTemplate() {
    return templateFor(this.config, this.liveLogo) ?? "custom";
  }

  get generatedOptions() {
    return this.generated.map((entry) => ({
      key: entry.key,
      icon: patternIcon(entry.config.pattern),
      image: entry.thumbnail,
    }));
  }

  get backdrop() {
    return this.config.params.backdrop ?? "solid";
  }

  get expandedAxisEntry() {
    return this.axes.find((axis) => axis.expanded) ?? null;
  }

  get scanWarning() {
    const entry = PATTERN_CATALOGUE.find(
      (candidate) => candidate.key === this.config.pattern
    );

    const eyesFollowSolid =
      entry?.solidEyes &&
      (this.config.eyeFrame === "default" || this.config.eyeIn === "default");

    const fromParams = Object.entries(paramsFor(this.config)).some(
      ([key, spec]) => {
        const value = this.config.params[key] ?? spec.default;
        return typeof spec.warning === "function"
          ? spec.warning(value)
          : spec.warning && value;
      }
    );

    const resolved = resolveAxisParams(this.config);
    const dimBlur =
      resolved.backdrop === "blur" &&
      (resolved.backdropStrength ?? 0.5) < LOW_BACKDROP_STRENGTH &&
      foregroundLuminance(resolved.foreground) > LIGHT_FOREGROUND_LUMINANCE;

    return entry?.warning || eyesFollowSolid || fromParams || dimBlur
      ? i18n(themePrefix("settings_ui.axes.scan_warning"))
      : null;
  }

  get mainFields() {
    return this.fields.filter((field) => !field.extra && !field.isColor);
  }

  get designFields() {
    return this.fields.filter((field) => field.extra && !field.isColor);
  }

  get designToggleLabel() {
    return i18n(
      themePrefix(
        this.designOpen
          ? "settings_ui.axes.fewer_options"
          : "settings_ui.axes.more_options"
      )
    );
  }

  get showColourGroups() {
    return this.colourGroups.length > 1;
  }

  get activeColourGroup() {
    const groups = this.colourGroups;

    return (
      groups.find((group) => group.key === this.colourGroup) ??
      groups[0] ??
      null
    );
  }

  @action
  onLogoConfigChanged(value) {
    this.liveLogoConfig = value ?? null;
  }

  @action
  async loadTemplateThumbnails() {
    const thumbnails = {};

    for (const template of TEMPLATES) {
      thumbnails[template.key] = await this.#renderThumbnail(
        template.config,
        template.logo
      );
    }

    this.#revokeThumbnails();
    this.templateThumbnails = thumbnails;
  }

  @action
  syncCustomThumbnail() {
    if (templateFor(this.config, this.liveLogo)) {
      return;
    }

    debounce(
      this,
      this.#renderCustomThumbnail,
      this.config,
      this.liveLogoConfig,
      CUSTOM_THUMBNAIL_DEBOUNCE
    );
  }

  async #renderCustomThumbnail(config, liveLogoConfig) {
    const logo = liveLogoConfig ? parseLogoConfig(liveLogoConfig) : null;
    const url = await this.#renderThumbnail(
      config,
      logo?.enabled ? logo : undefined
    );

    if (this.isDestroying) {
      URL.revokeObjectURL(url);
      return;
    }

    const previous = this.customThumbnail;
    this.customThumbnail = url;

    if (previous) {
      URL.revokeObjectURL(previous);
    }
  }

  async #renderThumbnail(config, logo) {
    const params = { ...resolveAxisParams(config), ...config.params };

    if (params.backdrop === "blur") {
      params.backdrop = "solid";
    }

    const thumbnailSettings = {
      qrcode_text: THUMBNAIL_TEXT,
      qrcode_error_correction: 1,
      qrcode_size_slack: 0,
      qrcode_style_config: stringifyAxisConfig({ ...config, params }),
    };

    if (logo?.enabled) {
      const resolved = { ...LOGO_DEFAULTS, ...logo };
      thumbnailSettings.qrcode_logo_config = stringifyLogoConfig(resolved);

      if (resolved.source === "icon") {
        thumbnailSettings.qrcode_logo_icon = await resolveIconSVG(
          resolved.icon
        );
      } else if (settings.watermark_qrcode_logo_image) {
        thumbnailSettings.qrcode_logo_image_url = absoluteUploadURL(
          settings.watermark_qrcode_logo_image
        );
      }
    }

    const bytes = await renderQrThumbnail(thumbnailSettings, THUMBNAIL_SIZE);

    return URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  }

  #revokeThumbnails() {
    for (const url of Object.values(this.templateThumbnails)) {
      URL.revokeObjectURL(url);
    }
  }

  #revokeGenerated() {
    for (const entry of this.generated) {
      URL.revokeObjectURL(entry.thumbnail);
    }
  }

  @action
  async generateMore() {
    const configs = Array.from({ length: GENERATED_COUNT }, () =>
      randomStyle({ pattern: this.config.pattern, effect: this.config.effect })
    );
    const logos = configs.map(() => randomLogo());
    const thumbnails = await Promise.all(
      configs.map((config, index) =>
        this.#renderThumbnail(config, logos[index])
      )
    );

    if (this.isDestroying) {
      thumbnails.forEach((url) => URL.revokeObjectURL(url));
      return;
    }

    this.#revokeGenerated();
    this.generated = configs.map((config, index) => ({
      key: `generated-${index}`,
      config,
      logo: logos[index],
      thumbnail: thumbnails[index],
    }));
  }

  @action
  selectGenerated(key) {
    const entry = this.generated.find((candidate) => candidate.key === key);

    if (!entry) {
      return;
    }

    this.#emit(entry.config);
    this.appEvents.trigger(RANDOM_LOGO_EVENT, entry.logo);
  }

  @action
  async selectTemplate(key) {
    if (key === "custom") {
      this.#restoreCustom();
      return;
    }

    if (!templateFor(this.config, this.liveLogo)) {
      await this.#stashCustom();
    }

    this.#emit(applyTemplate(key, this.config));

    const template = TEMPLATES.find((entry) => entry.key === key);

    this.appEvents.trigger(RANDOM_LOGO_EVENT, {
      ...LOGO_DEFAULTS,
      ...template?.logo,
    });
  }

  async #stashCustom() {
    const config = this.config;
    const logoValue = this.liveLogoConfig;
    const logo = logoValue ? parseLogoConfig(logoValue) : null;
    const thumbnail = await this.#renderThumbnail(
      config,
      logo?.enabled ? logo : undefined
    );

    if (this.isDestroying) {
      URL.revokeObjectURL(thumbnail);
      return;
    }

    if (this.stashedThumbnail) {
      URL.revokeObjectURL(this.stashedThumbnail);
    }

    this.stashedCustom = { config, logoValue };
    this.stashedThumbnail = thumbnail;
  }

  #restoreCustom() {
    const stash = this.stashedCustom;

    if (!stash) {
      return;
    }

    this.#emit(stash.config);

    if (stash.logoValue) {
      this.appEvents.trigger(
        RANDOM_LOGO_EVENT,
        parseLogoConfig(stash.logoValue)
      );
    }

    this.stashedCustom = null;

    if (this.stashedThumbnail) {
      URL.revokeObjectURL(this.stashedThumbnail);
      this.stashedThumbnail = null;
    }
  }

  @action
  roll(event) {
    this.#emit(randomStyle({ wild: event.shiftKey }));
    this.appEvents.trigger(RANDOM_LOGO_EVENT, randomLogo());
  }

  #toField(config, key, spec) {
    const params = config.params;
    const value = params[key] ?? spec.default ?? "";
    const isSelect = spec.type === "select";
    const isNumber = spec.type === "number";
    const options = spec.options ?? [];

    const icons = options.every((option) => SHAPE_ICONS[option])
      ? options.map((option) => htmlSafe(SHAPE_ICONS[option]))
      : null;

    const isCombo =
      isSelect && !icons && options.length > SEGMENTED_MAX_OPTIONS;

    const wide =
      isCombo ||
      (isSelect &&
        (options.length > 3 || options.join("").length > MAX_SEGMENTED_CHARS));

    let placeholder = null;
    if (spec.inheritParam) {
      const inherited = params[spec.inheritParam] ?? null;

      if (inherited != null) {
        placeholder =
          inherited?.blend === "random"
            ? (inherited.stops?.[
                (spec.inheritStop ?? 0) % (inherited.stops?.length || 1)
              ] ?? null)
            : inherited;
      } else {
        const parentInherit = SHARED_PARAMS[spec.inheritParam]?.inherit;
        if (parentInherit) {
          placeholder = String(settings[`watermark_${parentInherit}`] ?? "");
        }
      }
    }
    if (!placeholder && spec.inherit) {
      placeholder = String(settings[`watermark_${spec.inherit}`] ?? "");
    }

    const paramKey =
      config.pattern === "tile" && key === "cellColor" ? "tile.cellColor" : key;

    return {
      key,
      uid: `${config.pattern}:${config.effect}:${key}`,
      label: i18n(themePrefix(`settings_ui.axes.params.${paramKey}`), {
        defaultValue: spec.label,
      }),
      full: spec.full ?? (wide || spec.type === "color"),
      overridden: params[key] !== undefined,
      isColor: spec.type === "color",
      isStepper: isNumber && spec.control === "stepper",
      isSlider: isNumber && spec.control !== "stepper",
      isBoolean: spec.type === "boolean",
      isSegmented: isSelect && !isCombo,
      isCombo,
      comboContent: options.map((option) => ({
        id: option,
        name: String(option).replaceAll("_", " ").replaceAll("-", " "),
      })),
      value,
      setting: {
        setting: key,
        min: spec.min,
        max: spec.max,
        step: spec.step,
        validValues: spec.options,
        icons,
        placeholder,
        allowEmpty: Boolean(spec.inherit),
        allowGradient: Boolean(spec.gradient),
        stopsOnly: spec.gradient === "stops",
      },
    };
  }

  @action
  registerNotifier(element) {
    this.#notifier = element;
  }

  #emit(config) {
    const specs = paramsFor(config);
    const params = Object.fromEntries(
      Object.entries(config.params).filter(([key]) => key in specs)
    );

    this.args.changeValueCallback(stringifyAxisConfig({ ...config, params }));
    this.#notifier?.dispatchEvent(new Event("input", { bubbles: true }));
  }

  @action
  toggleAxis(key) {
    this.expandedAxis = this.expandedAxis === key ? null : key;
  }

  @action
  toggleDesign() {
    this.designOpen = !this.designOpen;
  }

  @action
  selectColourGroup(key) {
    this.colourGroup = key;
  }

  @action
  previewAxis(axisKey, key) {
    this.appEvents.trigger(
      PREVIEW_STYLE_EVENT,
      key ? stringifyAxisConfig({ ...this.config, [axisKey]: key }) : null
    );
  }

  @action
  selectAxis(axisKey, key) {
    this.#emit({ ...this.config, [axisKey]: key });
  }

  @action
  resetParam(key) {
    const config = this.config;
    const params = { ...config.params };

    delete params[key];
    this.#emit({ ...config, params });
  }

  @action
  updateParam(key, value) {
    const config = this.config;
    const spec = paramsFor(config)[key];

    if (spec?.inherit && (value === "" || value == null)) {
      const params = { ...config.params };
      delete params[key];
      this.#emit({ ...config, params });
      return;
    }

    if (spec?.type === "number") {
      value = Number(value);
    }

    const params = { ...config.params };
    if (value === spec?.default) {
      delete params[key];
    } else {
      params[key] = value;
    }

    this.#emit({ ...config, params });
  }

  <template>
    <div
      class="watermark-qr-style"
      data-pattern={{this.config.pattern}}
      data-backdrop={{this.backdrop}}
      ...attributes
    >
      <input
        type="hidden"
        class="watermark-qr-style__notifier"
        {{didInsert this.registerNotifier}}
      />

      {{#if this.templates.length}}
        <div class="watermark-qr-style__templates">
          <div class="watermark-qr-style__section-label">
            {{i18n (themePrefix "settings_ui.axes.templates")}}

            <button
              type="button"
              class="btn btn-flat watermark-qr-style__roll"
              title={{i18n (themePrefix "settings_ui.axes.roll_title")}}
              disabled={{@disabled}}
              {{on "click" this.roll}}
            >
              {{i18n (themePrefix "settings_ui.axes.roll")}}
            </button>
          </div>

          <WatermarkAxisGallery
            {{didInsert this.loadTemplateThumbnails}}
            {{didInsert this.syncCustomThumbnail}}
            {{didUpdate this.syncCustomThumbnail @value this.liveLogoConfig}}
            data-axis="template"
            @compact={{true}}
            @options={{this.templates}}
            @value={{this.activeTemplate}}
            @expanded={{true}}
            @disabled={{@disabled}}
            @onSelect={{this.selectTemplate}}
          />

          <div class="watermark-qr-style__generated">
            <button
              type="button"
              class="btn btn-flat watermark-qr-style__generate-more"
              title={{i18n
                (themePrefix "settings_ui.axes.generate_more_title")
              }}
              disabled={{@disabled}}
              {{on "click" this.generateMore}}
            >
              {{dIcon "shuffle"}}
              {{i18n (themePrefix "settings_ui.axes.generate_more")}}
            </button>

            {{#if this.generatedOptions.length}}
              <WatermarkAxisGallery
                data-axis="generated"
                @compact={{true}}
                @options={{this.generatedOptions}}
                @expanded={{true}}
                @disabled={{@disabled}}
                @onSelect={{this.selectGenerated}}
              />
            {{/if}}
          </div>
        </div>
      {{/if}}

      <div class="watermark-qr-style__axes">
        <div class="watermark-qr-style__axes-row">
          {{#each this.axes key="key" as |axis|}}
            {{#if axis.isGallery}}
              <WatermarkAxisGallery
                data-axis={{axis.key}}
                @label={{axis.label}}
                @options={{axis.options}}
                @value={{axis.value}}
                @expanded={{false}}
                @open={{axis.expanded}}
                @compact={{axis.compact}}
                @disabled={{axis.disabled}}
                @onToggle={{fn this.toggleAxis axis.key}}
              />
            {{/if}}
          {{/each}}
        </div>

        {{#if this.expandedAxisEntry}}
          <WatermarkAxisGallery
            data-axis={{this.expandedAxisEntry.key}}
            class="watermark-qr-style__axis-panel"
            @options={{this.expandedAxisEntry.options}}
            @value={{this.expandedAxisEntry.value}}
            @expanded={{true}}
            @compact={{this.expandedAxisEntry.compact}}
            @disabled={{this.expandedAxisEntry.disabled}}
            @onToggle={{fn this.toggleAxis this.expandedAxisEntry.key}}
            @onSelect={{fn this.selectAxis this.expandedAxisEntry.key}}
            @onPreview={{fn this.previewAxis this.expandedAxisEntry.key}}
          />
        {{/if}}

        {{#each this.axes key="key" as |axis|}}
          {{#unless axis.isGallery}}
            <div
              class="watermark-qr-style__axis {{if axis.disabled '--disabled'}}"
            >
              <div class="watermark-qr-style__axis-label">{{axis.label}}</div>
              <WatermarkChoiceSegmented
                @value={{axis.value}}
                @setting={{axis.setting}}
                @disabled={{axis.disabled}}
                @changeValueCallback={{fn this.selectAxis axis.key}}
              />
            </div>
          {{/unless}}
        {{/each}}
      </div>

      {{#if this.scanWarning}}
        <div class="watermark-qr-style__warning">{{this.scanWarning}}</div>
      {{/if}}

      {{#if this.activeColourGroup}}
        <div class="watermark-qr-style__colors">
          <div class="watermark-qr-style__section-label">
            {{i18n (themePrefix "settings_ui.axes.colors.label")}}
          </div>

          {{#if this.showColourGroups}}
            <WatermarkChoiceSegmented
              @value={{this.activeColourGroup.key}}
              @setting={{hash
                setting="colorGroup"
                validValues=this.colourGroups
                computedValueProperty="key"
                computedNameProperty="label"
              }}
              @disabled={{@disabled}}
              @changeValueCallback={{this.selectColourGroup}}
            />
          {{/if}}

          <div class="watermark-qr-style__params">
            {{#each this.activeColourGroup.fields key="uid" as |field|}}
              <ParamField
                @field={{field}}
                @disabled={{@disabled}}
                @onUpdate={{this.updateParam}}
                @onReset={{this.resetParam}}
              />
            {{/each}}
          </div>
        </div>
      {{/if}}

      {{#if this.mainFields}}
        <div class="watermark-qr-style__params">
          {{#each this.mainFields key="uid" as |field|}}
            <ParamField
              @field={{field}}
              @disabled={{@disabled}}
              @onUpdate={{this.updateParam}}
              @onReset={{this.resetParam}}
            />
          {{/each}}
        </div>
      {{/if}}

      {{#if this.designFields}}
        <div class="watermark-qr-style__design">
          <button
            type="button"
            class="btn btn-default btn-small watermark-qr-style__design-toggle"
            aria-expanded={{if this.designOpen "true" "false"}}
            disabled={{@disabled}}
            {{on "click" this.toggleDesign}}
          >
            {{dIcon (if this.designOpen "chevron-up" "chevron-down")}}
            <span class="d-button-label">{{this.designToggleLabel}}</span>
          </button>

          {{#if this.designOpen}}
            <div class="watermark-qr-style__params">
              {{#each this.designFields key="uid" as |field|}}
                <ParamField
                  @field={{field}}
                  @disabled={{@disabled}}
                  @onUpdate={{this.updateParam}}
                  @onReset={{this.resetParam}}
                />
              {{/each}}
            </div>
          {{/if}}
        </div>
      {{/if}}
    </div>
  </template>
}
