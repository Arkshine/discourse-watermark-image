import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";

// Keep in sync with settings.yml `watermark_pattern` choices.
const PATTERNS = ["single", "grid", "diagonal", "random"];

export default class WatermarkPatternPicker extends Component {
  get tiles() {
    return PATTERNS.map((pattern) => ({
      pattern,
      checked: this.args.value === pattern,
    }));
  }

  @action
  select(event) {
    this.args.changeValueCallback(event.target.value);
  }

  <template>
    <div class="watermark-pattern-picker" role="radiogroup" ...attributes>
      {{#each this.tiles as |tile|}}
        <label
          class="watermark-pattern-picker__tile"
          data-pattern={{tile.pattern}}
        >
          <input
            type="radio"
            name={{@setting.setting}}
            value={{tile.pattern}}
            checked={{tile.checked}}
            disabled={{@disabled}}
            {{on "change" this.select}}
          />
          <span class="watermark-pattern-picker__thumb"></span>
          <span class="watermark-pattern-picker__name">{{tile.pattern}}</span>
        </label>
      {{/each}}
    </div>
  </template>
}
