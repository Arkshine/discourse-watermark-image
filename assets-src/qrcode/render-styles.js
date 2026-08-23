/* eslint-disable no-bitwise */ // QR module flags are bit fields
import { EFFECTS } from "./effects.js";
import { buildEyeLayers, EYE_ART, EYE_ORIGINS } from "./eyes/eye-art.js";
import { FRAMES } from "./frames/frame-shapes.js";
import { BACKGROUND_WASH_OPACITY, MARGINS } from "./margins.js";
import { buildStyledMatrix, Module, unlitMatrix } from "./matrix.js";
import { PATTERNS } from "./patterns/pattern-registry.js";
import { EYE_FRAMES, EYE_INS } from "./patterns/small-patterns.js";
import {
  lightModulesLinked,
  stampModules,
  stampModulesByColour,
  stampModulesLinked,
} from "./patterns/svg-compose.js";
import { shapePath } from "./shapes.js";

const BACKGROUND_DATA_SCALE = 0.4;
const BACKGROUND_EYE_WASH_OPACITY = 0.6;
const BACKGROUND_EYE_MARGIN = 1;

const DEFAULT_STYLE = "basic";

function finderBoxes(qr) {
  return [
    [0, 0],
    [qr.size - 7, 0],
    [0, qr.size - 7],
  ]
    .map(([x, y]) => `M${x},${y}h7v7h-7z`)
    .join("");
}

function flaggedBoxes(qr, flag, lit) {
  let d = "";

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      const cell = qr.matrix[y * qr.size + x];

      if (!(cell & flag) || (lit && !(cell & Module.ON))) {
        continue;
      }

      d += `M${x},${y}h1v1h-1z`;
    }
  }

  return d;
}

function lightModules(qr, params, skipEyes, pattern) {
  if (pattern.kind !== "stamp") {
    return "";
  }

  return stampModules(unlitMatrix(qr), params, skipEyes, pattern.stamp);
}

function structuralLayers(qr, params) {
  const flags =
    (params.halftoneAlignment ? Module.ALIGNMENT : 0) |
    (params.halftoneTiming ? Module.TIMING : 0);

  const cleared = finderBoxes(qr) + (flags ? flaggedBoxes(qr, flags) : "");
  const inked = flags ? flaggedBoxes(qr, flags, true) : "";

  return [
    { role: "backdrop", d: cleared, fill: params.background },
    { role: "backdrop", d: inked, fill: params.dataColor || params.foreground },
  ].filter((layer) => layer.d);
}

