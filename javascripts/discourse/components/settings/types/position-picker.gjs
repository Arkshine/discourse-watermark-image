import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { i18n } from "discourse-i18n";

const POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

function positionName(position) {
  return i18n(
    themePrefix(`settings_ui.positions.${position.replaceAll("-", "_")}`)
  );
}

export default class WatermarkPositionPicker extends Component {
  get anchors() {
    return POSITIONS.map((position) => ({
      position,
      label: positionName(position),
      checked: this.args.value === position,
    }));
  }

  get positionLabel() {
    return this.args.value ? positionName(this.args.value) : "";
  }

  @action
  select(event) {
    this.args.changeValueCallback(event.target.value);
  }

  <template>
    <div class="watermark-position-picker" ...attributes>
      <div class="watermark-position-picker__frame" role="radiogroup">
        {{#each this.anchors as |anchor|}}
          <label
            class="watermark-position-picker__anchor"
            data-position={{anchor.position}}
          >
            <input
              type="radio"
              name={{@setting.setting}}
              value={{anchor.position}}
              checked={{anchor.checked}}
              disabled={{@disabled}}
              aria-label={{anchor.label}}
              {{on "change" this.select}}
            />
            <span class="watermark-position-picker__mark"></span>
          </label>
        {{/each}}
      </div>
      <output
        class="watermark-position-picker__label"
      >{{this.positionLabel}}</output>
    </div>
  </template>
}
