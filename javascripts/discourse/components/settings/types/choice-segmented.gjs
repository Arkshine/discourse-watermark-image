import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { action } from "@ember/object";

export default class WatermarkChoiceSegmented extends Component {
  get segments() {
    const setting = this.args.setting;
    const valueKey = setting.computedValueProperty;
    const nameKey = setting.computedNameProperty;

    return (setting.validValues ?? []).map((choice) => {
      const value = valueKey ? choice[valueKey] : choice;
      const name = nameKey ? choice[nameKey] : choice;

      return {
        value,
        label: String(name).replaceAll("_", " "),
        checked: this.args.value === value,
        disabled: this.args.disabled || setting.disabledValues?.includes(value),
      };
    });
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
            disabled={{segment.disabled}}
            {{on "change" this.select}}
          />
          <span class="watermark-choice-segmented__label">
            {{segment.label}}
          </span>
        </label>
      {{/each}}
    </div>
  </template>
}
