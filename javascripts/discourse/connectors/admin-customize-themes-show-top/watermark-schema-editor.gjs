import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { concat } from "@ember/helper";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import DButton from "discourse/components/d-button";
import { bind } from "discourse/lib/decorators";
import { i18n } from "discourse-i18n";
import SchemaTabs from "../../components/settings/schema-tabs";
import WatermarkPreview from "../../components/watermark-preview";
import { PROFILE_META_KEYS } from "../../lib/match-profile";
import { PROFILE_CHANGED_EVENT } from "../../lib/watermark/active-state";

const SETTING_NAME = "watermark_profiles";
const ANCHOR_SELECTOR = ".schema-setting-editor__wrapper";
const TITLE_SELECTOR = ".customize-show-schema__header";
const FIELDS_SELECTOR = ".schema-setting-editor__fields";

const PROFILE_TABS = [
  { id: "content" },
  { id: "appearance" },
  { id: "placement" },
  { id: "rules" },
];

function profileToSettings(profile) {
  const settings = {};

  if (profile) {
    for (const [key, value] of Object.entries(profile)) {
      if (PROFILE_META_KEYS.has(key)) {
        continue;
      }

      settings[`watermark_${key}`] = value;
    }
  }

  return settings;
}

function observeElement(selector, onFound) {
  const attach = () => {
    const element = document.querySelector(selector);
    if (!element) {
      return false;
    }

    onFound(element);
    return true;
  };

  if (attach()) {
    return () => {};
  }

  const observer = new MutationObserver(() => {
    if (attach()) {
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => observer.disconnect();
}

export default class WatermarkSchemaPreview extends Component {
  @service router;
  @service appEvents;

  @tracked activeProfile;
  @tracked visible = true;
  @tracked titleMount = null;
  @tracked tabsMount = null;
  @tracked fieldsContainer = null;

  captureTitleMount = modifier(() => {
    let mount;

    const stop = observeElement(TITLE_SELECTOR, (header) => {
      mount = document.createElement("span");
      mount.className = "watermark-schema-preview__mount";

      (header.querySelector("h2") ?? header).append(mount);
      this.titleMount = mount;
    });

    return () => {
      stop();
      mount?.remove();
      this.titleMount = null;
    };
  });

  captureTabsMount = modifier(() => {
    let mount;
    const stop = observeElement(FIELDS_SELECTOR, (fields) => {
      mount = document.createElement("div");
      mount.className = "watermark-schema-tabs-mount";
      fields.prepend(mount);

      this.fieldsContainer = fields;
      this.tabsMount = mount;
    });

    return () => {
      stop();
      mount?.remove();
      this.tabsMount = null;
      this.fieldsContainer = null;
    };
  });

  constructor() {
    super(...arguments);

    this.activeProfile = this.initialProfile;
    this.appEvents.on(PROFILE_CHANGED_EVENT, this.onProfileChanged);
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.appEvents.off(PROFILE_CHANGED_EVENT, this.onProfileChanged);
  }

  get settings() {
    return profileToSettings(this.activeProfile);
  }

  get hasProfile() {
    return !!this.activeProfile;
  }

  get initialProfile() {
    const setting = this.args.theme?.settings?.find(
      (s) => s.setting === SETTING_NAME
    );

    return Array.isArray(setting?.value) ? setting.value[0] : null;
  }

  get shouldDisplay() {
    const route = this.router.currentRoute;

    return (
      route?.name === "adminCustomizeThemes.show.schema" &&
      route.params?.setting_name === SETTING_NAME &&
      this.args.theme?.theme_fields?.some((tf) =>
        tf.name.endsWith("/watermark-image.js")
      )
    );
  }

  @bind
  onProfileChanged(profile) {
    this.activeProfile = profile;
  }

  @action
  toggle() {
    this.visible = !this.visible;
  }

  <template>
    {{#if this.shouldDisplay}}
      <span
        class="watermark-schema-preview"
        {{this.captureTitleMount}}
        {{this.captureTabsMount}}
      ></span>

      {{#if this.hasProfile}}
        {{#if this.titleMount}}
          {{#in-element this.titleMount}}
            <DButton
              class="btn-default btn-small watermark-schema-preview__toggle"
              @icon={{if this.visible "eye-slash" "eye"}}
              @translatedLabel={{i18n
                (themePrefix
                  (concat "preview.buttons." (if this.visible "hide" "show"))
                )
              }}
              @action={{this.toggle}}
            />
          {{/in-element}}
        {{/if}}

        {{#if this.tabsMount}}
          {{#in-element this.tabsMount}}
            <SchemaTabs
              @container={{this.fieldsContainer}}
              @tabs={{PROFILE_TABS}}
            />
          {{/in-element}}
        {{/if}}

        {{#if this.visible}}
          <WatermarkPreview
            @settings={{this.settings}}
            @anchorSelector={{ANCHOR_SELECTOR}}
            @onClose={{this.toggle}}
          />
        {{/if}}
      {{/if}}
    {{/if}}
  </template>
}
