import { tracked } from "@glimmer/tracking";
import Component from "@ember/component";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { debounce } from "@ember/runloop";
import { service } from "@ember/service";
import { htmlSafe } from "@ember/template";
import { modifier } from "ember-modifier";
import DButton from "discourse/components/d-button";
import PickFilesButton from "discourse/components/pick-files-button";
import { withPluginApi } from "discourse/lib/plugin-api";
import draggable from "discourse/modifiers/draggable";
import { bind } from "discourse-common/utils/decorators";
import { i18n } from "discourse-i18n";
import {
  imageDataToFile,
  imageURLToFile,
} from "../../lib/media-watermark-utils";
import Watermark from "../../lib/watermark";

const PREVIEW_IMAGE_WIDTH = "300px";
const PREVIEW_IMAGE_HEIGHT = "200px";
const IMAGE_BANK_URL = "https://picsum.photos/1200/800";
const DEBOUNCED_UPDATE_IMAGE = 100;

const SETTING_CONTAINER_SELECTOR = ".theme.settings > [data-setting]";
const SETTING_INPUT_SELECTOR = `${SETTING_CONTAINER_SELECTOR} input:not([type="file"])`;

const CONTAINER_SELECTOR = ".watermark-preview__container";
const IMAGE_SELECTOR = ".watermark-preview__resizable";

const UPLOAD_PREFIX_ID = "site-setting-image-uploader";

export default class PreviewWatermark extends Component {
  @service router;
  @service site;

  @tracked showPreview;
  @tracked imageSourceURL;

  resizing = false;
  dragging = false;
  dragOffset = null;
  applyingWatermark = false;

  registerEvents = modifier(() => {
    document.querySelectorAll(SETTING_INPUT_SELECTOR).forEach((input) => {
      input.addEventListener("input", this.onSettingChange);
    });

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

    withPluginApi("1.8.0", (api) => {
      api.modifySelectKit("single-select").onChange(this.onSettingChange);
    });

    const uploadEvents = this.outletArgs.theme.settings
      .filter((setting) => setting.type === "upload")
      .map((setting) => ({
        event: `upload-mixin:${UPLOAD_PREFIX_ID}-${setting.setting}:upload-success`,
        handler: this.onUploadSettingChange.bind(this, setting.setting),
      }));

    uploadEvents.forEach(({ event, handler }) =>
      this.appEvents.on(event, handler)
    );

    const createActionsElement = document.querySelector(".create-actions");
    const watermarkPreviewContainer =
      document.querySelector(CONTAINER_SELECTOR);

    const handleSroll = () => {
      const scrollTop = window.scrollY || window.pageYOffset;
      if (scrollTop >= this.createActionsTop) {
        watermarkPreviewContainer.style.top =
          Math.max(this.createActionsTop, scrollTop) + "px";
      }
    };

    if (createActionsElement && watermarkPreviewContainer) {
      watermarkPreviewContainer.style.top =
        Math.max(this.createActionsTop, window.scrollY || window.pageYOffset) +
        "px";

      window.addEventListener("scroll", handleSroll);
    }

    return () => {
      document.querySelectorAll(SETTING_INPUT_SELECTOR).forEach((input) => {
        input.removeEventListener("input", this.onSettingChange);
      });

      document.removeEventListener("click", onClick, { capture: true });

      uploadEvents.forEach(({ event, handler }) =>
        this.appEvents.off(event, handler)
      );

      window.removeEventListener("scroll", handleSroll);
    };
  });

  get shouldDisplay() {
    const { currentRoute } = this.router;

    return (
      currentRoute.name === "adminCustomizeThemes.show.index" &&
      currentRoute.attributes.component &&
      currentRoute.attributes.theme_fields.length > 0 &&
      currentRoute.attributes.theme_fields.findBy(
        "name",
        "discourse/api-initializers/watermark-image.js"
      )
    );
  }

  get imageElement() {
    return document.querySelector(IMAGE_SELECTOR);
  }

  get imageStyle() {
    return htmlSafe(
      `width: ${PREVIEW_IMAGE_WIDTH}; min-width: ${PREVIEW_IMAGE_WIDTH}; min-height: ${PREVIEW_IMAGE_HEIGHT};`
    );
  }

  @action
  togglePreview() {
    this.showPreview = !this.showPreview;
  }

  @action
  async applyWatermark(element, options = {}) {
    if (!settings.watermark_image) {
      return;
    }

    if (this.applyingWatermark) {
      this.onSettingChange();
      return;
    }

    const settingsValues = this.settingsValues;
    const emptyWatermark = !settingsValues.watermark_image;

    let file = this.imageSourceFile;

    if (!file || options.refreshImage || emptyWatermark) {
      file = await this.initImage();

      if (emptyWatermark) {
        return;
      }
    }

    this.applyingWatermark = true;

    const watermark = new Watermark(file, settingsValues);
    const imageData = await watermark.sendToWorker();
    const watermarkFile = await imageDataToFile(imageData, {
      fileName: file.name,
      fileType: file.type,
    });

    this.applyingWatermark = false;

    const reader = new FileReader();
    reader.readAsDataURL(watermarkFile);
    reader.onload = (e) => {
      element.firstChild.src = e.target.result;
    };
  }

