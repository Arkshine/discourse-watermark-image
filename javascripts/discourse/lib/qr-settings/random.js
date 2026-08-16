import {
  EFFECT_CATALOGUE,
  EYE_FRAME_CATALOGUE,
  EYE_IN_CATALOGUE,
  FRAME_CATALOGUE,
  MARGIN_CATALOGUE,
  paramsFor,
  PATTERN_CATALOGUE,
} from "./axes.js";
import { LOGO_PADDING, LOGO_SIZE } from "./logo.js";

export const RANDOM_LOGO_EVENT = "watermark:random-logo";

export const PALETTES = [
  { background: "#faf7f2", inks: ["#1b1b1b", "#3b3226", "#7a2e1d", "#274b4a"] },
  { background: "#0f1626", inks: ["#ff5f6d", "#ffc371", "#7de2d1", "#c3bef7"] },
  { background: "#fffdf3", inks: ["#b8410f", "#8c1c13", "#2f5d50", "#1d3557"] },
  { background: "#f2efe6", inks: ["#d62828", "#1d3557", "#111111", "#5c4d7d"] },
  { background: "#0b1f16", inks: ["#a3e635", "#5eead4", "#fcd34d", "#f4f1de"] },
  { background: "#1a0b2e", inks: ["#ff8fab", "#a06cd5", "#48cae4", "#ffe066"] },
  { background: "#efe0c9", inks: ["#7c4a2d", "#2f3e46", "#a4161a", "#31572c"] },
  { background: "#e5e7eb", inks: ["#111827", "#374151", "#1f2937", "#4c1d95"] },
  { background: "#05070d", inks: ["#fb51dd", "#aefdfd", "#54a9fe", "#f2cffa"] },
  { background: "#fff1f2", inks: ["#9f1239", "#4c0519", "#1e293b", "#134e4a"] },
  { background: "#012a4a", inks: ["#61a5c2", "#a9d6e5", "#ffd166", "#f8f9fa"] },
  { background: "#f7f4ea", inks: ["#1b4332", "#774936", "#1b263b", "#6a040f"] },
  { background: "#2e3440", inks: ["#88c0d0", "#ebcb8b", "#a3be8c", "#d08770"] },
  { background: "#eceff4", inks: ["#2e3440", "#3b4252", "#434c5e", "#4c566a"] },
  { background: "#282a36", inks: ["#ff5555", "#50fa7b", "#8be9fd", "#bd93f9"] },
  { background: "#282828", inks: ["#fb4934", "#b8bb26", "#fabd2f", "#83a598"] },
  { background: "#fbf1c7", inks: ["#9d0006", "#79740e", "#076678", "#af3a03"] },
  { background: "#282c34", inks: ["#e06c75", "#98c379", "#61afef", "#c678dd"] },
  { background: "#fafafa", inks: ["#a626a4", "#ca1243", "#986801", "#0184bc"] },
  { background: "#191724", inks: ["#eb6f92", "#f6c177", "#9ccfd8", "#c4a7e7"] },
  { background: "#232136", inks: ["#eb6f92", "#ea9a97", "#3e8fb0", "#9ccfd8"] },
  { background: "#faf4ed", inks: ["#464261", "#286983", "#797593"] },
  { background: "#002b36", inks: ["#b58900", "#268bd2", "#2aa198", "#859900"] },
  { background: "#fdf6e3", inks: ["#cb4b16", "#dc322f", "#d33682", "#6c71c4"] },
  { background: "#2d353b", inks: ["#e67e80", "#dbbc7f", "#a7c080", "#7fbbb3"] },
  { background: "#1f1f28", inks: ["#ff9e3b", "#e6c384", "#98bb6c", "#7e9cd8"] },
  { background: "#eff1f5", inks: ["#4c4f69", "#d20f39", "#8839ef", "#1e66f5"] },
  { background: "#1e1e2e", inks: ["#f38ba8", "#fab387", "#a6e3a1", "#89b4fa"] },
  { background: "#303446", inks: ["#e78284", "#e5c890", "#a6d189", "#8caaee"] },
  { background: "#24273a", inks: ["#ed8796", "#eed49f", "#a6da95", "#8aadf4"] },
  { background: "#192330", inks: ["#f4a261", "#dbc074", "#81b29a", "#719cd6"] },
  { background: "#272822", inks: ["#a6e22e", "#e6db74", "#66d9ef", "#ae81ff"] },
];

const LOGO_ICONS = [
  "link",
  "globe",
  "qrcode",
  "camera",
  "comment",
  "envelope",
  "star",
  "heart",
  "bookmark",
  "location-dot",
  "wifi",
  "paperclip",
  "tag",
  "house",
  "user",
  "calendar",
  "music",
  "book",
  "mug-saucer",
  "share-nodes",
];

const SAFE_FLOORS = {
  dataScale: 0.8,
  dataOpacity: 0.85,
  margin: 0,
  frameGap: 0,
  clearance: 0,
  strokeWidth: 1,
  backdropStrength: 0.35,
};

const SAFE_CEILINGS = {
  frameGap: 2,
  framePadding: 2,
  margin: 4,
  glowAmount: 0.3,
  roughness: 1,
  bowing: 1,
  strokeWidth: 4,
  offsetX: 0.6,
  offsetY: 0.6,
};

const UNSAFE_EFFECTS = ["glass", "sketch", "layers"];
const PROCEDURAL_CHANCE = 0.25;

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const chance = (odds) => Math.random() < odds;
const shuffled = (list) =>
  list
    .map((value) => ({ value, order: Math.random() }))
    .sort((a, b) => a.order - b.order)
    .map((entry) => entry.value);