function renderStyled(qr, cfg) {
  const pattern = PATTERNS[cfg.pattern] ?? PATTERNS.square;
  const params = cfg.params.logoBackground
    ? {
        ...cfg.params,
        dataScale: Math.min(cfg.params.dataScale ?? 1, BACKGROUND_DATA_SCALE),
      }
    : cfg.params;

  const skipEyes = cfg.eyeFrame !== "default" || cfg.eyeIn !== "default";
  const dataFill = params.dataColor || params.foreground;
  const linked = Boolean(params.logoBackground && pattern.linkedStamp);

  const multicolour =
    pattern.kind === "stamp" &&
    dataFill &&
    typeof dataFill === "object" &&
    dataFill.blend === "random" &&
    (dataFill.stops?.length ?? 0) > 1;

  const built = multicolour
    ? stampModulesByColour(
        qr,
        params,
        skipEyes,
        pattern.stamp,
        dataFill.stops.length
      ).map((d, i) => ({ d, fill: dataFill.stops[i] }))
    : pattern.kind === "stamp"
      ? stampModules(qr, params, skipEyes, pattern.stamp)
      : linked
        ? stampModulesLinked(qr, params, skipEyes, pattern.linkedStamp)
        : pattern.build(qr, params, skipEyes);

  const linkedMarkup = linked && pattern.linkedMarkup;

  const dataLayers =
    typeof built === "string"
      ? [
          {
            role: "data",
            ...(linkedMarkup ? { markup: built } : { d: built }),
            fill: dataFill,
          },
        ]
      : built.map((layer) => ({
          role: "data",
          d: layer.d,
          markup: layer.markup,
          fill: layer.fill ?? dataFill,
          transform: layer.transform,
          stroked: layer.stroked,
          fillSize: layer.fillSize,
        }));

  const marginTreatment = MARGINS[cfg.marginStyle] ?? MARGINS.plain;

  const frame = FRAMES[cfg.frame] ?? FRAMES.none;
  const unframed = frame === FRAMES.none;
  const pad = frame.pad(qr, params);
  const shift = unframed
    ? 0
    : Math.max(params.frameGap ?? 0, -(pad + params.margin));
  const surroundPad = unframed ? marginTreatment.pad(params) : 0;
  const outset = unframed ? 0 : Math.max(0, params.framePadding ?? 0);
  const framePad = pad + shift + outset + surroundPad;
  const fillPad = pad + Math.min(0, shift) + surroundPad;
  const edge = params.margin + pad + shift;
  const outer = qr.size / 2 + params.margin + framePad;
  const fillOuter = qr.size / 2 + params.margin + fillPad;
  const framed =
    framePad || frame.backdrop
      ? {
          ...params,
          framePad,
          frameFillPad: fillPad,
          frameBackdrop: frame.backdrop?.(qr, params, outer),
          frameShape: (frame.fillShape ?? frame.backdrop)?.(
            qr,
            params,
            fillOuter
          ),
          frameContains: frame.fillContains?.(qr, params, fillOuter),
        }
      : params;

  const drawn = frame.build(qr, framed, edge);
  const frameLayer = typeof drawn === "string" ? { d: drawn } : drawn;

  const marginBuilt = marginTreatment.build(qr, framed, pattern);
  const marginLayers = (
    typeof marginBuilt === "string"
      ? [{ d: marginBuilt }]
      : [marginBuilt].flat()
  ).map((layer) => ({
    role: "margin",
    ...layer,
    fill: layer.fill ?? (params.marginColor || dataFill),
  }));
  const backgroundStamp =
    params.logoBackground && pattern.kind === "stamp"
      ? pattern.stamp
      : linked
        ? pattern.linkedStamp
        : null;
  const asBackgroundContent = (str) =>
    linkedMarkup ? { markup: str } : { d: str };
  const backgroundLayers = backgroundStamp
    ? [
        {
          role: "wash",
          ...asBackgroundContent(
            linked
              ? lightModulesLinked(
                  qr,
                  { ...params, dataScale: 1 },
                  skipEyes,
                  backgroundStamp
                )
              : lightModules(qr, { ...params, dataScale: 1 }, skipEyes, pattern)
          ),
          fill: params.background,
          opacity: BACKGROUND_WASH_OPACITY,
        },
        {
          role: "wash",
          ...asBackgroundContent(
            (linked ? stampModulesLinked : stampModules)(
              qr,
              { ...params, dataScale: 1 },
              skipEyes,
              backgroundStamp
            )
          ),
          fill: dataFill,
          opacity: BACKGROUND_WASH_OPACITY,
        },
        {
          role: "light",
          ...asBackgroundContent(
            linked
              ? lightModulesLinked(qr, params, skipEyes, backgroundStamp)
              : lightModules(qr, params, skipEyes, pattern)
          ),
          fill: params.background,
        },
      ]
    : [];

  const eyeLayers = buildEyeLayers(qr, cfg, params);
  const eyeWash =
    params.logoBackground && eyeLayers.length
      ? [
          {
            role: "wash",
            d: EYE_ORIGINS(qr.size)
              .map(([x, y]) =>
                shapePath(
                  cfg.eyeFrame,
                  x - BACKGROUND_EYE_MARGIN,
                  y - BACKGROUND_EYE_MARGIN,
                  7 + 2 * BACKGROUND_EYE_MARGIN,
                  true
                )
              )
              .join(""),
            fill: params.background,
            opacity: params.eyeWashOpacity ?? BACKGROUND_EYE_WASH_OPACITY,
          },
        ]
      : [];

  const layers = [
    ...marginLayers,
    ...(frameLayer?.d
      ? [
          {
            role: "frame",
            fill: params.frameColor || params.foreground,
            ...frameLayer,
          },
        ]
      : []),
    ...(params.backdrop === "halftone"
      ? [
          ...structuralLayers(qr, params),
          {
            role: "backdrop",
            d: lightModules(qr, params, skipEyes, pattern),
            fill: params.background,
          },
        ].filter((layer) => layer.d)
      : []),
    ...backgroundLayers,
    ...dataLayers,
    ...eyeWash,
    ...eyeLayers,
  ];

  const effect = EFFECTS[cfg.effect] ?? EFFECTS.none;

  return effect.wrap(layers, framed, qr, pattern);
}

