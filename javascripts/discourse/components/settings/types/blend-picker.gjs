import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";

// Keep in sync with settings.yml `watermark_blend_mode` choices.
const BLEND_MODES = [
  "normal",
  "overlay",
  "over",
  "atop",
  "xor",
  "plus",
  "multiply",
  "burn",
  "difference",
  "soft_light",
  "screen",
  "hard_light",
  "dodge",
  "exclusion",
  "lighten",
  "darken",
];

export default class WatermarkBlendPicker extends Component {
  get chips() {
    return BLEND_MODES.map((mode) => ({
      mode,
      label: mode.replaceAll("_", " "),
      checked: this.args.value === mode,
    }));
  }

  @action
  select(event) {
    this.args.changeValueCallback(event.target.value);
  }

  <template>
    <div class="watermark-blend-picker" role="radiogroup" ...attributes>
      {{#each this.chips as |chip|}}
        <label class="watermark-blend-picker__chip">
          <input
            type="radio"
            name={{@setting.setting}}
            value={{chip.mode}}
            checked={{chip.checked}}
            disabled={{@disabled}}
            {{on "change" this.select}}
          />
          <span class="watermark-blend-picker__label">{{chip.label}}</span>
        </label>
      {{/each}}
    </div>
  </template>
}
