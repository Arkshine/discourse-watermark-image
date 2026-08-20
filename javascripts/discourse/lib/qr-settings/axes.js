import { LOGO_DEFAULTS } from "./logo.js";
import { FLAT_FALLBACKS, STYLE_SCHEMAS } from "./styles.js";

export const PATTERN_CATALOGUE = [
  { key: "square", label: "Square" },
  { key: "rounded", label: "Rounded" },
  { key: "extra-rounded", label: "Extra rounded" },
  { key: "circle", label: "Dots" },
  { key: "diamond", label: "Diamond", solidEyes: true },
  { key: "diamond-round", label: "Soft diamond" },
  { key: "blob", label: "Blob", merge: true },
  { key: "lines", label: "Lines", merge: true },
  { key: "star", label: "Star", solidEyes: true },
  { key: "danger", label: "Danger", solidEyes: true },
  { key: "cross", label: "Cross" },
  { key: "x", label: "X", solidEyes: true },
  { key: "sparkle", label: "Sparkle", solidEyes: true },
  { key: "plus", label: "Plus" },
  { key: "circle-small", label: "Circle small", solidEyes: true },
  { key: "heart", label: "Heart", solidEyes: true },
  { key: "special-circle", label: "Linked dots", merge: true },
  {
    key: "special-circle-orizz",
    label: "Linked rows",
    merge: true,
    solidEyes: true,
  },
  {
    key: "special-circle-vert",
    label: "Linked columns",
    merge: true,
    solidEyes: true,
  },
  { key: "square-circle", label: "Linked squares", merge: true },
  { key: "special-diamond", label: "Linked diamonds", merge: true },
  { key: "ribbon", label: "Ribbon", merge: true },
  { key: "oriental", label: "Oriental", merge: true },
  { key: "ellipse", label: "Ellipse", merge: true },
  { key: "origami", label: "Origami", merge: true },
  { key: "shake", label: "Shaken", solidEyes: true },
  { key: "circle-mixed", label: "Mixed dots", solidEyes: true },
  { key: "particles", label: "Particles", merge: true, solidEyes: true },
  {
    key: "bubbles",
    label: "Bubbles",
    merge: true,
    solidEyes: true,
    warning: true,
  },
  { key: "alien", label: "Alien", merge: true, solidEyes: true },
  { key: "blocks", label: "Blocks", merge: true, solidEyes: true },
  { key: "mondrian", label: "Mondrian", merge: true },
  { key: "tile", label: "Tile", merge: true },
];

export const EFFECT_CATALOGUE = [
  { key: "none", label: "None" },
  { key: "glow", label: "Glow" },
  { key: "glass", label: "Glass" },
  { key: "sketch", label: "Drawing" },
  { key: "layers", label: "Layers", exclusive: true },
];

export const OFF_AXIS_MARGINS = ["extend", "flood"];

export const MARGIN_CATALOGUE = [
  { key: "plain", label: "None" },
  { key: "scatter", label: "Scatter" },
  { key: "mosaic", label: "Mosaic" },
];

const EYE_SHAPES = [
  { key: "default", label: "Follow pattern" },
  { key: "square", label: "Square" },
  { key: "rounded", label: "Rounded" },
  { key: "extra-rounded", label: "Extra rounded" },
  { key: "circle", label: "Circle" },
  { key: "diamond", label: "Diamond" },
  { key: "diamond-round", label: "Soft diamond" },
];

const DOT_EYE = { key: "dots", label: "Dots" };

export const EYE_FRAME_CATALOGUE = [
  ...EYE_SHAPES,
  DOT_EYE,
  { key: "shaken", label: "Shaken" },
  { key: "atom", label: "Atom" },
  { key: "planet", label: "Planet" },
  { key: "alien", label: "Alien" },
  { key: "blocks", label: "Blocks" },
  { key: "flurry", label: "Flurry" },
  { key: "sdoz", label: "Sdoz" },
  { key: "drop_in", label: "Drop in" },
  { key: "drop", label: "Drop" },
  { key: "dropeye", label: "Dropeye" },
  { key: "dropeyeleft", label: "Dropeyeleft" },
  { key: "dropeyeleaf", label: "Dropeyeleaf" },
  { key: "dropeyeright", label: "Dropeyeright" },
  { key: "squarecircle", label: "Squarecircle" },
  { key: "flower", label: "Flower" },
  { key: "flower_in", label: "Flower in" },
  { key: "leaf", label: "Leaf" },
  { key: "jungle", label: "Jungle" },
  { key: "ninja", label: "Ninja" },
  { key: "round-corner", label: "Round corner" },
  { key: "balls", label: "Balls" },
  { key: "comic", label: "Comic" },
  { key: "emblema", label: "Emblema" },
  { key: "stamp", label: "Stamp" },
];

