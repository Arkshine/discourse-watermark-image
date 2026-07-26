import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { getOwner } from "@ember/owner";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import didUpdate from "@ember/render-modifiers/modifiers/did-update";
import { debounce } from "@ember/runloop";
import { service } from "@ember/service";
import { trustHTML } from "@ember/template";
import { modifier } from "ember-modifier";
import DButton from "discourse/components/d-button";
import PickFilesButton from "discourse/components/pick-files-button";
import { bind } from "discourse/lib/decorators";
import { withPluginApi } from "discourse/lib/plugin-api";
import dIcon from "discourse/ui-kit/helpers/d-icon";
import { i18n } from "discourse-i18n";
import { imageDataToFile, imageURLToFile } from "../lib/media-watermark-utils";
import Watermark, { WATERMARK_ALLOWED_EXTS_STRING } from "../lib/watermark";
import draggablePanel from "../modifiers/drag-panel";

const PREVIEW_IMAGE_WIDTH = "300px";
const PREVIEW_IMAGE_HEIGHT = "200px";
const IMAGE_BANK_URL = "https://picsum.photos/600/400";
const UPDATE_DEBOUNCE = 25;
const SPINNER_DELAY = 500;

const SETTING_CONTAINER_SELECTOR = ".theme.settings > [data-setting]";
const SETTING_INPUT_SELECTOR = `${SETTING_CONTAINER_SELECTOR} input:not([type="file"])`;
const SETTINGS_SECTION_SELECTOR =
  '.theme.settings [data-setting^="watermark_"]';

const CONTAINER_SELECTOR = ".watermark-preview__container";
const IMAGE_SELECTOR = ".watermark-preview__resizable";
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

  @tracked imageSourceURL;
  @tracked imageLoading;

  applyingWatermark = false;
  previousSettingsValues = {};
  userMovedPreview = false;
  previewObjectURL = null;

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
        this.onSettingChange();
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

    const reposition = () => {
      const columnRect = column.getBoundingClientRect();
      const panelWidth = element.offsetWidth;

      const fits =
        window.innerWidth - columnRect.right >=
        panelWidth + DOCK_GAP + DOCK_MARGIN;

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

      element.style.left = `${columnRect.right + DOCK_GAP}px`;
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

    if (this.previewObjectURL) {
      URL.revokeObjectURL(this.previewObjectURL);
    }
    if (this.imageSourceURL) {
      URL.revokeObjectURL(this.imageSourceURL);
    }
  }

  get imageElement() {
    return document.querySelector(IMAGE_SELECTOR);
  }

  get imageStyle() {
    return trustHTML(
      `width: ${PREVIEW_IMAGE_WIDTH}; min-width: ${PREVIEW_IMAGE_WIDTH}; min-height: ${PREVIEW_IMAGE_HEIGHT};`
    );
  }

  get resolvedSettings() {
    return this.args.settings ?? this.settingsValues();
  }

  @action
  async applyWatermark(element, options = {}) {
    const settingsValues = this.resolvedSettings;
    const emptyWatermark =
      !settingsValues.watermark_image &&
      !settingsValues.watermark_qrcode_enabled;

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

    let file = this.imageSourceFile;

    if (!file || options.refreshImage || emptyWatermark) {
      file = await this.initImage();

      if (emptyWatermark) {
        this.imageLoading = false;
        this.applyingWatermark = false;
        return;
      }
    }

    const watermark = new Watermark(getOwner(this), file, {
      overwriteOptions: settingsValues,
    });

    const imageData = await watermark.process();

    if (!imageData) {
      this.applyingWatermark = false;
      this.imageLoading = false;
      uploadButton?.removeAttribute("disabled");
      return;
    }

    const watermarkFile = await imageDataToFile(imageData, {
      fileName: file.name,
      fileType: file.type,
    });

    this.applyingWatermark = false;
    this.imageLoading = false;
    uploadButton?.removeAttribute("disabled");

    if (this.previewObjectURL) {
      URL.revokeObjectURL(this.previewObjectURL);
    }
    this.previewObjectURL = URL.createObjectURL(watermarkFile);
    element.firstChild.src = this.previewObjectURL;
  }

  @action
  async initImage() {
    const { file, url } = await imageURLToFile(IMAGE_BANK_URL, {
      returnOriginalUrl: true,
    });

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
        class="watermark-preview__resizable"
        style={{this.imageStyle}}
        {{didInsert this.applyWatermark}}
        {{didUpdate this.reapply @settings}}
      >
        {{~! no whitespace ~}}
        <img src={{this.imageSourceURL}} />
        {{~! no whitespace ~}}
      </div>
    </div>
  </template>
}
