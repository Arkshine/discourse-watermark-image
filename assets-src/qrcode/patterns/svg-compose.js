/* eslint-disable no-bitwise */ // QR module flags are bit fields

import { transformScale } from "../effects.js";
import { Module, unlitMatrix } from "../matrix.js";
import { formatNum, moduleNoise, resolvePaint } from "../shapes.js";

function stampModulesByColour(qr, params, skipEyes, stamp, count) {
  const rowLen = qr.size;
  const scale = params.dataScale ?? 1;
  const offset = (1 - scale) / 2;
  const buckets = Array.from({ length: count }, () => "");

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      const module = qr.matrix[y * rowLen + x];

      if (!(module & Module.ON)) {
        continue;
      }

      if (skipEyes && module & Module.FINDER) {
        continue;
      }

      const pick = Math.min(count - 1, Math.floor(moduleNoise(x, y) * count));
      buckets[pick] += stamp(x + offset, y + offset, scale);
    }
  }

  return buckets;
}

function stampModules(qr, params, skipEyes, stamp) {
  const rowLen = qr.size;
  const scale = params.dataScale ?? 1;
  const offset = (1 - scale) / 2;
  let d = "";

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      const module = qr.matrix[y * rowLen + x];

      if (!(module & Module.ON)) {
        continue;
      }
      if (skipEyes && module & Module.FINDER) {
        continue;
      }

      d += stamp(x + offset, y + offset, scale);
    }
  }

  return d;
}

function neighborsAt(qr, skipEyes, x, y) {
  const rowLen = qr.size;
  const lit = (nx, ny) => {
    if (nx < 0 || ny < 0 || nx >= rowLen || ny >= rowLen) {
      return false;
    }

    const module = qr.matrix[ny * rowLen + nx];

    if (!(module & Module.ON)) {
      return false;
    }

    return !(skipEyes && module & Module.FINDER);
  };

  return {
    up: lit(x, y - 1),
    right: lit(x + 1, y),
    down: lit(x, y + 1),
    left: lit(x - 1, y),
  };
}

function stampModulesLinked(qr, params, skipEyes, stamp) {
  const rowLen = qr.size;
  const scale = params.dataScale ?? 1;
  const offset = (1 - scale) / 2;
  let d = "";

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      const module = qr.matrix[y * rowLen + x];

      if (!(module & Module.ON)) {
        continue;
      }
      if (skipEyes && module & Module.FINDER) {
        continue;
      }

      d += stamp(
        x + offset,
        y + offset,
        scale,
        neighborsAt(qr, skipEyes, x, y)
      );
    }
  }

  return d;
}

function lightModulesLinked(qr, params, skipEyes, stamp) {
  return stampModulesLinked(unlitMatrix(qr), params, skipEyes, stamp);
}

function composeSvg(layers, params, qr, opts = {}) {
  const pad = params.framePad ?? 0;
  const margin = params.margin + pad;
  const size = qr.size + 2 * margin;
  const defs = [...(opts.defs ?? [])];

  const painted = layers.map((layer, index) => {
    if (layer.clip) {
      defs.push(
        `<clipPath id="qsClip${index}"><path d="${layer.clip}"/></clipPath>`
      );
    }

    const masked =
      (layer.role === "data" ||
        layer.role === "margin" ||
        layer.role === "eye-frame" ||
        layer.role === "eye-in" ||
        layer.role === "wash" ||
        layer.role === "light") &&
      (layer.markup || layer.d) &&
      layer.fill &&
      typeof layer.fill === "object";
    let maskId = null;

    if (masked) {
      maskId = `qsMask${index}`;
      const stencil = layer.markup
        ? `<g fill="#fff"${layer.stroked ? ' stroke="#fff"' : ""}>${layer.markup}</g>`
        : `<path fill="#fff" d="${layer.d}"/>`;
      defs.push(`<mask id="${maskId}">${stencil}</mask>`);
    }

    return {
      ...layer,
      paint: resolvePaint(layer.fill, defs),
      clipId: layer.clip ? `qsClip${index}` : null,
      maskId,
    };
  });
  const bgPaint = resolvePaint(params.background, defs);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margin} ${-margin} ${size} ${size}">`;

  if (defs.length) {
    svg += `<defs>${defs.join("")}</defs>`;
  }

  if (!params.logoBackground && (params.backdrop ?? "solid") === "solid") {
    svg += params.frameBackdrop
      ? `<path fill="${bgPaint}" d="${params.frameBackdrop}"/>`
      : `<rect x="${-margin}" y="${-margin}" width="${size}" height="${size}" fill="${bgPaint}"/>`;
  }
  svg += opts.beforeLayers ?? "";

  for (const layer of painted) {
    if (!layer.d && !layer.markup) {
      continue;
    }
    const attrs = opts.layerAttrs ? ` ${opts.layerAttrs(layer)}` : "";
    const opacityValue =
      layer.opacity ??
      (layer.role === "data" && params.dataOpacity !== undefined
        ? params.dataOpacity
        : undefined);
    const opacity =
      opacityValue !== undefined ? ` opacity="${formatNum(opacityValue)}"` : "";
    const transform = layer.transform ? ` transform="${layer.transform}"` : "";
    const clip = layer.clipId ? ` clip-path="url(#${layer.clipId})"` : "";

    const wrapClip = Boolean(layer.clipId && layer.transform);
    const clipAttr = wrapClip ? "" : clip;
    const open = wrapClip ? `<g${clip}>` : "";
    const close = wrapClip ? `</g>` : "";

    const strokePaint = layer.stroked ? ` stroke="${layer.paint}"` : "";

    if (layer.maskId) {
      const useCanvas = layer.role === "margin" && !layer.fillSize;
      const scale = layer.fillSize
        ? 1
        : transformScale(
            layer.transform ? `transform="${layer.transform}"` : ""
          );
      const boxX = (useCanvas ? -margin : 0) / scale;
      const boxSize = (layer.fillSize ?? (useCanvas ? size : qr.size)) / scale;
      svg += `${open}<rect x="${formatNum(boxX)}" y="${formatNum(boxX)}" width="${formatNum(boxSize)}" height="${formatNum(boxSize)}" fill="${layer.paint}"${attrs}${transform}${clipAttr}${opacity} mask="url(#${layer.maskId})"/>${close}`;
      continue;
    }
    svg += layer.markup
      ? `${open}<g fill="${layer.paint}"${strokePaint}${attrs}${transform}${clipAttr}${opacity}>${layer.markup}</g>${close}`
      : `${open}<path fill="${layer.paint}"${strokePaint}${attrs}${transform}${clipAttr}${opacity} d="${layer.d}"/>${close}`;
  }

  svg += opts.afterLayers ?? "";
  return svg + `</svg>`;
}

export {
  composeSvg,
  lightModulesLinked,
  stampModules,
  stampModulesByColour,
  stampModulesLinked,
};