function hslToHex(h, s, l) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const value = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function luminance(hex) {
  const channels = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255
  );
  const [r, g, b] = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function repair(h, s, l, bgHex, dark) {
  let lightness = l;

  for (let i = 0; i < 20; i++) {
    const hex = hslToHex(h, s, lightness);
    if (contrastRatio(hex, bgHex) >= 4) {
      return hex;
    }
    lightness = dark ? Math.min(95, lightness + 3) : Math.max(5, lightness - 3);
  }

  return hslToHex(h, s, lightness);
}

export function proceduralPalette() {
  const baseHue = Math.floor(Math.random() * 360);
  const dark = chance(0.5);
  const bgHex = hslToHex(
    baseHue,
    10 + Math.random() * 12,
    dark ? 10 + Math.random() * 8 : 92 + Math.random() * 5
  );

  const inks = [0, 90, 180, 270].map((offset) => {
    const hue = (baseHue + offset + (Math.random() * 30 - 15) + 360) % 360;
    const saturation = 55 + Math.random() * 20;
    const lightness = dark ? 55 + Math.random() * 17 : 28 + Math.random() * 14;
    return repair(hue, saturation, lightness, bgHex, dark);
  });

  return { background: bgHex, inks };
}

function rollNumber(spec, key, wild) {
  const floor = wild ? -Infinity : (SAFE_FLOORS[key] ?? -Infinity);
  const ceiling = wild ? Infinity : (SAFE_CEILINGS[key] ?? Infinity);
  const min = Math.max(spec.min ?? 0, floor);
  const max = Math.min(spec.max ?? 1, ceiling);
  const step = spec.step ?? 1;

  if (max <= min) {
    return min;
  }

  const steps = Math.floor((max - min) / step);

  return Number(
    (min + Math.floor(Math.random() * (steps + 1)) * step).toFixed(3)
  );
}

function rollColour(spec, palette, force = false) {
  if (!spec.gradient || (!force && chance(0.6))) {
    return pick(palette.inks);
  }

  const stops = shuffled(palette.inks).slice(
    0,
    2 + Math.floor(Math.random() * 3)
  );

  return spec.gradient === "stops"
    ? { type: "linear", angle: 45, stops }
    : {
        type: pick(["linear", "radial"]),
        angle: Math.floor(Math.random() * 25) * 15,
        blend: pick(["smooth", "random"]),
        stops,
      };
}

function rollParams(config, palette, wild) {
  const specs = paramsFor(config);
  const params = {};

  config.params = params;
  const valueOf = (key) => params[key] ?? specs[key]?.default;

  for (const [key, spec] of Object.entries(specs)) {
    if (spec.visible && !spec.visible(config, valueOf)) {
      continue;
    }

    if (spec.type === "color" && spec.inheritParam && chance(0.6)) {
      continue;
    }

    let value;

    if (key === "background") {
      value = palette.background;
    } else if (key === "backdrop") {
      value = pick(spec.options.filter((option) => option !== "halftone"));
    } else if (key === "fillStyle" && !wild) {
      value = "Solid";
    } else if (spec.type === "color") {
      value = rollColour(spec, palette, config.effect === "layers" && !wild);
    } else if (spec.type === "boolean") {
      value = wild ? chance(0.5) : !spec.warning && chance(0.3);
    } else if (spec.type === "select") {
      value = pick(spec.options);
    } else if (spec.type === "number") {
      value = rollNumber(spec, key, wild);
    } else {
      continue;
    }

    if (
      spec.type === "color" &&
      spec.inheritParam &&
      JSON.stringify(value) === JSON.stringify(params[spec.inheritParam])
    ) {
      continue;
    }

    params[key] = value;
  }

  return params;
}

export function randomStyle({
  wild = false,
  pattern: pinned,
  effect: pinnedEffect,
} = {}) {
  const pattern = pinned
    ? (PATTERN_CATALOGUE.find((entry) => entry.key === pinned) ??
      pick(PATTERN_CATALOGUE))
    : pick(PATTERN_CATALOGUE);

  const named = (catalogue) =>
    !wild && pattern.solidEyes
      ? catalogue.filter((entry) => entry.key !== "default")
      : catalogue;

  const effects = wild
    ? EFFECT_CATALOGUE
    : EFFECT_CATALOGUE.filter((entry) => !UNSAFE_EFFECTS.includes(entry.key));
  const effect =
    pinnedEffect ?? (!wild && chance(0.45) ? "none" : pick(effects).key);

  const config = {
    pattern: pattern.key,
    effect,
    marginStyle: pick(MARGIN_CATALOGUE).key,
    eyeFrame: pick(named(EYE_FRAME_CATALOGUE)).key,
    eyeIn: pick(named(EYE_IN_CATALOGUE)).key,
    frame: pick(FRAME_CATALOGUE).key,
    params: {},
  };

  const palette = chance(PROCEDURAL_CHANCE)
    ? proceduralPalette()
    : pick(PALETTES);
  config.params = rollParams(config, palette, wild);

  return config;
}

export function randomLogo() {
  if (chance(0.55)) {
    return { enabled: false };
  }

  return {
    enabled: true,
    source: "icon",
    icon: pick(LOGO_ICONS),
    size: LOGO_SIZE.min + Math.floor(Math.random() * 4) * 4,
    padding: Math.floor(Math.random() * 4) * LOGO_PADDING.step,
    showDataBehind: chance(0.25),
  };
}