  @action
  async initImage() {
    const { file, url } = await imageURLToFile(IMAGE_BANK_URL, {
      returnOriginalUrl: true,
    });

    this.imageSourceURL = url;
    this.imageSourceFile = file;
    this.showPreview = !this.site.mobileView;

    if (!this.createActionsTop) {
      this.createActionsTop =
        document
          .querySelector('[data-setting="watermark_image"]')
          ?.getBoundingClientRect().top || 0;
    }

    return file;
  }

  @action
  uploadImage(files) {
    const file = files[0];

    this.imageSourceURL = URL.createObjectURL(file);
    this.imageSourceFile = file;

    this.applyWatermark(this.imageElement);
  }

  @action
  refreshImage() {
    this.applyWatermark(this.imageElement, { refreshImage: true });
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
      DEBOUNCED_UPDATE_IMAGE
    );
  }

  @bind
  onSettingChangeDebounced(element) {
    this.applyWatermark(element);
  }

  get settingsValues() {
    const settingsMap = this.outletArgs.theme.settings.reduce(
      (acc, themeSetting) => ({
        ...acc,
        [themeSetting.setting]: themeSetting.type,
      }),
      {}
    );

    const settingsNamesList = Object.keys(settingsMap);

    return Array.from(document.querySelectorAll(SETTING_CONTAINER_SELECTOR))
      .filter((element) => settingsNamesList.includes(element.dataset.setting))
      .map((element) => {
        const settingName = element.dataset.setting;
        const inputType = settingsMap[settingName];

        let inputValue;

        switch (inputType) {
          case "integer":
          case "float":
          case "string":
            inputValue = element.querySelector("input")?.value;
            break;
          case "bool":
            inputValue = element.querySelector("input")?.checked;
            break;
          case "enum":
            inputValue = element.querySelector(".selected-name.choice").dataset
              .value;
            break;
          case "upload":
            inputValue = element
              .querySelector(".lightbox")
              ?.getAttribute("href");
            break;
        }

        switch (inputType) {
          case "integer":
            inputValue = parseInt(inputValue, 10);
            break;
          case "float":
            inputValue = parseFloat(inputValue);
            break;
        }

        if (
          (["integer", "float"].includes(inputType) && isNaN(inputValue)) ||
          (settingName === "watermark_scale" && inputValue === 0)
        ) {
          return;
        }

        return {
          [settingName]: inputValue,
        };
      })
      .reduce((acc, cur) => {
        return { ...acc, ...cur };
      }, {});
  }

  @bind
  didStartDrag(event) {
    const target = event.target.closest(CONTAINER_SELECTOR);
    target.classList.add("dragging");

    this.dragging = true;
    this.dragOffset = [
      target.offsetLeft - event.clientX,
      target.offsetTop - event.clientY,
    ];
  }

  @bind
  dragMove(event, element) {
    event.stopPropagation();
    event.preventDefault();

    if (this.dragging) {
      const mousePosition = {
        x: event.clientX,
        y: event.clientY,
      };

      const container = element.closest(CONTAINER_SELECTOR);

      container.style.left = mousePosition.x + this.dragOffset[0] + "px";
      container.style.top = mousePosition.y + this.dragOffset[1] + "px";
    }
  }

  @bind
  didEndDrag(event, element) {
    const target = element.closest(CONTAINER_SELECTOR);
    target.classList.remove("dragging");

    this.dragging = false;
    this.dragOffset = null;
  }

  <template>
    {{#if this.shouldDisplay}}
      <DButton
        @icon="image"
        class="btn-default btn-normal preview-watermark"
        @translatedLabel="Preview Watermark"
        @action={{this.togglePreview}}
        {{didInsert this.initImage}}
      />

      {{#if this.showPreview}}
        <div class="watermark-preview__container" {{this.registerEvents}}>
          <div
            class="watermark-preview__header"
            {{draggable
              didStartDrag=this.didStartDrag
              didEndDrag=this.didEndDrag
              dragMove=this.dragMove
            }}
          >
            <div>{{i18n (themePrefix "preview.title")}}</div>
            <div class="watermark-preview__actions">
              <PickFilesButton
                @allowMultiple={{false}}
                @showButton={{true}}
                @onFilesPicked={{this.uploadImage}}
                @icon="upload"
                accept="image/*"
                name="image-uploader"
              />
              <DButton
                @icon="arrows-rotate"
                class="btn-default btn-normal"
                @translatedTitle={{i18n
                  (themePrefix "preview.buttons.refresh")
                }}
                @action={{this.refreshImage}}
              />
              <DButton
                @icon="xmark"
                class="btn-default btn-normal"
                @translatedTitle={{i18n (themePrefix "preview.buttons.close")}}
                @action={{this.togglePreview}}
              />
            </div>
          </div>
          <div
            class="watermark-preview__resizable"
            style={{this.imageStyle}}
            {{didInsert this.applyWatermark}}
          >
            {{~! no whitespace ~}}
            <img src={{this.imageSourceURL}} />
            {{~! no whitespace ~}}
          </div>
        </div>
      {{/if}}
    {{/if}}
  </template>
}