export const EYE_IN_CATALOGUE = [
  ...EYE_SHAPES,
  DOT_EYE,
  { key: "drop_in", label: "Drop in" },
  { key: "flurry", label: "Flurry" },
  { key: "sdoz", label: "Sdoz" },
  { key: "drop", label: "Drop" },
  { key: "dropeye", label: "Dropeye" },
  { key: "sun", label: "Sun" },
  { key: "star", label: "Star" },
  { key: "sparkle", label: "Sparkle" },
  { key: "danger", label: "Danger" },
  { key: "cross", label: "Cross" },
  { key: "plus", label: "Plus" },
  { key: "x", label: "X" },
  { key: "heart", label: "Heart" },
  { key: "jungle", label: "Jungle" },
  { key: "ninja", label: "Ninja" },
  { key: "round-corner", label: "Round corner" },
  { key: "square-corner", label: "Square corner" },
  { key: "round-diagonal", label: "Round diagonal" },
  { key: "borders-arc", label: "Borders arc" },
  { key: "diagonal-pill", label: "Diagonal pill" },
  { key: "3-horizontal", label: "3 horizontal" },
  { key: "3-ver", label: "3 ver" },
  { key: "comic", label: "Comic" },
  { key: "rough", label: "Rough" },
  { key: "stamp-thick", label: "Stamp thick" },
  { key: "stamp", label: "Stamp" },
  { key: "emblema", label: "Emblema" },
];

export const FRAME_CATALOGUE = [
  { key: "none", label: "None" },
  { key: "border", label: "Border" },
  { key: "border-inset", label: "Inner border" },
  { key: "corners", label: "Corners" },
  { key: "rounded-corners", label: "Rounded corners" },
  { key: "rounded-border", label: "Rounded border" },
  { key: "circle", label: "Circle" },
  { key: "circle-double", label: "Double circle" },
  { key: "circle-dashed", label: "Dashed circle" },
  { key: "circle-dashed-wide", label: "Wide dashed circle" },
  { key: "circle-dashed-fine", label: "Fine dashed circle" },
  { key: "hexagon", label: "Hexagon" },
  { key: "circle-sketch", label: "Sketched circle" },
  {
    key: "band-bottom",
    label: "Caption band (bottom, round)",
    separatorBefore: true,
  },
  { key: "band-top", label: "Caption band (top, round)" },
  { key: "band-bottom-square", label: "Caption band (bottom, square)" },
  { key: "band-top-square", label: "Caption band (top, square)" },
  { key: "ribbon-bottom", label: "Caption ribbon (bottom)" },
  { key: "ribbon-top", label: "Caption ribbon (top)" },
  { key: "bubble-bottom", label: "Caption bubble (bottom)" },
  { key: "bubble-top", label: "Caption bubble (top)" },
];

export const LABEL_FRAMES = new Set([
  "band-bottom",
  "band-top",
  "band-bottom-square",
  "band-top-square",
  "ribbon-bottom",
  "ribbon-top",
  "bubble-bottom",
  "bubble-top",
]);

export const AXES = [
  {
    key: "pattern",
    label: "Pattern",
    catalogue: PATTERN_CATALOGUE,
    control: "gallery",
  },
  {
    key: "eyeFrame",
    label: "Eyes frame",
    catalogue: EYE_FRAME_CATALOGUE,
    control: "gallery",
  },
  {
    key: "eyeIn",
    label: "Eyes in",
    catalogue: EYE_IN_CATALOGUE,
    control: "gallery",
  },
  {
    key: "frame",
    label: "Frame",
    catalogue: FRAME_CATALOGUE,
    control: "gallery",
  },
  {
    key: "marginStyle",
    label: "Surround",
    catalogue: MARGIN_CATALOGUE,
    control: "segmented",
  },
  {
    key: "effect",
    label: "Effect",
    catalogue: EFFECT_CATALOGUE,
    control: "segmented",
  },
];

