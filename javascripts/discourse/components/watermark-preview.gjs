import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { getOwner } from "@ember/owner";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import didUpdate from "@ember/render-modifiers/modifiers/did-update";
import { debounce, next } from "@ember/runloop";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import DButton from "discourse/components/d-button";
import PickFilesButton from "discourse/components/pick-files-button";
import { bind } from "discourse/lib/decorators";
import lightbox from "discourse/lib/lightbox";
import { withPluginApi } from "discourse/lib/plugin-api";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";
import { imageURLToFile } from "../lib/media-watermark-utils";
import Watermark, { WATERMARK_ALLOWED_EXTS_STRING } from "../lib/watermark";
import draggablePanel from "../modifiers/drag-panel";

const DEFAULT_PANEL_WIDTH = 300; // .watermark-preview__container
const MAX_PREVIEW_SHARE = 0.55;
const SAMPLE_SEED_COUNT = 1000;

function randomSampleId() {
  return Math.floor(Math.random() * SAMPLE_SEED_COUNT);
}
const SAMPLE_SIZES = [
  { label: "300 × 200", width: 300, height: 200 },
  { label: "600 × 400", width: 600, height: 400 },
  { label: "1200 × 800", width: 1200, height: 800 },
  { label: "2400 × 1600", width: 2400, height: 1600 },
];

const SPINNER_DELAY = 500;

const SETTING_CONTAINER_SELECTOR = ".theme.settings > [data-setting]";
const SETTING_INPUT_SELECTOR = `${SETTING_CONTAINER_SELECTOR} input:not([type="file"])`;
const SETTINGS_SECTION_SELECTOR =
  '.theme.settings [data-setting^="watermark_"]';

const CONTAINER_SELECTOR = ".watermark-preview__container";
const IMAGE_SELECTOR = ".watermark-preview__image";
const ACTIONS_SELECTOR = ".watermark-preview__actions";

const UPLOAD_PREFIX_ID = "site-setting-file-uploader";

const DOCK_GAP = 12;
const DOCK_MARGIN = 12;

const SETTING_BOUNDS = {
  watermark_qrcode_quiet_zone: { min: 0, max: 10 },
  watermark_opacity: { min: 1, max: 100 },
  watermark_relative_width: { min: 1, max: 100 },
  watermark_absolute_scale: { min: 0.01 },
  watermark_max_size: { min: 1, max: 100 },
  watermark_rotate: { min: -360, max: 360 },
  watermark_pattern_max_count: { min: 0 },
};

export default class WatermarkPreview extends Component {
  @service appEvents;
  @service siteSettings;

  @tracked imageSourceURL;
  @tracked imageLoading;
  @tracked sampleSize = SAMPLE_SIZES[0];
  @tracked sampleId = randomSampleId();
  @tracked result = null;
  @tracked userResizedPanel = false;

  applyingWatermark = false;
  lightboxURL = null;
  previousSettingsValues = {};
  userMovedPreview = false;
  appliedWidth = null;

  registerEvents = modifier(() => {
    if (!this.args.theme) {
      return;
    }

    const onSettingInput = (event) => {
      if (event.target?.matches?.(SETTING_INPUT_SELECTOR)) {
        this.onSettingChange();
      }
    };

    document.addEventListener("input", onSettingInput, { capture: true });

    const onClick = (event) => {
      const target = event.target;

      const buttonAllowed = (element, classname) =>
        element.classList?.contains(classname) ||
        element.closest("button")?.classList.contains(classname);

      if (buttonAllowed(target, "undo") || buttonAllowed(target, "cancel")) {
        next(this, this.onSettingChange);
      }
    };

    document.addEventListener("click", onClick, { capture: true });

    withPluginApi((api) => {
      api.modifySelectKit("single-select").onChange(this.onSettingChange);
    });

    const uploadEvents = this.args.theme.settings
      .filter((setting) => setting.type === "upload")
      .map((setting) => ({
        event: `upload-mixin:${UPLOAD_PREFIX_ID}-${setting.setting}:upload-success`,
        handler: this.onUploadSettingChange.bind(this, setting.setting),
      }));

    uploadEvents.forEach(({ event, handler }) =>
      this.appEvents.on(event, handler)
    );

    return () => {
      document.removeEventListener("input", onSettingInput, { capture: true });
      document.removeEventListener("click", onClick, { capture: true });

      uploadEvents.forEach(({ event, handler }) =>
        this.appEvents.off(event, handler)
      );
    };
  });

