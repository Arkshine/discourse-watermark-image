import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import didUpdate from "@ember/render-modifiers/modifiers/did-update";
import FieldInputDescription from "discourse/admin/components/schema-setting/field-input-description";
import WatermarkBlendPicker from "./types/blend-picker";
import WatermarkChoiceSegmented from "./types/choice-segmented";
import WatermarkColorField from "./types/color-field";
import WatermarkPatternPicker from "./types/pattern-picker";
import WatermarkPositionPicker from "./types/position-picker";
import WatermarkQrLogo from "./types/qr-logo";
import WatermarkQrStyle from "./types/qr-style";
import WatermarkRotationDial from "./types/rotation-dial";
import WatermarkSlider from "./types/slider";
import WatermarkSourceToggle from "./types/source-toggle";
import WatermarkStepper from "./types/stepper";
import WatermarkSwitch from "./types/switch";

export const SCHEMA_CONTROLS = {
  enabled: WatermarkSwitch,
  qrcode_enabled: WatermarkSourceToggle,
  qrcode_color: WatermarkColorField,
  qrcode_background_color: WatermarkColorField,
  qrcode_quiet_zone: WatermarkStepper,
  qrcode_error_correction: WatermarkChoiceSegmented,
  qrcode_style_config: WatermarkQrStyle,
  qrcode_logo_config: WatermarkQrLogo,
  position: WatermarkPositionPicker,
  margin_x: WatermarkStepper,
  margin_y: WatermarkStepper,
  opacity: WatermarkSlider,
  size_mode: WatermarkChoiceSegmented,
  relative_width: WatermarkSlider,
  absolute_scale: WatermarkStepper,
  max_size: WatermarkSlider,
  rotate: WatermarkRotationDial,
  pattern: WatermarkPatternPicker,
  pattern_max_count: WatermarkStepper,
  pattern_spacing: WatermarkStepper,
  blend_mode: WatermarkBlendPicker,
};

export default class SchemaFieldControl extends Component {
  @tracked value;

  constructor() {
    super(...arguments);
    this.value = this.args.value;
  }

  get control() {
    return SCHEMA_CONTROLS[this.args.name];
  }

  get setting() {
    const spec = this.args.spec;
    return {
      setting: this.args.name,
      type: spec.type,
      min: spec.validations?.min,
      max: spec.validations?.max,
      validValues: spec.choices,
    };
  }

  @action
  syncValue() {
    this.value = this.args.value;
  }

  @action
  changeValue(value) {
    const type = this.args.spec.type;

    if (type === "integer") {
      value = parseInt(value, 10);
    } else if (type === "float") {
      value = parseFloat(value);
    }

    this.value = value;
    this.args.onChange(value);
  }

  <template>
    <div class="watermark-schema-field" {{didUpdate this.syncValue @value}}>
      <this.control
        @value={{this.value}}
        @setting={{this.setting}}
        @changeValueCallback={{this.changeValue}}
      />

      {{#if @description}}
        <div class="schema-field__input-supporting-text">
          <FieldInputDescription @description={{@description}} />
        </div>
      {{/if}}
    </div>
  </template>
}
