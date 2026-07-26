import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import WatermarkSettingsTabs from "../../components/settings/tabs";
import WatermarkPreview from "../../components/watermark-preview";

const SETTINGS_TABS = [
  { id: "content" },
  { id: "appearance" },
  { id: "placement" },
  { id: "rules" },
];

export default class PreviewWatermark extends Component {
  @service router;
  @service site;

  @tracked showPreview;
  @tracked tabsMount = null;

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
    this.tabsMount?.remove();
  }

  get shouldDisplay() {
    const { currentRoute } = this.router;

    return (
      currentRoute.name === "adminCustomizeThemes.show.index" &&
      currentRoute.attributes.component &&
      currentRoute.attributes.theme_fields.some((tf) =>
        tf.name.endsWith("/watermark-image.js")
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

    if (!section || this.tabsMount) {
      return;
    }

    this.tabsSection = section;

    this.tabsMount = document.createElement("div");
    this.tabsMount.className = "watermark-settings-tabs-mount";
    section.prepend(this.tabsMount);
  }

  <template>
    {{#if this.shouldDisplay}}
      <div
        class="watermark-preview-root"
        {{didInsert this.setInitialVisibility}}
        {{didInsert this.captureTabsMount}}
        {{this.installTranslationsToggle}}
      >
        {{#if this.tabsMount}}
          {{#in-element this.tabsMount}}
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
