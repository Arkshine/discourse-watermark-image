import Component from "@glimmer/component";
import { hash } from "@ember/helper";
import { action } from "@ember/object";
import PreloadStore from "discourse/lib/preload-store";
import ComboBox from "discourse/select-kit/components/combo-box";

const BUILT_IN_FONTS = [
  { key: "site", label: "Site", className: "watermark-font-option-site" },
  {
    key: "heading",
    label: "Heading",
    className: "watermark-font-option-heading",
  },
  {
    key: "monospace",
    label: "Monospace",
    className: "watermark-font-option-monospace",
  },
];

function labelFor(key) {
  return key.replaceAll("_", " ");
}

function parseConfig(value) {
  try {
    return JSON.parse(value) ?? { key: "site" };
  } catch {
    return { key: "site" };
  }
}

// Matches DiscourseFonts' own class convention
function bodyFontClass(key) {
  return `body-font-${key.replaceAll("_", "-")}`;
}

export default class WatermarkFontPicker extends Component {
  get fontMap() {
    return PreloadStore.get("fontMap") ?? {};
  }

  get content() {
    const builtInKeys = new Set(BUILT_IN_FONTS.map((font) => font.key));
    const builtIn = BUILT_IN_FONTS.map(({ key, label, className }) => ({
      id: key,
      name: label,
      classNames: className,
    }));
    const catalog = Object.keys(this.fontMap)
      .filter((key) => !builtInKeys.has(key))
      .sort()
      .map((key) => ({
        id: key,
        name: labelFor(key),
        classNames: bodyFontClass(key),
      }));

    return [...builtIn, ...catalog];
  }

  get selectedKey() {
    return parseConfig(this.args.value).key ?? "site";
  }

  @action
  select(key) {
    if (BUILT_IN_FONTS.some((font) => font.key === key)) {
      this.args.changeValueCallback(JSON.stringify({ key }));
      return;
    }

    const variants = (this.fontMap[key] ?? []).map(({ url, weight }) => ({
      url,
      weight,
    }));

    this.args.changeValueCallback(JSON.stringify({ key, variants }));
  }

  <template>
    <ComboBox
      @content={{this.content}}
      @value={{this.selectedKey}}
      @onChange={{this.select}}
      @options={{hash disabled=@disabled}}
      class="watermark-font-picker"
      ...attributes
    />
  </template>
}