const TEMPLATE_AXES = [
  "pattern",
  "effect",
  "marginStyle",
  "eyeFrame",
  "eyeIn",
  "frame",
];

export const TEMPLATES = [
  {
    key: "default",
    label: "Default",
    config: {
      pattern: "square",
      effect: "none",
      marginStyle: "plain",
      eyeFrame: "square",
      eyeIn: "square",
      frame: "none",
      params: {},
    },
  },
  {
    key: "easy",
    label: "Easy",
    config: {
      pattern: "blob",
      effect: "none",
      marginStyle: "plain",
      eyeFrame: "default",
      eyeIn: "default",
      frame: "none",
      params: {
        foreground: "#006699",
      },
    },
  },
  {
    key: "dot",
    label: "Dot",
    config: {
      pattern: "circle",
      effect: "none",
      marginStyle: "plain",
      eyeFrame: "square",
      eyeIn: "circle",
      frame: "none",
      params: {
        foreground: "#975820",
        dataScale: 0.6,
      },
    },
  },
  {
    key: "mosaic",
    label: "Mosaic",
    config: {
      pattern: "shake",
      effect: "none",
      marginStyle: "plain",
      eyeFrame: "shaken",
      eyeIn: "rough",
      frame: "none",
      params: {
        foreground: {
          type: "linear",
          angle: 90,
          stops: ["#a13535", "#0277bd"],
        },
      },
    },
  },
  {
    key: "dusk",
    label: "Dusk",
    config: {
      pattern: "special-circle-orizz",
      effect: "none",
      marginStyle: "plain",
      eyeFrame: "rounded",
      eyeIn: "rounded",
      frame: "rounded-border",
      params: {
        frameThickness: 1,
        foreground: {
          type: "linear",
          angle: 90,
          stops: ["#902d9e", "#c26c58"],
        },
      },
    },
    logo: {
      enabled: true,
      source: "icon",
      icon: "fab-instagram",
      color: {
        type: "linear",
        angle: 90,
        stops: ["#762fb9", "#bb2d68", "#d58d46"],
      },
      size: 37,
      padding: 5,
    },
  },
  {
    key: "jungle",
    label: "Jungle",
    config: {
      pattern: "origami",
      effect: "none",
      marginStyle: "plain",
      eyeFrame: "jungle",
      eyeIn: "jungle",
      frame: "rounded-corners",
      params: {
        foreground: {
          type: "radial",
          stops: ["#5c8b29", "#25492f"],
        },
        background: "#eef2e2",
        eyeInColor: "#60a541",
        margin: 2,
        framePadding: 1,
      },
    },
  },
  {
    key: "camo",
    label: "Camo",
    config: {
      pattern: "blob",
      effect: "none",
      marginStyle: "scatter",
      eyeFrame: "default",
      eyeIn: "default",
      frame: "none",
      params: {
        foreground: "#1c4a1a",
        background: "#e3d68a",
        margin: 3,
        clearance: 1,
        density: 0.5,
      },
    },
  },
  {
    key: "circle",
    label: "Circle",
    config: {
      pattern: "square",
      effect: "none",
      marginStyle: "scatter",
      eyeFrame: "circle",
      eyeIn: "circle",
      frame: "circle",
      params: {
        margin: 0,
        frameThickness: 0.6,
        frameGap: 1,
        framePadding: 1.5,
        backdrop: "blur",
      },
    },
    logo: {
      enabled: true,
      background: true,
      source: "icon",
      icon: "earth-americas",
    },
  },
  {
    key: "neon",
    label: "Neon",
    config: {
      pattern: "lines",
      effect: "glow",
      marginStyle: "scatter",
      eyeFrame: "default",
      eyeIn: "default",
      frame: "none",
      params: {
        margin: 4,
        background: "#101529",
        foreground: {
          type: "linear",
          angle: 45,
          blend: "random",
          stops: ["#fb51dd", "#f2cffa", "#aefdfd", "#54a9fe"],
        },
        lineThickness: 2,
        finderThickness: 4,
        clearance: 1,
        density: 0.5,
        glowAmount: 2,
      },
    },
  },
  {
    key: "quantum",
    label: "Quantum",
    config: {
      pattern: "particles",
      effect: "none",
      marginStyle: "plain",
      eyeFrame: "atom",
      eyeIn: "circle",
      frame: "none",
      params: {},
    },
  },
  {
    key: "bubbles",
    label: "Bubbles",
    config: {
      pattern: "bubbles",
      effect: "none",
      marginStyle: "plain",
      eyeFrame: "circle",
      eyeIn: "circle",
      frame: "none",
      params: {
        foreground: {
          type: "linear",
          angle: 45,
          blend: "random",
          stops: ["#10a8e9", "#1aa8cc", "#0f8bdd", "#012c8f"],
        },
        eyeFrameColor: "#141e92",
        eyeInColor: "#141e92",
      },
    },
  },
  {
    key: "alien",
    label: "Alien",
    config: {
      pattern: "alien",
      effect: "none",
      marginStyle: "plain",
      eyeFrame: "alien",
      eyeIn: "circle",
      frame: "none",
      params: {},
    },
  },
  {
    key: "blocks",
    label: "Blocks",
    config: {
      pattern: "blocks",
      effect: "none",
      marginStyle: "plain",
      eyeFrame: "blocks",
      eyeIn: "square",
      frame: "none",
      params: {
        foreground: {
          type: "linear",
          angle: 45,
          blend: "random",
          stops: ["#dc9c07", "#d21313", "#131d87"],
        },
        eyeFrameColor: "#131d87",
        eyeInColor: "#131d87",
      },
    },
  },
  {
    key: "mondrian",
    label: "Mondrian",
    config: {
      pattern: "mondrian",
      effect: "none",
      marginStyle: "flood",
      eyeFrame: "default",
      eyeIn: "default",
      frame: "none",
      params: {
        lineColor: "#000000",
        foreground: {
          type: "linear",
          angle: 45,
          blend: "random",
          stops: ["#860909", "#0e21a0", "#95800f"],
        },
      },
    },
  },
  {
    key: "layers",
    label: "Layers",
    config: {
      pattern: "square",
      effect: "layers",
      marginStyle: "plain",
      eyeFrame: "default",
      eyeIn: "default",
      frame: "none",
      params: {
        background: "#163157",
        foreground: {
          type: "linear",
          angle: 45,
          stops: ["#e80004", "#000000", "#ca70cf", "#000000", "#ffffff"],
        },
        blendMode: "difference",
        offsetX: 0.6,
        offsetY: 0.6,
      },
    },
  },
  {
    key: "tile",
    label: "Tile",
    config: {
      pattern: "tile",
      effect: "none",
      marginStyle: "mosaic",
      eyeFrame: "default",
      eyeIn: "default",
      frame: "none",
      params: {
        margin: 10,
        background: "#b3b8fd",
        innerSquare: 2,
        outerSquare: 6,
      },
    },
  },
  {
    key: "glass",
    label: "Glass",
    config: {
      pattern: "square",
      effect: "glass",
      marginStyle: "plain",
      eyeFrame: "square",
      eyeIn: "square",
      frame: "none",
      params: {
        background: "#fcb9ff",
        shapes: 100,
        shapeOpacity: 0.3,
        strokeWidth: 1.5,
        shapeGap: 0,
        qrLayer: "Above",
      },
    },
  },
  {
    key: "drawing",
    label: "Drawing",
    config: {
      pattern: "square",
      effect: "sketch",
      marginStyle: "plain",
      eyeFrame: "flurry",
      eyeIn: "flurry",
      frame: "border",
      params: {
        foreground: "#222222",
        background: "#ffffff",
        backdrop: "blur",
        fillStyle: "Hachure",
        fillWeight: 2,
        fillGap: 4,
        strokeWidth: 1,
        roughness: 0.5,
        bowing: 6,
        frameThickness: 1.5,
      },
    },
  },
  {
    key: "aurora",
    label: "Aurora",
    config: {
      pattern: "square",
      effect: "glow",
      marginStyle: "scatter",
      eyeFrame: "emblema",
      eyeIn: "emblema",
      frame: "hexagon",
      params: {
        background: "#0b1f16",
        foreground: {
          type: "linear",
          angle: 120,
          blend: "random",
          stops: ["#cdb4db", "#ffc8dd", "#ffafcc", "#bde0fe", "#a2d2ff"],
        },
        glowAmount: 0.3,
        clearance: 1,
        density: 0.35,
        dotSize: "Center",
        margin: 3,
        backdrop: "blur",
      },
    },
  },
];

function paramsEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (typeof a !== "object" || typeof b !== "object" || !a || !b) {
    return false;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  return (
    aKeys.length === bKeys.length &&
    aKeys.every((key) => paramsEqual(a[key], b[key]))
  );
}

function logoMatches(logo, templateLogo) {
  if (logo === undefined) {
    return true;
  }

  const expected = { ...LOGO_DEFAULTS, ...templateLogo };

  if (!logo.enabled && !expected.enabled) {
    return true;
  }

  return paramsEqual(logo, expected);
}

export function templateFor(config, logo) {
  return (
    TEMPLATES.find(
      (template) =>
        TEMPLATE_AXES.every((axis) => config[axis] === template.config[axis]) &&
        paramsEqual(config.params, template.config.params) &&
        logoMatches(logo, template.logo)
    )?.key ?? null
  );
}

export function applyTemplate(key, config) {
  const template = TEMPLATES.find((entry) => entry.key === key);

  if (!template) {
    return config;
  }

  return {
    ...config,
    ...template.config,
    params: { ...template.config.params },
  };
}

export const DEFAULT_CONFIG = {
  pattern: "square",
  effect: "none",
  marginStyle: "plain",
  eyeFrame: "square",
  eyeIn: "square",
  frame: "none",
  params: {},
};