function renderBasicStyle(qr, params) {
  return renderStyled(qr, {
    pattern: params.dataType ?? "square",
    effect: "none",
    marginStyle: "plain",
    eyeFrame: params.finderType ?? "square",
    eyeIn: params.finderInnerType ?? "square",
    params: {
      ...params,
      eyeFrameColor: params.finderColor,
      eyeInColor: params.finderColor,
    },
  });
}

function renderDotsStyle(qr, params) {
  return renderStyled(qr, {
    pattern: "circle",
    effect: "none",
    marginStyle: "plain",
    eyeFrame: "extra-rounded",
    eyeIn: "circle",
    params: { ...params, dataScale: params.dotScale },
  });
}

function renderCamoStyle(qr, params) {
  return renderStyled(qr, {
    pattern: "blob",
    effect: "none",
    marginStyle: "scatter",
    eyeFrame: "default",
    eyeIn: "default",
    params: { ...params, clearance: params.quietZone ?? 1, density: 0.5 },
  });
}

const STYLES = {
  basic: { label: "Basic", render: renderBasicStyle },
  dots: { label: "Dots", render: renderDotsStyle },
  camo: { label: "Camo", render: renderCamoStyle },
};

/**
 * Render a styled SVG string from a WasmQrCode-like object.
 * @param {object} qrLike   - { get_size(), get_module(x,y) } after generate()
 * @param {string} styleName - key of STYLES
 * @param {object} params - fully resolved style params
 * @returns {string} SVG markup
 */
function renderStyledSVG(qrLike, styleName, params, reserve = null) {
  const style = STYLES[styleName] || STYLES[DEFAULT_STYLE];
  return style.render(buildStyledMatrix(qrLike, reserve), params);
}

/**
 * Parse the `qrcode_style_config` value
 */
function knownEye(key, generated, imported) {
  return key in generated || key in imported ? key : "default";
}

function parseStyleConfig(raw) {
  let cfg;
  try {
    cfg = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    cfg = null;
  }

  const params =
    cfg?.params && typeof cfg.params === "object" ? cfg.params : {};
  const pattern = PATTERNS[cfg?.pattern];

  if (!pattern || pattern.usable === false) {
    return {
      style: STYLES[cfg?.style] ? cfg.style : DEFAULT_STYLE,
      params,
    };
  }

  return {
    style: null,
    pattern: cfg.pattern,
    effect: EFFECTS[cfg.effect] ? cfg.effect : "none",
    marginStyle: MARGINS[cfg.marginStyle] ? cfg.marginStyle : "plain",
    eyeFrame: knownEye(cfg.eyeFrame, EYE_FRAMES, EYE_ART.frame),
    eyeIn: knownEye(cfg.eyeIn, EYE_INS, EYE_ART.in),
    frame: cfg.frame in FRAMES ? cfg.frame : "none",
    params,
  };
}

export { parseStyleConfig, renderStyled, renderStyledSVG };
