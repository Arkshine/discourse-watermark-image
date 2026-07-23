import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { concat, fn, hash } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { modifier } from "ember-modifier";
import DButton from "discourse/components/d-button";
import HorizontalOverflowNav from "discourse/components/horizontal-overflow-nav";
import { eq } from "discourse/truth-helpers";
import DFilterInput from "discourse/ui-kit/d-filter-input";
import { i18n } from "discourse-i18n";

const MATCH_CLASS = "--search-match";

export default class WatermarkSettingsTabs extends Component {
  @tracked activeTab;
  @tracked rawQuery = "";
  @tracked query = "";
  @tracked resultCount = 0;

  syncActiveTab = modifier(() => {
    this.args.section.dataset.activeTab = this.activeTab;
    return () => delete this.args.section.dataset.activeTab;
  });

  constructor() {
    super(...arguments);
    this.activeTab = this.args.tabs[0].id;
  }

  willDestroy() {
    super.willDestroy(...arguments);
    delete this.args.section.dataset.searching;
    this.#rows().forEach((row) => row.classList.remove(MATCH_CLASS));
  }

  #rows() {
    return this.args.section.querySelectorAll("[data-setting]");
  }

  @action
  select(tabId) {
    this.activeTab = tabId;
  }

  @action
  search(event) {
    this.applyFilter(event.target.value);
  }

  @action
  clear() {
    this.applyFilter("");
  }

  applyFilter(value) {
    this.rawQuery = value;
    this.query = value.trim().toLowerCase();

    const { section } = this.args;

    if (!this.query) {
      delete section.dataset.searching;

      this.#rows().forEach((row) => row.classList.remove(MATCH_CLASS));
      return;
    }

    section.dataset.searching = "";
    this.resultCount = 0;

    this.#rows().forEach((row) => {
      const haystack = `${row.dataset.setting} ${row.textContent}`.toLowerCase();
      const match = haystack.includes(this.query);

      row.classList.toggle(MATCH_CLASS, match);
      if (match) {
        this.resultCount++;
      }
    });
  }

  <template>
    <DFilterInput
      @value={{this.rawQuery}}
      @filterAction={{this.search}}
      @onClearInput={{this.clear}}
      @icons={{hash left="magnifying-glass"}}
      @containerClass="watermark-settings-search"
      placeholder={{i18n (themePrefix "settings_ui.search.placeholder")}}
      aria-label={{i18n (themePrefix "settings_ui.search.placeholder")}}
    />

    <div class="watermark-tabs" {{this.syncActiveTab}}>
      <HorizontalOverflowNav
        @ariaLabel={{i18n (themePrefix "settings_ui.tabs_label")}}
      >
        {{#if this.query}}
          <div class="watermark-tabs__tab active" role="status">
            {{i18n (themePrefix "settings_ui.search.results")}}
            ({{this.resultCount}})
          </div>
        {{else}}
          {{#each @tabs as |tab|}}
            <button
              type="button"
              class="watermark-tabs__tab
                {{if (eq this.activeTab tab.id) 'active'}}"
              aria-current={{if (eq this.activeTab tab.id) "true"}}
              {{on "click" (fn this.select tab.id)}}
            >{{i18n (themePrefix (concat "settings_ui.tabs." tab.id))}}</button>
          {{/each}}
        {{/if}}
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
