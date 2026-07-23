import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { concat, fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { modifier } from "ember-modifier";
import DButton from "discourse/components/d-button";
import HorizontalOverflowNav from "discourse/components/horizontal-overflow-nav";
import { eq } from "discourse/truth-helpers";
import { i18n } from "discourse-i18n";

export default class WatermarkSettingsTabs extends Component {
  @tracked activeTab;

  syncActiveTab = modifier(() => {
    this.args.section.dataset.activeTab = this.activeTab;
    return () => delete this.args.section.dataset.activeTab;
  });

  constructor() {
    super(...arguments);
    this.activeTab = this.args.tabs[0].id;
  }

  @action
  select(tabId) {
    this.activeTab = tabId;
  }

  <template>
    <div class="watermark-tabs" {{this.syncActiveTab}}>
      <HorizontalOverflowNav
        @ariaLabel={{i18n (themePrefix "settings_ui.tabs_label")}}
      >
        {{#each @tabs as |tab|}}
          <button
            type="button"
            class="watermark-tabs__tab
              {{if (eq this.activeTab tab.id) 'active'}}"
            aria-current={{if (eq this.activeTab tab.id) "true"}}
            {{on "click" (fn this.select tab.id)}}
          >{{i18n (themePrefix (concat "settings_ui.tabs." tab.id))}}</button>
        {{/each}}
      </HorizontalOverflowNav>
      <DButton
        class="watermark-tabs__preview-toggle btn-flat"
        @icon={{if @previewShown "eye-slash" "eye"}}
        @translatedTitle={{i18n
          (themePrefix
            (concat "preview.buttons." (if @previewShown "hide" "show"))
          )
        }}
        @action={{@onTogglePreview}}
      />
    </div>
  </template>
}
