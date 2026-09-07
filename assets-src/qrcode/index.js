// ---------------------------------------------------------------------------
// Code modified and adapted from "qrframe" and "QRBTF" (MIT)
// ---------------------------------------------------------------------------

import { EFFECTS, sketchArtwork } from "./effects.js";
import { EYE_ART } from "./eyes/eye-art.js";
import { applyFrameLabel } from "./frames/frame-label.js";
import { frameClipPath, FRAMES } from "./frames/frame-shapes.js";
import { applyLogo, parseLogoConfig } from "./logo.js";
import { MARGINS } from "./margins.js";
import { buildStyledMatrix, Module, reserveRange } from "./matrix.js";
import { PATTERNS } from "./patterns/pattern-registry.js";
import { runPaths } from "./patterns/run-stamps.js";
import { EYE_FRAMES, EYE_INS } from "./patterns/small-patterns.js";
import { halftoneBackdrop } from "./render/postprocess.js";
import {
  parseStyleConfig,
  renderStyled,
  renderStyledSVG,
} from "./render-styles.js";
import { scalePath } from "./shapes.js";

globalThis.lastQrModules = 0;

const PREFERRED_PIXELS_PER_MODULE = 4;
const HARD_MIN_PIXELS_PER_MODULE = 2;
const LOGO_EC_BUDGET = [0.07, 0.15, 0.25, 0.3];

function fitToBudget(budget, modules, margin, slack = 0) {
  const total = modules + 2 * margin;

  globalThis.lastQrModules = total;

  const natural = Math.floor(budget / total);

  if (natural >= PREFERRED_PIXELS_PER_MODULE) {
    return total * natural;
  }

  for (
    let perModule = PREFERRED_PIXELS_PER_MODULE;
    perModule > HARD_MIN_PIXELS_PER_MODULE;
    perModule--
  ) {
    if (total * perModule <= budget + slack) {
      return total * perModule;
    }
  }

  return total * HARD_MIN_PIXELS_PER_MODULE;
}

function resolveErrorCorrection(level, logoCfg) {
  if (!logoCfg.enabled || logoCfg.background || logoCfg.showDataBehind) {
    return level;
  }

  const coverage = (logoCfg.size / 100) ** 2;
  let bumped = level;

  while (
    bumped < LOGO_EC_BUDGET.length - 1 &&
    coverage > LOGO_EC_BUDGET[bumped] / 2
  ) {
    bumped++;
  }

  return bumped;
}

async function renderQrCode(settings, size) {
  const logoCfg = parseLogoConfig(settings.qrcode_logo_config);

  // eslint-disable-next-line no-undef
  const qr = new QrCodeGen.WasmQrCode();
  qr.generate(
    settings.qrcode_text,
    resolveErrorCorrection(settings.qrcode_error_correction, logoCfg),
    1 /* minimum version */,
    40 /* maximum version */,
    null /* automatic mask */,
    true /* boost error level correction */
  );

  const cfg = parseStyleConfig(settings.qrcode_style_config);
  cfg.params = {
    ...cfg.params,
    logoBackground: logoCfg.enabled && logoCfg.background,
  };
  const params = cfg.params;

  const background = params.background ?? "#ffffff";
  const foreground = params.foreground ?? "#000000";
  const logoReserve =
    logoCfg.enabled && !logoCfg.background && !logoCfg.showDataBehind
      ? reserveRange(qr.get_size(), logoCfg.size)
      : null;

  const svg = cfg.style
    ? renderStyledSVG(qr, cfg.style, params, logoReserve)
    : renderStyled(buildStyledMatrix(qr, logoReserve), cfg);

  const canvasSize =
    Number(svg.match(/viewBox="\S+ \S+ (\S+) \S+"/)?.[1]) ||
    qr.get_size() + 2 * params.margin;
  const qrInsetRatio = qr.get_size() / canvasSize;
  const frameMargin = (canvasSize - qr.get_size()) / 2;

  // eslint-disable-next-line no-undef
  let png = QrCodeGen.WasmQrCode.svg_to_png(
    svg,
    fitToBudget(size, qr.get_size(), params.margin, settings.qrcode_size_slack)
  );

  const clipPath = frameClipPath(cfg, params, qr.get_size());

  if (params.backdrop === "halftone") {
    png = await halftoneBackdrop(
      png,
      params,
      settings.qrcode_halftone_image_url,
      clipPath,
      canvasSize,
      frameMargin
    );
  }

  const withLogo = await applyLogo(png, settings, {
    background,
    foreground,
    qrInsetRatio,
    qrSize: qr.get_size(),
    clipPath,
    canvasSize,
    margin: frameMargin,
  });

  return applyFrameLabel(withLogo, settings, params, cfg.frame);
}

Object.assign(globalThis, {
  Module,
  PATTERNS,
  MARGINS,
  FRAMES,
  EFFECTS,
  EYE_FRAMES,
  EYE_INS,
  EYE_ART,

  renderQrCode,
  renderStyled,

  parseStyleConfig,
  runPaths,
  scalePath,
  sketchArtwork,
});