  sizePanel = modifier((element) => {
    if (this.userResizedPanel) {
      return;
    }

    this.appliedWidth = this.panelWidth;
    element.style.width = `${this.appliedWidth}px`;
  });

  observePanelResize = modifier((element) => {
    const observer = new ResizeObserver(([entry]) => {
      this.onPanelResized(entry.contentRect.width);
    });

    observer.observe(element);

    return () => observer.disconnect();
  });

  positionDock = modifier((element) => {
    const column = document.querySelector(".admin-customize-themes-show");
    const section = this.args.anchorSelector
      ? document.querySelector(this.args.anchorSelector)
      : document
          .querySelector(SETTINGS_SECTION_SELECTOR)
          ?.closest(".theme.settings");

    if (!column || !section) {
      return;
    }

    const intendedWidth = () => {
      const inline = parseFloat(element.style.width);
      return Number.isFinite(inline) ? inline : element.offsetWidth;
    };

    const reposition = () => {
      const columnRect = column.getBoundingClientRect();
      const room = window.innerWidth - columnRect.right;

      // Measured against the default width so resizing by hand never docks it.
      const fits = room >= DEFAULT_PANEL_WIDTH + DOCK_GAP + DOCK_MARGIN;

      if (!fits) {
        element.classList.add("--compact");

        if (!this.userMovedPreview) {
          element.style.top = "";
          element.style.left = "";
        }
        return;
      }

      element.classList.remove("--compact");

      if (this.userMovedPreview) {
        return;
      }

      const panelHeight = element.offsetHeight;
      const rect = section.getBoundingClientRect();
      const centered = (window.innerHeight - panelHeight) / 2;
      const top = Math.max(
        rect.top,
        Math.min(centered, rect.bottom - panelHeight)
      );

      const left = Math.min(
        columnRect.right + DOCK_GAP,
        window.innerWidth - intendedWidth() - DOCK_MARGIN
      );

      element.style.left = `${Math.max(DOCK_MARGIN, left)}px`;
      element.style.top = `${top}px`;
    };

    reposition();
    window.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition);

    return () => {
      window.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
    };
  });

  willDestroy() {
    super.willDestroy(...arguments);

    if (this.imageSourceURL) {
      URL.revokeObjectURL(this.imageSourceURL);
    }

    if (this.lightboxURL) {
      URL.revokeObjectURL(this.lightboxURL);
    }
  }

  get imageElement() {
    return document.querySelector(IMAGE_SELECTOR);
  }

  get panelWidth() {
    const room = Math.floor(window.innerWidth * MAX_PREVIEW_SHARE);
    return Math.max(DEFAULT_PANEL_WIDTH, Math.min(this.sampleSize.width, room));
  }

  get resolvedSettings() {
    return this.args.settings ?? this.settingsValues();
  }

  @action
  async applyWatermark(element, options = {}) {
    if (this.applyingWatermark) {
      this.onSettingChange();
      return;
    }

    const uploadButton = element.parentElement.querySelector(
      ".pick-files-button button"
    );

    setTimeout(() => {
      if (this.applyingWatermark) {
        this.imageLoading = true;
        uploadButton?.setAttribute("disabled", true);
      }
    }, SPINNER_DELAY);

    this.applyingWatermark = true;

    try {
      await this.#renderWatermark(element, options);
    } finally {
      this.applyingWatermark = false;
      this.imageLoading = false;
      uploadButton?.removeAttribute("disabled");
    }
  }

  async #renderWatermark(element, options) {
    const settingsValues = this.resolvedSettings;
    const emptyWatermark =
      !settingsValues.watermark_image &&
      !settingsValues.watermark_qrcode_enabled;

    let file = this.imageSourceFile;

    if (!file || options.refreshImage || emptyWatermark) {
      file = await this.initImage();

      if (emptyWatermark) {
        await this.paintFile(element, file);
        return;
      }
    }

    const watermark = new Watermark(getOwner(this), file, {
      overwriteOptions: settingsValues,
    });

    const { data: imageData, meta } = await watermark.process();

    if (!imageData) {
      return;
    }

    this.paintImageData(element, imageData);
    this.result = meta;
  }

  canvasFor(element) {
    return element.querySelector(".watermark-preview__canvas");
  }

  paintImageData(element, imageData) {
    const canvas = this.canvasFor(element);

    if (
      canvas.width !== imageData.width ||
      canvas.height !== imageData.height
    ) {
      canvas.width = imageData.width;
      canvas.height = imageData.height;
    }

    canvas.getContext("2d").putImageData(imageData, 0, 0);
  }

  // Used when there is nothing to watermark: show the source as-is.
  async paintFile(element, file) {
    const bitmap = await createImageBitmap(file);
    const canvas = this.canvasFor(element);

    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close();
  }

  get sampleSizes() {
    return SAMPLE_SIZES.map((size) => ({
      label: size.label,
      value: size,
      active: size.width === this.sampleSize.width,
    }));
  }

  get summary() {
    const meta = this.result;

    if (!meta) {
      return null;
    }

    const share = Math.round((meta.watermarkWidth / meta.uploadWidth) * 100);
    const tiles = meta.tiles > 1 ? ` · ${meta.tiles} tiles` : "";
    const perModule = meta.modules
      ? ` · ${Math.round(meta.watermarkWidth / meta.modules)}px/module`
      : "";

    const scale =
      this.panelWidth < meta.uploadWidth
        ? ` · ${i18n(themePrefix("preview.scaled"), {
            percent: Math.round((this.panelWidth / meta.uploadWidth) * 100),
          })}`
        : "";

    return `${meta.uploadWidth}×${meta.uploadHeight} · watermark ${meta.watermarkWidth}px (${share}%)${perModule}${tiles}${scale}`;
  }

  @action
  selectSampleSize(size) {
    this.userResizedPanel = false;

    if (size.width === this.sampleSize.width) {
      return;
    }

    this.sampleSize = size;
    this.applyWatermark(this.imageElement, { refreshImage: true });
  }

  @bind
  onPanelResized(width) {
    if (!this.userResizedPanel && Math.abs(width - this.appliedWidth) < 1) {
      return;
    }

    this.userResizedPanel = true;

    const bucket =
      SAMPLE_SIZES.find((size) => size.width >= width) ??
      SAMPLE_SIZES[SAMPLE_SIZES.length - 1];

    if (bucket.width === this.sampleSize.width) {
      return;
    }

    debounce(this, this.switchSampleBucket, bucket, UPDATE_DEBOUNCE);
  }

  @bind
  switchSampleBucket(bucket) {
    this.sampleSize = bucket;
    this.applyWatermark(this.imageElement, { refreshImage: true });
  }

  @action
  async openLightbox() {
    const container = this.imageElement?.closest(CONTAINER_SELECTOR);
    const anchor = container?.querySelector("a.lightbox");
    const canvas = this.imageElement && this.canvasFor(this.imageElement);

    if (!anchor || !canvas) {
      return;
    }

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png")
    );

    if (this.lightboxURL) {
      URL.revokeObjectURL(this.lightboxURL);
    }

    this.lightboxURL = URL.createObjectURL(blob);

    anchor.href = this.lightboxURL;
    anchor.dataset.largeSrc = this.lightboxURL;
    anchor.dataset.downloadHref = this.lightboxURL;
    anchor.dataset.targetWidth = canvas.width;
    anchor.dataset.targetHeight = canvas.height;
    anchor.querySelector(".informations").textContent =
      `${canvas.width}×${canvas.height}`;

    await lightbox(container, this.siteSettings);
    anchor.click();
  }

  @action
  async initImage() {
    const { width, height } = this.sampleSize;
    const { file, url } = await imageURLToFile(
      `https://picsum.photos/seed/${this.sampleId}/${width}/${height}`,
      { returnOriginalUrl: true }
    );

    if (this.imageSourceURL) {
      URL.revokeObjectURL(this.imageSourceURL);
    }

    const uploadinput = document.querySelector(
      `${ACTIONS_SELECTOR} .pick-files-button input`
    );

    if (uploadinput) {
      uploadinput.value = "";
    }

    this.imageSourceURL = url;
    this.imageSourceFile = file;

    return file;
  }

  @action
  uploadImage(files) {
    const file = files[0];

    if (this.imageSourceURL) {
      URL.revokeObjectURL(this.imageSourceURL);
    }

    this.imageSourceURL = URL.createObjectURL(file);
    this.imageSourceFile = file;

    this.applyWatermark(this.imageElement);
  }

  @action
  refreshImage() {
    this.sampleId = randomSampleId();
    this.applyWatermark(this.imageElement, { refreshImage: true });
  }

  @action
  reapply() {
    if (this.imageElement) {
      this.applyWatermark(this.imageElement);
    }
  }

  @action
  markPreviewMoved() {
    this.userMovedPreview = true;
  }

  @bind
  onUploadSettingChange(settingName, fileName, upload) {
    this.onSettingChange({
      type: "file",
      setting: settingName,
      value: upload.url,
    });
  }

  @bind
  onSettingChange() {
    debounce(
      this,
      this.onSettingChangeDebounced,
      this.imageElement,
      UPDATE_DEBOUNCE
    );
  }

  @bind
  onSettingChangeDebounced(element) {
    this.applyWatermark(element);
  }

  settingsValues() {
    return this.args.theme.settings.reduce((values, themeSetting) => {
      const name = themeSetting.setting;
      const type = themeSetting.type;
      let value = themeSetting.buffered.get("value");

      switch (type) {
        case "bool":
          value = String(value) === "true";
          break;
        case "integer":
          value = parseInt(value, 10);
          break;
        case "float":
          value = /^-?\d+\.$/.test(value) ? NaN : parseFloat(value);
          break;
      }

      if (this.#isValueOutOfBounds(name, type, value)) {
        value = this.previousSettingsValues[name];
      } else {
        this.previousSettingsValues[name] = value;
      }

      values[name] = value;
      return values;
    }, {});
  }

  #isValueOutOfBounds(name, type, value) {
    if (type !== "integer" && type !== "float") {
      return false;
    }

    if (isNaN(value)) {
      return true;
    }

    const bounds = SETTING_BOUNDS[name];
    if (!bounds) {
      return false;
    }

    return (
      (bounds.min !== undefined && value < bounds.min) ||
      (bounds.max !== undefined && value > bounds.max)
    );
  }

  <template>
    <div
      class="watermark-preview__container"
      {{this.registerEvents}}
      {{this.positionDock}}
      {{this.sizePanel}}
      {{this.observePanelResize}}
    >
      <div
        class="watermark-preview__header"
        {{draggablePanel CONTAINER_SELECTOR onStart=this.markPreviewMoved}}
      >
        <div class="watermark-preview__title">
          {{dIcon "grip-vertical"}}
          <span>{{i18n (themePrefix "preview.title")}}</span>
        </div>
        <div class="watermark-preview__actions">
          {{#if this.imageLoading}}
            <div class="spinner small"></div>
          {{/if}}
          <DButton
            @action={{this.openLightbox}}
            @icon="discourse-expand"
            @translatedTitle={{i18n (themePrefix "preview.buttons.expand")}}
            class="btn-transparent"
          />
          <PickFilesButton
            @allowMultiple={{false}}
            @showButton={{true}}
            @onFilesPicked={{this.uploadImage}}
            @disabled={{this.imageLoading}}
            @acceptedFormatsOverride={{WATERMARK_ALLOWED_EXTS_STRING}}
            @acceptedFileTypesString={{WATERMARK_ALLOWED_EXTS_STRING}}
            @icon="upload"
            class="btn-transparent"
            accept="image/*"
            name="image-uploader"
          />
          <DButton
            @icon="arrows-rotate"
            class="btn-transparent"
            @translatedTitle={{i18n (themePrefix "preview.buttons.refresh")}}
            @disabled={{this.imageLoading}}
            @action={{this.refreshImage}}
          />
          <DButton
            @icon="xmark"
            class="btn-transparent"
            @translatedTitle={{i18n (themePrefix "preview.buttons.close")}}
            @action={{@onClose}}
          />
        </div>
      </div>
      <div
        class="watermark-preview__image"
        {{didInsert this.applyWatermark}}
        {{didUpdate this.reapply @settings}}
      >
        {{~! no whitespace ~}}
        <canvas class="watermark-preview__canvas"></canvas>
        {{~! no whitespace ~}}
      </div>

      <div class="watermark-preview__footer">
        <div class="watermark-preview__sizes">
          {{#each this.sampleSizes key="label" as |size|}}
            <button
              type="button"
              class="watermark-preview__size {{if size.active '--active'}}"
              disabled={{this.imageLoading}}
              {{on "click" (fn this.selectSampleSize size.value)}}
            >{{size.label}}</button>
          {{/each}}
        </div>

        {{#if this.summary}}
          <div class="watermark-preview__summary">{{this.summary}}</div>
        {{/if}}
      </div>

      <a class="lightbox" href="#" hidden>
        <div class="meta"><span class="informations"></span></div>
      </a>
    </div>
  </template>
}
