import Component from "@glimmer/component";
import { action } from "@ember/object";
import { service } from "@ember/service";
import DButtonTooltip from "discourse/float-kit/components/d-button-tooltip";
import DTooltip from "discourse/float-kit/components/d-tooltip";
import DButton from "discourse/ui-kit/d-button";
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

  <template>
    {{#if this.state}}
      <div class={{dConcatClass "watermark-manual-toolbar" this.context}}>
        <DButtonTooltip>
          <:button>
            <DButton
              @action={{this.toggle}}
              @icon={{this.icon}}
              @preventFocus={{true}}
              class={{dConcatClass
                "watermark-manual-toolbar__toggle"
                (if this.state.applied "--applied" "--removed")
                (if this.state.available "--available" "--unavailable")
              }}
              disabled={{this.disabled}}
              title={{this.label}}
              tabindex="-1"
            />
          </:button>
          <:tooltip>
            {{#unless this.state.available}}
              <DTooltip @icon="circle-info" @content={{this.labelUnvailable}} />
            {{/unless}}
          </:tooltip>
        </DButtonTooltip>
      </div>
    {{/if}}
  </template>
}
