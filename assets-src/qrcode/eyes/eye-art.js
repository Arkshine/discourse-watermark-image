import { EYE_FRAMES, EYE_INS } from "../patterns/small-patterns.js";
import { formatNum } from "../shapes.js";
import { EYE_ART } from "./eye-art-data.js";

function EYE_ORIGINS(rowLen) {
  return [
    [0, 0],
    [rowLen - 7, 0],
    [0, rowLen - 7],
  ];
}

const EYE_SCALE = 0.5;

const STROKED_EYE_ART = new Set(["atom", "planet", "alien"]);
const MIRRORED_EYE_ART = new Set(["jungle"]);

function orientedEyeMarkup(role, key, originIndex) {
  const table = role === "eye-in" ? EYE_ART.in : EYE_ART.frame;
  const box = role === "eye-in" ? 6 : 14;
  const markup = table[key];

  const mirror = MIRRORED_EYE_ART.has(key)
    ? originIndex === 1
      ? `translate(${box},0) scale(-1,1)`
      : originIndex === 2
        ? `translate(0,${box}) scale(1,-1)`
        : null
    : null;

  return mirror ? `<g transform="${mirror}">${markup}</g>` : markup;
}

function importedEyeLayer(role, key, x, y, fill, originIndex) {
  const inset = role === "eye-in" ? 2 : 0;

  return {
    role,
    markup: orientedEyeMarkup(role, key, originIndex),
    stroked: STROKED_EYE_ART.has(key),
    fill,
    transform: `translate(${formatNum(x + inset)},${formatNum(y + inset)}) scale(${EYE_SCALE})`,
  };
}

function importedEyeMarkup(role, key, x, y, originIndex) {
  const inset = role === "eye-in" ? 2 : 0;

  return `<g transform="translate(${formatNum(x + inset)},${formatNum(y + inset)}) scale(${EYE_SCALE})">${orientedEyeMarkup(role, key, originIndex)}</g>`;
}

function inheritedInk(colour, index) {
  if (
    colour &&
    typeof colour === "object" &&
    colour.blend === "random" &&
    colour.stops?.length
  ) {
    return colour.stops[index % colour.stops.length];
  }

  return colour;
}

function buildEyeLayers(qr, cfg, params) {
  if (cfg.eyeFrame === "default" && cfg.eyeIn === "default") {
    return [];
  }

  const origins = EYE_ORIGINS(qr.size);
  const frameFill = params.eyeFrameColor || inheritedInk(params.foreground, 0);
  const innerFill = params.eyeInColor || inheritedInk(params.foreground, 1);
  const layers = [];

  if (EYE_ART.frame[cfg.eyeFrame]) {
    if (typeof frameFill === "object") {
      layers.push({
        role: "eye-frame",
        markup: origins
          .map(([x, y], i) =>
            importedEyeMarkup("eye-frame", cfg.eyeFrame, x, y, i)
          )
          .join(""),
        stroked: STROKED_EYE_ART.has(cfg.eyeFrame),
        fill: frameFill,
      });
    } else {
      origins.forEach(([x, y], i) => {
        layers.push(
          importedEyeLayer("eye-frame", cfg.eyeFrame, x, y, frameFill, i)
        );
      });
    }
  } else {
    const frame = EYE_FRAMES[cfg.eyeFrame] ?? EYE_FRAMES.square;
    let frameD = "";
    for (const [x, y] of origins) {
      frameD += frame(x, y);
    }
    layers.push({ role: "eye-frame", d: frameD, fill: frameFill });
  }

  if (EYE_ART.in[cfg.eyeIn]) {
    if (typeof innerFill === "object") {
      layers.push({
        role: "eye-in",
        markup: origins
          .map(([x, y], i) => importedEyeMarkup("eye-in", cfg.eyeIn, x, y, i))
          .join(""),
        stroked: STROKED_EYE_ART.has(cfg.eyeIn),
        fill: innerFill,
      });
    } else {
      origins.forEach(([x, y], i) => {
        layers.push(importedEyeLayer("eye-in", cfg.eyeIn, x, y, innerFill, i));
      });
    }
  } else {
    const inner = EYE_INS[cfg.eyeIn] ?? EYE_INS.square;
    let innerD = "";
    for (const [x, y] of origins) {
      innerD += inner(x, y);
    }
    layers.push({ role: "eye-in", d: innerD, fill: innerFill });
  }

  return layers;
}

export { buildEyeLayers, EYE_ART, EYE_ORIGINS, EYE_SCALE };
