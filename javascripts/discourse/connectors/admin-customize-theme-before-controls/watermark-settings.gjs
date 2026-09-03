import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import { i18n } from "discourse-i18n";
import WatermarkSettingsTabs from "../../components/settings/tabs";
import WatermarkPreview from "../../components/watermark-preview";

const SETTINGS_TABS = [
  {
    id: "content",
    settings: [
      "watermark_source",
      "watermark_image",
      "watermark_qrcode_text",
      "watermark_qrcode_color",
      "watermark_qrcode_background_color",
      "watermark_qrcode_quiet_zone",
      "watermark_qrcode_error_correction",
      "watermark_qrcode_style_config",
      "watermark_qrcode_halftone_image",
      "watermark_qrcode_logo_config",
      "watermark_qrcode_logo_image",
      "watermark_text",
      "watermark_text_style",
    ],
  },
  {
    id: "appearance",
    settings: [
      "watermark_opacity",
      "watermark_blend_mode",
      "watermark_size_mode",
      "watermark_relative_width",
      "watermark_absolute_scale",
      "watermark_max_size",
    ],
  },
  {
    id: "placement",
    settings: [
      "watermark_position",
      "watermark_margin_x",
      "watermark_margin_y",
      "watermark_rotate",
      "watermark_pattern",
      "watermark_pattern_allow_partial",
      "watermark_pattern_max_count",
      "watermark_pattern_spacing",
    ],
  },
  {
    id: "rules",
    settings: ["watermark_categories", "watermark_groups", "watermark_tags"],
  },
];

export default class PreviewWatermark extends Component {
  @service router;
  @service site;

  @tracked showPreview;
  @tracked mounts = null;

  tabsSection = null;

  installTranslationsToggle = modifier(() => {
    const wrapper = document
      .querySelector(".translation-selector-container")
      ?.closest(".control-unit");
    const title = wrapper?.querySelector(".mini-title");

    if (!wrapper || !title) {
      return;
    }

    wrapper.dataset.watermarkCollapsible = "";
    wrapper.dataset.collapsed = "true";

    title.setAttribute("role", "button");
    title.setAttribute("tabindex", "0");
    title.setAttribute("aria-expanded", "false");

    const toggle = () => {
      const next = wrapper.dataset.collapsed !== "true";
      wrapper.dataset.collapsed = `${next}`;
      title.setAttribute("aria-expanded", `${!next}`);
    };

    title.addEventListener("click", toggle);

    return () => {
      title.removeEventListener("click", toggle);
      delete wrapper.dataset.watermarkCollapsible;
      delete wrapper.dataset.collapsed;
      title.removeAttribute("role");
      title.removeAttribute("tabindex");
      title.removeAttribute("aria-expanded");
    };
  });

  willDestroy() {
    super.willDestroy(...arguments);
    Object.values(this.mounts ?? {}).forEach((mount) => mount.remove());
  }

  get shouldDisplay() {
    const { currentRoute } = this.router;

    return (
      currentRoute.name === "adminCustomizeThemes.show.index" &&
      currentRoute.attributes.component &&
      currentRoute.attributes.theme_fields.some((tf) =>
        tf.name.endsWith("/watermark-image.gjs")
      )
    );
  }

  @action
  setInitialVisibility() {
    this.showPreview = !this.site.mobileView;
  }

  @action
  togglePreview() {
    this.showPreview = !this.showPreview;
  }

  @action
  captureTabsMount() {
    const section = document
      .querySelector('.theme.settings [data-setting^="watermark_"]')
      ?.closest(".theme.settings");

    if (!section || this.mounts) {
      return;
    }

    this.tabsSection = section;

    const createMount = (name) => {
      const mount = document.createElement("div");
      mount.className = `watermark-settings-${name}-mount`;
      section.prepend(mount);
      return mount;
    };

    this.mounts = {
      generalHeading: createMount("general-heading"),
      defaultHeading: createMount("default-heading"),
      tabs: createMount("tabs"),
    };
  }

  <template>
    {{#if this.shouldDisplay}}
      <div
        class="watermark-preview-root"
        {{didInsert this.setInitialVisibility}}
        {{didInsert this.captureTabsMount}}
        {{this.installTranslationsToggle}}
      >
        {{#if this.mounts}}
          {{#in-element this.mounts.generalHeading}}
            <h3 class="watermark-settings-heading">{{i18n
                (themePrefix "settings_ui.headings.general")
              }}</h3>
          {{/in-element}}
          {{#in-element this.mounts.defaultHeading}}
            <h3 class="watermark-settings-heading">{{i18n
                (themePrefix "settings_ui.headings.default")
              }}</h3>
          {{/in-element}}
          {{#in-element this.mounts.tabs}}
            <WatermarkSettingsTabs
              @section={{this.tabsSection}}
              @tabs={{SETTINGS_TABS}}
              @previewShown={{this.showPreview}}
              @onTogglePreview={{this.togglePreview}}
            />
          {{/in-element}}
        {{/if}}

        {{#if this.showPreview}}
          <WatermarkPreview @theme={{@theme}} @onClose={{this.togglePreview}} />
        {{/if}}
      </div>
    {{/if}}
  </template>
}
