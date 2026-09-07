import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { i18n } from "discourse-i18n";

const OPTIONS = ["image", "qrcode", "text"];

export default class WatermarkSourceToggle extends Component {
  get segments() {
    return OPTIONS.map((value) => ({
      value,
      label: i18n(themePrefix(`settings_ui.source.${value}`)),
      checked: value === this.args.value,
    }));
  }

  @action
  select(event) {
    this.args.changeValueCallback(event.target.value);
  }

  <template>
    <div class="watermark-choice-segmented" role="radiogroup" ...attributes>
      {{#each this.segments as |segment|}}
        <label class="watermark-choice-segmented__segment">
          <input
            type="radio"
            name={{@setting.setting}}
            value={{segment.value}}
            checked={{segment.checked}}
            disabled={{@disabled}}
            {{on "change" this.select}}
          />
          <span
            class="watermark-choice-segmented__label"
          >{{segment.label}}</span>
        </label>
      {{/each}}
    </div>
  </template>
}
