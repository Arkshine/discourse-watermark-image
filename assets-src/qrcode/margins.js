/* eslint-disable no-bitwise */ // QR module flags are bit fields
import { EYE_ORIGINS } from "./eyes/eye-art.js";
import { getSeededRand, Module } from "./matrix.js";
import { shapePath } from "./shapes.js";

const BACKGROUND_WASH_OPACITY = 0.1;

function resolveClearance(params) {
  return params.clearance ?? 2;
}

function noPad() {
  return 0;
}

function fillWithPattern(pattern, params, cells, span, lo, opts) {
  const { hole, clip, unlit, lit = true } = opts;
  const built = pattern.build(
    { size: span, matrix: cells },
    { ...params, margin: 0, fillHole: hole, fillUnlit: unlit, fillLit: lit },
    false
  );
  const layers = typeof built === "string" ? [{ d: built }] : built;
  const shift = `translate(${lo},${lo})`;

  return layers.map((layer) => ({
    ...layer,
    clip,
    transform: layer.transform ? `${shift} ${layer.transform}` : shift,
    fillSize: span,
  }));
}

function extendBuild(qr, params) {
  const margin = params.margin;
  if (margin === 0) {
    return "";
  }
  const size = qr.size + 2 * margin;
  let d = "";
  for (let i = -margin; i < size - margin; i++) {
    d += shapePath("square", i, -margin, 1, true);
    d += shapePath("square", i, size - margin - 1, 1, true);
    d += shapePath("square", -margin, i, 1, true);
    d += shapePath("square", size - margin - 1, i, 1, true);
  }

  return d;
}

function scatterPad(params) {
  return Math.max(0, resolveClearance(params) + 1 - params.margin);
}

function isFullyInsideFrame(params, x, y) {
  return (
    params.frameContains(x, y) &&
    params.frameContains(x + 1, y) &&
    params.frameContains(x, y + 1) &&
    params.frameContains(x + 1, y + 1)
  );
}

function isBesideEye(eyes, x, y) {
  return eyes.some(
    ([ex, ey]) => x >= ex - 1 && x <= ex + 7 && y >= ey - 1 && y <= ey + 7
  );
}

function dotScaleRatio(dotSize, dist, maxDist, rand) {
  if (dotSize === "Center") {
    return 1.2 - dist / maxDist;
  }
  if (dotSize === "Edge") {
    return 0.4 + dist / maxDist;
  }
  if (dotSize === "Random") {
    return rand() * 0.5 + 0.6;
  }
  return 1;
}

function scatterBuild(qr, params, pattern) {
  const rand = getSeededRand(params.seed);

  const edge = params.margin + (params.frameFillPad ?? 0);
  const lo = Math.ceil(-edge);
  const hi = Math.floor(qr.size + edge);
  const span = hi - lo;

  const clear = resolveClearance(params);
  const centre = qr.size / 2;
  const maxDist = Math.hypot(edge + centre, edge + centre);
  const eyes = EYE_ORIGINS(qr.size);

  const chosen = [];
  const matrix = new Uint8Array(span * span);

  for (let y = lo; y < hi; y++) {
    for (let x = lo; x < hi; x++) {
      if (
        x >= -clear &&
        x < qr.size + clear &&
        y >= -clear &&
        y < qr.size + clear
      ) {
        continue;
      }

      if (rand() > params.density) {
        continue;
      }

      if (isBesideEye(eyes, x, y)) {
        continue;
      }

      if (params.frameContains && !isFullyInsideFrame(params, x, y)) {
        continue;
      }

      const dist = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
      const ratio = dotScaleRatio(params.dotSize, dist, maxDist, rand);

      chosen.push([x, y, ratio]);
      matrix[(y - lo) * span + (x - lo)] = Module.ON;
    }
  }

  const clip = params.frameShape;
  const linked = params.logoBackground && pattern?.linkedStamp;

  if (pattern?.kind === "merge" && !linked) {
    return fillWithPattern(pattern, params, matrix, span, lo, {
      hole: { x: -lo, y: -lo, size: qr.size },
      clip,
      unlit: false,
    });
  }

  const stamp = linked
    ? pattern.linkedStamp
    : (pattern?.stamp ?? ((x, y, w) => shapePath("square", x, y, w, true)));

  if (!params.logoBackground) {
    let d = "";

    for (const [x, y, ratio] of chosen) {
      const inset = (1 - ratio) / 2;
      d += stamp(x + inset, y + inset, ratio);
    }

    return { d, clip };
  }

  const dataFill = params.dataColor || params.foreground;
  const dataScale = params.dataScale ?? 1;
  const contentKey = linked && pattern.linkedMarkup ? "markup" : "d";
  let wash = "";
  let dots = "";

  for (const [x, y, ratio] of chosen) {
    const outerInset = (1 - ratio) / 2;
    wash += stamp(x + outerInset, y + outerInset, ratio, {});

    const inner = ratio * dataScale;
    const innerInset = (1 - inner) / 2;
    dots += stamp(x + innerInset, y + innerInset, inner, {});
  }

  return [
    {
      role: "wash",
      [contentKey]: wash,
      fill: dataFill,
      opacity: BACKGROUND_WASH_OPACITY,
      clip,
    },
    { [contentKey]: dots, fill: dataFill, clip },
  ];
}

