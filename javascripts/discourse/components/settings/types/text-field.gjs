import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";

export default class WatermarkTextField extends Component {
  @action
  onInput(event) {
    this.args.changeValueCallback(event.target.value);
  }

  <template>
    <input
      type="text"
      class="watermark-text-field"
      value={{@value}}
      placeholder={{@setting.placeholder}}
      disabled={{@disabled}}
      {{on "input" this.onInput}}
      ...attributes
    />
  </template>
}
