import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { trustHTML } from "@ember/template";
import DToggleSwitch from "discourse/ui-kit/d-toggle-switch";

export default class WatermarkSwitch extends Component {
  get state() {
    return String(this.args.value) === "true";
  }

  @action
  toggle() {
    this.args.changeValueCallback(!this.state);
  }

  <template>
    <div class="watermark-switch" ...attributes>
      <DToggleSwitch @state={{this.state}} {{on "click" this.toggle}} />

      {{#if @setting.description}}
        <div class="desc">{{trustHTML @setting.description}}</div>
      {{/if}}
    </div>
  </template>
}
