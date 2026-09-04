import Component from "@glimmer/component";
import { fn } from "@ember/helper";
import { action } from "@ember/object";
import { service } from "@ember/service";
import DButtonTooltip from "discourse/float-kit/components/d-button-tooltip";
import DMenu from "discourse/float-kit/components/d-menu";
import DTooltip from "discourse/float-kit/components/d-tooltip";
import { eq } from "discourse/truth-helpers";
import DButton from "discourse/ui-kit/d-button";
import DDropdownMenu from "discourse/ui-kit/d-dropdown-menu";
import dConcatClass from "discourse/ui-kit/helpers/d-concat-class";
import { i18n } from "discourse-i18n";

export default class WatermarkManualToggle extends Component {
  @service composer;
  @service watermarkReprocess;

  get state() {
    return (
      this.args?.data?.state ||
      this.watermarkReprocess
        .imagesFor(this.composer.model)
        .find((image) => image.shortUrl === this.args.shortUrl)
    );
  }

  get icon() {
    if (this.state.processing) {
      return "spinner";
    }
    return this.state.applied ? "watermark-w" : "watermark-w-off";
  }

  get disabled() {
    return this.state.processing || !this.state.available;
  }

  get label() {
    return i18n(themePrefix("composer.manual_toggle.toolbar.toggle"));
  }

  get labelUnvailable() {
    return i18n(themePrefix("composer.manual_toggle.unavailable"));
  }

  get context() {
    return this.args?.data?.context || this.args?.context;
  }

  get ordinal() {
    return this.args?.data?.state?.ordinal ?? this.args?.ordinal ?? 0;
  }

  get hasMenu() {
    return this.state.available && (this.state.options?.length ?? 0) >= 2;
  }

  get selectedName() {
    if (!this.state.applied) {
      return null;
    }
    return this.state.profileName ?? this.state.options[0];
  }

  get toggleClass() {
    return dConcatClass(
      "watermark-manual-toolbar__toggle",
      this.state.applied ? "--applied" : "--removed",
      this.state.available ? "--available" : "--unavailable"
    );
  }

  @action
  toggle() {
    this.args?.data?.state
      ? this.args.data.toggle(this.state.shortUrl, this.ordinal)
      : this.watermarkReprocess.toggleManual(
          this.composer.model,
          this.state.shortUrl,
          this.ordinal
        );
  }

  @action
  pick(profileName, menu) {
    menu.close();

    this.args?.data?.state
      ? this.args.data.pick(this.state.shortUrl, profileName)
      : this.watermarkReprocess.pickProfile(
          this.composer.model,
          this.state.shortUrl,
          profileName,
          this.ordinal
        );
  }

  @action
  applyAll(menu) {
    menu.close();

    this.args?.data?.state
      ? this.args.data.applyAll(this.state.shortUrl)
      : this.watermarkReprocess.applyToAll(
          this.composer.model,
          this.state.shortUrl
        );
  }

  <template>
    {{#if this.state}}
      <div class={{dConcatClass "watermark-manual-toolbar" this.context}}>
        {{#if this.hasMenu}}
          <DMenu
            @identifier="watermark-profile-picker"
            @icon={{this.icon}}
            @title={{this.label}}
            @disabled={{this.disabled}}
            @modalForMobile={{true}}
            @placement="bottom-end"
            @triggerClass={{this.toggleClass}}
            tabindex="-1"
            as |menu|
          >
            <DDropdownMenu as |dropdown|>
              {{#each this.state.options as |name|}}
                <dropdown.item>
                  <DButton
                    class={{if (eq this.selectedName name) "is-selected"}}
                    @icon={{if (eq this.selectedName name) "check"}}
                    @translatedLabel={{name}}
                    @action={{fn this.pick name menu}}
                  />
                </dropdown.item>
              {{/each}}
              <dropdown.item>
                <DButton
                  class={{unless this.state.applied "is-selected"}}
                  @icon={{unless this.state.applied "check"}}
                  @translatedLabel={{i18n
                    (themePrefix "composer.manual_toggle.menu.none")
                  }}
                  @action={{fn this.pick null menu}}
                />
              </dropdown.item>
              <dropdown.divider />
              <dropdown.item>
                <DButton
                  @icon="copy"
                  @translatedLabel={{i18n
                    (themePrefix "composer.manual_toggle.menu.apply_all")
                  }}
                  @action={{fn this.applyAll menu}}
                />
              </dropdown.item>
            </DDropdownMenu>
          </DMenu>
        {{else}}
          <DButtonTooltip>
            <:button>
              <DButton
                @action={{this.toggle}}
                @icon={{this.icon}}
                @preventFocus={{true}}
                class={{this.toggleClass}}
                disabled={{this.disabled}}
                title={{this.label}}
                tabindex="-1"
              />
            </:button>
            <:tooltip>
              {{#unless this.state.available}}
                <DTooltip
                  @icon="circle-info"
                  @content={{this.labelUnvailable}}
                />
              {{/unless}}
            </:tooltip>
          </DButtonTooltip>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