function floodBuild(qr, params, pattern) {
  if (pattern?.kind !== "merge") {
    return "";
  }

  const edge = params.margin + (params.frameFillPad ?? 0);
  const lo = Math.ceil(-edge);
  const hi = Math.floor(qr.size + edge);
  const span = hi - lo;

  if (span <= qr.size) {
    return "";
  }

  const cells = new Uint8Array(span * span);

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      cells[(y - lo) * span + (x - lo)] = qr.matrix[y * qr.size + x];
    }
  }

  return fillWithPattern(pattern, params, cells, span, lo, {
    clip: params.frameShape,
    unlit: true,
    lit: false,
  });
}

function mosaicPad(params) {
  return Math.max(0, (params.outerSquare ?? 0) + 1 - (params.margin ?? 0));
}

function mosaicRing(x, y, at, end) {
  return (
    at > 0 &&
    ((y === -at && x >= -at && x <= end + at) ||
      ((x === -at || x === end + at) && y >= 1 - at && y <= end + at - 1) ||
      (y === end + at && x >= -at && x <= end + at))
  );
}

function mosaicCheckerFallback(x, y, lo, span) {
  const px = x - lo;
  const py = y - lo;
  const line = px % 4 === 0 || px === span - 1;
  const down = py % 4 === 0 || py === span - 1;

  return line || down
    ? true
    : (px % 8 < 4 && py % 8 < 4) || (px % 8 > 4 && py % 8 > 4);
}

function mosaicBuild(qr, params, pattern) {
  const edge = params.margin + (params.frameFillPad ?? 0);
  const lo = Math.ceil(-edge);
  const hi = Math.floor(qr.size + edge);
  const span = hi - lo;

  const inner = params.innerSquare ?? 0;
  const outer = params.outerSquare ?? 0;
  const end = qr.size - 1;

  const cells = new Uint8Array(span * span);

  for (let y = lo; y < hi; y++) {
    for (let x = lo; x < hi; x++) {
      if (
        x >= -inner &&
        x < qr.size + inner &&
        y >= -inner &&
        y < qr.size + inner &&
        !mosaicRing(x, y, inner, end)
      ) {
        continue;
      }

      let on = mosaicRing(x, y, outer, end) || mosaicRing(x, y, inner, end);

      if (
        !on &&
        x > -outer &&
        x < end + outer &&
        y > -outer &&
        y < end + outer
      ) {
        on = ((x + y) & 1) !== 0;
      } else if (!on) {
        on = mosaicCheckerFallback(x, y, lo, span);
      }

      if (on) {
        cells[(y - lo) * span + (x - lo)] = Module.ON;
      }
    }
  }

  const clip = params.frameShape;

  if (pattern?.kind !== "merge") {
    const stamp =
      pattern?.stamp ?? ((x, y, w) => shapePath("square", x, y, w, true));
    let d = "";

    for (let i = 0; i < cells.length; i++) {
      if (cells[i]) {
        d += stamp(lo + (i % span), lo + Math.floor(i / span), 1);
      }
    }

    return { d, clip };
  }

  return fillWithPattern(pattern, params, cells, span, lo, {
    hole: { x: -lo, y: -lo, size: qr.size },
    clip,
    unlit: true,
  });
}

const MARGINS = {
  plain: { label: "Plain", pad: noPad, build: () => "" },
  extend: { label: "Extend pattern", pad: noPad, build: extendBuild },
  scatter: { label: "Scatter", pad: scatterPad, build: scatterBuild },
  flood: { label: "Flood", pad: noPad, build: floodBuild },
  mosaic: { label: "Mosaic", pad: mosaicPad, build: mosaicBuild },
};

export { BACKGROUND_WASH_OPACITY, MARGINS };
