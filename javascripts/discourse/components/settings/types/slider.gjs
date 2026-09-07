import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";

export default class WatermarkSlider extends Component {
  get min() {
    return this.args.setting.min ?? 0;
  }

  get max() {
    return this.args.setting.max ?? 100;
  }

  get step() {
    return this.args.setting.step ?? 1;
  }

  @action
  updateValue(event) {
    this.args.changeValueCallback(event.target.value);
  }

  <template>
    <div class="watermark-slider" ...attributes>
      <input
        type="range"
        min={{this.min}}
        max={{this.max}}
        step={{this.step}}
        value={{@value}}
        disabled={{@disabled}}
        {{on "input" this.updateValue}}
      />
      <output class="watermark-slider__value">{{@value}}</output>
    </div>
  </template>
}
