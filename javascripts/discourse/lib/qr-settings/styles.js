export const FLAT_FALLBACKS = {
  qrcode_color: "#000000",
  qrcode_background_color: "#ffffff",
  qrcode_quiet_zone: 2,
};

export const STYLE_SCHEMAS = {
  basic: {
    label: "Basic",
    params: {
      foreground: {
        label: "Foreground",
        type: "color",
        inherit: "qrcode_color",
      },
      background: {
        label: "Background",
        type: "color",
        inherit: "qrcode_background_color",
      },
      margin: {
        label: "Margin",
        type: "number",
        control: "stepper",
        min: 0,
        max: 10,
        step: 1,
        inherit: "qrcode_quiet_zone",
      },
      frame: {
        label: "Frame",
        type: "select",
        options: ["none", "corners"],
        default: "none",
      },
      finderType: {
        label: "Position points type",
        type: "select",
        options: [
          "square",
          "rounded",
          "extra-rounded",
          "circle",
          "diamond",
          "diamond-round",
        ],
        default: "square",
      },
      finderInnerType: {
        label: "Position points inner type",
        type: "select",
        options: [
          "square",
          "rounded",
          "extra-rounded",
          "circle",
          "diamond",
          "diamond-round",
        ],
        default: "square",
      },
      finderColor: {
        label: "Position points color",
        type: "color",
        gradient: true,
        inheritParam: "foreground",
      },
      dataType: {
        label: "Data points type",
        type: "select",
        options: [
          "square",
          "rounded",
          "extra-rounded",
          "circle",
          "diamond",
          "diamond-round",
        ],
        default: "square",
      },
      dataScale: {
        label: "Data points scale",
        type: "number",
        min: 0.5,
        max: 1.5,
        step: 0.05,
        default: 1,
      },
      dataOpacity: {
        label: "Data points opacity",
        type: "number",
        min: 0,
        max: 1,
        step: 0.05,
        default: 1,
      },
      dataColor: {
        label: "Data points color",
        type: "color",
        gradient: true,
        inheritParam: "foreground",
      },
    },
  },

  dots: {
    label: "Dots",
    params: {
      foreground: {
        label: "Foreground",
        type: "color",
        gradient: true,
        default: {
          type: "linear",
          angle: 45,
          stops: ["#4267b2", "#8b5cf6"],
        },
      },
      background: {
        label: "Background",
        type: "color",
        inherit: "qrcode_background_color",
      },
      margin: {
        label: "Margin",
        type: "number",
        control: "stepper",
        min: 0,
        max: 10,
        step: 1,
        inherit: "qrcode_quiet_zone",
      },
      dotScale: {
        label: "Dot scale",
        type: "number",
        min: 0.5,
        max: 1,
        step: 0.05,
        default: 0.85,
      },
    },
  },

  camo: {
    label: "Camo",
    params: {
      foreground: {
        label: "Foreground",
        type: "color",
        default: "#1c4a1a",
      },
      background: {
        label: "Background",
        type: "color",
        default: "#e3d68a",
      },
      margin: {
        label: "Margin",
        type: "number",
        control: "stepper",
        min: 0,
        max: 10,
        step: 1,
        default: 3,
      },
      quietZone: {
        label: "Quiet zone",
        type: "number",
        min: 0,
        max: 10,
        step: 1,
        default: 1,
      },
      invert: { label: "Invert", type: "boolean", default: false },
      seed: {
        label: "Seed",
        type: "number",
        min: 1,
        max: 100,
        step: 1,
        default: 1,
      },
    },
  },
};

export function paramSpecs(style) {
  return STYLE_SCHEMAS[style]?.params ?? {};
}

export function resolveParams(style, params = {}) {
  const specs = paramSpecs(style);
  const resolved = {};

  for (const [key, spec] of Object.entries(specs)) {
    const value = params[key] ?? spec.default;
    if (value !== undefined) {
      resolved[key] = value;
    }
  }

  return resolved;
}
