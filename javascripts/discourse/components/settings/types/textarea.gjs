import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";

export default class WatermarkTextarea extends Component {
  @action
  update(event) {
    this.args.changeValueCallback(event.target.value);
  }

  <template>
    <textarea
      class="watermark-textarea"
      disabled={{@disabled}}
      {{on "input" this.update}}
      ...attributes
    >
      {{@value}}
    </textarea>
  </template>
}