const known = (catalogue, key, fallback) =>
  catalogue.some((entry) => entry.key === key) ? key : fallback;

export function isMerge(patternKey) {
  return PATTERN_CATALOGUE.find((p) => p.key === patternKey)?.merge ?? false;
}

const DATA_SCALE_UNAWARE = new Set([
  "mondrian",
  "tile",
  "particles",
  "bubbles",
  "alien",
  "blocks",
  "blob",
  "lines",
]);

export const SHARED_PARAMS = {
  foreground: {
    label: "Foreground",
    type: "color",
    gradient: true,
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
  eyeFrameColor: {
    label: "Eyes frame colour",
    type: "color",
    inheritParam: "foreground",
    inheritStop: 0,
    gradient: true,
    visible: (config) => config.eyeFrame !== "default",
  },
  eyeInColor: {
    label: "Eyes centre colour",
    type: "color",
    inheritParam: "foreground",
    inheritStop: 1,
    gradient: true,
    visible: (config) => config.eyeIn !== "default",
  },
  dataColor: {
    label: "Data colour",
    type: "color",
    inheritParam: "foreground",
    gradient: true,
  },
  frameGap: {
    label: "Frame gap",
    type: "number",
    control: "slider",
    min: -8,
    max: 8,
    step: 0.5,
    default: 0,
    visible: (config) => config.frame !== "none",
  },
  framePadding: {
    label: "Frame padding",
    type: "number",
    control: "slider",
    min: 0,
    max: 8,
    step: 0.5,
    default: 0,
    visible: (config) => config.frame !== "none",
  },
  frameThickness: {
    label: "Frame thickness",
    type: "number",
    control: "slider",
    min: 0.15,
    max: 2,
    step: 0.05,
    default: 0.5,
    visible: (config) => config.frame !== "none",
  },
  backdrop: {
    label: "Background style",
    type: "select",
    options: ["solid", "blur", "halftone"],
    default: "solid",
    warning: (value) => value === "halftone",
  },
  frameColor: {
    label: "Frame colour",
    type: "color",
    inheritParam: "foreground",
    visible: (config) => config.frame !== "none",
    gradient: true,
  },
  backdropStrength: {
    label: "Background strength",
    type: "number",
    control: "slider",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.5,
    visible: (config, valueOf) => valueOf("backdrop") === "blur",
  },
  eyeWashOpacity: {
    label: "Eye background fade",
    type: "number",
    control: "slider",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.6,
    visible: (config, valueOf, logoBackground) =>
      (config.eyeFrame !== "default" || config.eyeIn !== "default") &&
      logoBackground,
  },
  halftoneScale: {
    label: "Image scale",
    type: "number",
    control: "slider",
    min: 0.1,
    max: 1,
    step: 0.05,
    default: 1,
    visible: (config, valueOf) => valueOf("backdrop") === "halftone",
  },
  halftoneCells: {
    label: "Image detail",
    type: "number",
    control: "slider",
    min: 1,
    max: 8,
    step: 1,
    default: 3,
    visible: (config, valueOf) => valueOf("backdrop") === "halftone",
  },
  halftoneAlignment: {
    label: "Solid alignment patterns",
    type: "boolean",
    default: true,
    visible: (config, valueOf) => valueOf("backdrop") === "halftone",
  },
  halftoneTiming: {
    label: "Solid timing patterns",
    type: "boolean",
    default: true,
    visible: (config, valueOf) => valueOf("backdrop") === "halftone",
  },
  halftoneBrightness: {
    label: "Image brightness",
    type: "number",
    control: "slider",
    min: 0,
    max: 5,
    step: 0.1,
    default: 1.8,
    visible: (config, valueOf) => valueOf("backdrop") === "halftone",
  },
  halftoneContrast: {
    label: "Image contrast",
    type: "number",
    control: "slider",
    min: 0,
    max: 10,
    step: 0.1,
    default: 1,
    visible: (config, valueOf) => valueOf("backdrop") === "halftone",
  },
  dataScale: {
    label: "Data scale",
    type: "number",
    control: "slider",
    min: 0.3,
    max: 1,
    step: 0.05,
    default: 1,
    visible: (config) => !DATA_SCALE_UNAWARE.has(config.pattern),
  },
  dataOpacity: {
    label: "Data opacity",
    type: "number",
    control: "slider",
    min: 0.2,
    max: 1,
    step: 0.05,
    default: 1,
  },
  frameText: {
    label: "Caption text",
    type: "text",
    default: "Caption",
    visible: (config) => LABEL_FRAMES.has(config.frame),
  },
  frameFont: {
    label: "Caption font",
    type: "font",
    default: '{"key":"site"}',
    visible: (config, valueOf) =>
      LABEL_FRAMES.has(config.frame) && Boolean(valueOf("frameText")),
  },
  frameTextColor: {
    label: "Caption colour",
    type: "color",
    inheritParam: "foreground",
    visible: (config, valueOf) =>
      LABEL_FRAMES.has(config.frame) && Boolean(valueOf("frameText")),
  },
};

export const PATTERN_PARAMS = {
  lines: {
    quietZone: {
      label: "Quiet zone",
      type: "select",
      options: ["minimal", "full"],
      default: "minimal",
    },
    invert: {
      label: "Invert",
      type: "boolean",
      default: false,
    },
    lineThickness: {
      label: "Line thickness",
      type: "number",
      min: 1,
      max: 4,
      step: 1,
      default: 2,
    },
    finderThickness: {
      label: "Finder thickness",
      type: "number",
      min: 1,
      max: 4,
      step: 1,
      default: 4,
    },
    seed: {
      label: "Seed",
      type: "number",
      min: 1,
      max: 999,
      step: 1,
      default: 1,
    },
  },
  blocks: {
    horizontalThickness: {
      label: "Horizontal thickness",
      type: "number",
      control: "slider",
      min: 0,
      max: 1,
      step: 0.1,
      default: 0.7,
    },
    verticalThickness: {
      label: "Vertical thickness",
      type: "number",
      control: "slider",
      min: 0,
      max: 1,
      step: 0.1,
      default: 0.7,
    },
    crossThickness: {
      label: "Cross thickness",
      type: "number",
      control: "slider",
      min: 0,
      max: 1,
      step: 0.1,
      default: 0.7,
    },
  },
  alien: {
    seed: {
      label: "Seed",
      type: "number",
      min: 1,
      max: 100,
      step: 1,
      default: 1,
    },
  },
  bubbles: {
    randomize: {
      label: "Vary bubble size",
      type: "boolean",
      default: false,
      warning: true,
    },
    seed: {
      label: "Seed",
      type: "number",
      min: 1,
      max: 100,
      step: 1,
      default: 1,
      visible: (config) => config.params?.randomize === true,
    },
  },
  particles: {
    seed: {
      label: "Seed",
      type: "number",
      min: 1,
      max: 100,
      step: 1,
      default: 1,
    },
  },
  mondrian: {
    cellColor: {
      label: "Cell colour",
      type: "color",
      inheritParam: "background",
    },
    lineColor: {
      label: "Line colour",
      type: "color",
      inheritParam: "background",
    },
    lineThickness: {
      label: "Line thickness",
      type: "number",
      control: "slider",
      min: 0,
      max: 10,
      step: 1,
      default: 8,
    },
    seed: {
      label: "Seed",
      type: "number",
      min: 1,
      max: 100,
      step: 1,
      default: 1,
    },
  },
  tile: {
    cellColor: {
      label: "Tile colour",
      type: "color",
      inheritParam: "background",
      full: false,
    },
    groutColor: {
      label: "Grout colour",
      type: "color",
      inheritParam: "background",
      full: false,
    },
  },
  blob: {
    seed: STYLE_SCHEMAS.camo.params.seed,
    invert: STYLE_SCHEMAS.camo.params.invert,
  },
};

export const EFFECT_PARAMS = {
  sketch: {
    fillStyle: {
      label: "Fill style",
      type: "select",
      options: [
        "Hachure",
        "Solid",
        "Zigzag",
        "Cross-hatch",
        "Dots",
        "Dashed",
        "Zigzag-line",
      ],
      default: "Zigzag",
    },
    roughness: {
      label: "Roughness",
      type: "number",
      control: "slider",
      min: 0,
      max: 10,
      step: 0.5,
      default: 1,
    },
    bowing: {
      label: "Bowing",
      type: "number",
      control: "slider",
      min: 0,
      max: 10,
      step: 0.5,
      default: 1,
    },
    fillWeight: {
      label: "Fill weight",
      type: "number",
      control: "slider",
      min: 0,
      max: 10,
      step: 0.5,
      default: 2,
    },
    fillGap: {
      label: "Fill gap",
      type: "number",
      control: "slider",
      min: 1,
      max: 10,
      step: 0.5,
      default: 4,
    },
    strokeWidth: {
      label: "Stroke width",
      type: "number",
      control: "slider",
      min: 0,
      max: 10,
      step: 0.5,
      default: 1,
    },
    seed: {
      label: "Seed",
      type: "number",
      min: 1,
      max: 100,
      step: 1,
      default: 1,
    },
  },
  glass: {
    shapes: {
      label: "Shapes",
      type: "number",
      control: "slider",
      min: 1,
      max: 400,
      step: 1,
      default: 100,
    },
    shapeOpacity: {
      label: "Shape opacity",
      type: "number",
      control: "slider",
      min: 0,
      max: 1,
      step: 0.1,
      default: 0.3,
    },
    strokeWidth: {
      label: "Stroke width",
      type: "number",
      control: "slider",
      min: 0,
      max: 4,
      step: 0.1,
      default: 1.5,
    },
    shapeGap: {
      label: "Shape gap",
      type: "number",
      control: "slider",
      min: -4,
      max: 4,
      step: 1,
      default: 0,
    },
    qrLayer: {
      label: "Code sits",
      type: "select",
      options: ["Above", "Below"],
      default: "Above",
    },
    seed: {
      label: "Seed",
      type: "number",
      min: 1,
      max: 100,
      step: 1,
      default: 1,
    },
  },
  layers: {
    foreground: {
      ...SHARED_PARAMS.foreground,
      gradient: "stops",
    },
    offsetX: {
      label: "Offset X",
      type: "number",
      control: "slider",
      min: -1,
      max: 1,
      step: 0.1,
      default: 0.6,
    },
    offsetY: {
      label: "Offset Y",
      type: "number",
      control: "slider",
      min: -1,
      max: 1,
      step: 0.1,
      default: 0.6,
    },
    blendMode: {
      label: "Blend mode",
      type: "select",
      options: [
        "normal",
        "multiply",
        "screen",
        "overlay",
        "darken",
        "lighten",
        "color-dodge",
        "color-burn",
        "hard-light",
        "soft-light",
        "difference",
        "exclusion",
        "hue",
        "saturation",
        "color",
        "luminosity",
      ],
      default: "normal",
    },
  },
  glow: {
    glowAmount: {
      label: "Glow amount",
      type: "number",
      control: "slider",
      min: 0,
      max: 2,
      step: 0.1,
      default: 0.5,
    },
  },
};

export const MARGIN_PARAMS = {
  scatter: {
    clearance: {
      label: "Clearance",
      type: "number",
      control: "slider",
      min: 0,
      max: 4,
      step: 1,
      default: 0,
    },
    density: {
      label: "Density",
      type: "number",
      control: "slider",
      min: 0,
      max: 1,
      step: 0.05,
      default: 0.5,
    },
    dotSize: {
      label: "Fill size",
      type: "select",
      options: ["Uniform", "Center", "Edge", "Random"],
      default: "Uniform",
      visible: (config) => !isMerge(config.pattern),
    },
    seed: {
      label: "Seed",
      type: "number",
      min: 1,
      max: 100,
      step: 1,
      default: 1,
    },
  },
  mosaic: {
    innerSquare: {
      label: "Inner square",
      type: "number",
      control: "stepper",
      min: 0,
      max: 10,
      step: 1,
      default: 2,
    },
    outerSquare: {
      label: "Outer square",
      type: "number",
      control: "stepper",
      min: 0,
      max: 10,
      step: 1,
      default: 6,
    },
  },
};

export function paramsFor(config) {
  return {
    ...SHARED_PARAMS,
    ...PATTERN_PARAMS[config.pattern],
    ...EFFECT_PARAMS[config.effect],
    ...MARGIN_PARAMS[config.marginStyle],
  };
}

export function resolveAxisParams(config, flatSettings = {}) {
  const specs = paramsFor(config);
  const out = {};

  for (const [key, spec] of Object.entries(specs)) {
    const value = config.params?.[key] ?? spec.default;
    if (value !== undefined) {
      out[key] = value;
    } else if (spec.inherit) {
      out[key] = flatSettings[spec.inherit] ?? FLAT_FALLBACKS[spec.inherit];
    }
  }

  return out;
}

function migrateHalftone(cfg) {
  return {
    ...cfg,
    pattern: "square",
    params: {
      ...cfg.params,
      backdrop: "halftone",
      dataScale: 0.35,
      halftoneScale: cfg.params?.imageScale,
      halftoneBrightness: cfg.params?.brightness,
      halftoneContrast: cfg.params?.contrast,
    },
  };
}

export function parseAxisConfig(raw) {
  if (!raw) {
    return { ...DEFAULT_CONFIG };
  }

  let cfg;
  try {
    cfg = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return { ...DEFAULT_CONFIG };
  }

  if (cfg?.pattern === "halftone") {
    cfg = migrateHalftone(cfg);
  }

  return {
    pattern: known(PATTERN_CATALOGUE, cfg?.pattern, DEFAULT_CONFIG.pattern),
    effect: known(EFFECT_CATALOGUE, cfg?.effect, DEFAULT_CONFIG.effect),
    marginStyle: OFF_AXIS_MARGINS.includes(cfg?.marginStyle)
      ? cfg.marginStyle
      : known(MARGIN_CATALOGUE, cfg?.marginStyle, DEFAULT_CONFIG.marginStyle),
    eyeFrame: known(
      EYE_FRAME_CATALOGUE,
      cfg?.eyeFrame,
      DEFAULT_CONFIG.eyeFrame
    ),
    eyeIn: known(EYE_IN_CATALOGUE, cfg?.eyeIn, DEFAULT_CONFIG.eyeIn),
    frame: known(FRAME_CATALOGUE, cfg?.frame, DEFAULT_CONFIG.frame),
    params: cfg?.params && typeof cfg.params === "object" ? cfg.params : {},
  };
}

export function stringifyAxisConfig(config) {
  return JSON.stringify({
    pattern: config.pattern,
    effect: config.effect,
    marginStyle: config.marginStyle,
    eyeFrame: config.eyeFrame,
    eyeIn: config.eyeIn,
    frame: config.frame,
    params: config.params ?? {},
  });
}
