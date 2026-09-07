import { getSeededRand } from "./matrix.js";

function formatNum(n) {
  return n.toFixed(2).replace(/\.00$/, "");
}

const PATH_ARGS = {
  m: 2,
  l: 2,
  t: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  a: 7,
  z: 0,
};

const SHAPES = {
  square: (x, y, w, cw) => roundedRect(x, y, w, 0, cw),
  rounded: (x, y, w, cw) => roundedRect(x, y, w, w * 0.25, cw),
  "extra-rounded": (x, y, w, cw) => roundedRect(x, y, w, w * 0.4, cw),
  circle: (x, y, w, cw) => roundedRect(x, y, w, w / 2, cw),
  diamond: (x, y, w, cw) => squircle(x, y, w, 0, cw),
  "diamond-round": (x, y, w, cw) => squircle(x, y, w, (w / 2) * 0.35, cw),
};

const POLYGON_STAMPS = {
  star: [
    [0.5, 0],
    [0.7, 0.3],
    [1, 0.4],
    [0.8, 0.65],
    [0.8, 1],
    [0.5, 0.85],
    [0.2, 1],
    [0.2, 0.65],
    [0, 0.4],
    [0.3, 0.3],
  ],
  danger: [
    [0, 0],
    [0.4, 0],
    [0.5, 0.1],
    [0.6, 0],
    [1, 0],
    [1, 0.4],
    [0.9, 0.5],
    [1, 0.6],
    [1, 1],
    [0.6, 1],
    [0.5, 0.9],
    [0.4, 1],
    [0, 1],
    [0, 0.6],
    [0.1, 0.5],
    [0, 0.4],
  ],
  cross: [
    [0.3, 0],
    [0.7, 0],
    [0.7, 0.3],
    [1, 0.3],
    [1, 0.7],
    [0.7, 0.7],
    [0.7, 1],
    [0.3, 1],
    [0.3, 0.7],
    [0, 0.7],
    [0, 0.3],
    [0.3, 0.3],
  ],
};

POLYGON_STAMPS.x = POLYGON_STAMPS.cross.map(([px, py]) => [
  0.5 + (px - py) / 2,
  0.5 + (px + py - 1) / 2,
]);

function sparkleStamp(x, y, w) {
  const half = w / 2;
  const waist = w * 0.16;
  const cx = x + half;
  const cy = y + half;

  return (
    `M${formatNum(cx)},${formatNum(y)}` +
    `Q${formatNum(cx + waist)},${formatNum(cy - waist)} ${formatNum(x + w)},${formatNum(cy)}` +
    `Q${formatNum(cx + waist)},${formatNum(cy + waist)} ${formatNum(cx)},${formatNum(y + w)}` +
    `Q${formatNum(cx - waist)},${formatNum(cy + waist)} ${formatNum(x)},${formatNum(cy)}` +
    `Q${formatNum(cx - waist)},${formatNum(cy - waist)} ${formatNum(cx)},${formatNum(y)}z`
  );
}

function plusStamp(x, y, w) {
  const a = w * 0.3;
  const b = w * 0.7;
  const r = w * 0.14;
  const at = (px, py) => `${formatNum(x + px)},${formatNum(y + py)}`;

  return (
    `M${at(a, r)}Q${at(a, 0)} ${at(a + r, 0)}` +
    `H${formatNum(x + b - r)}Q${at(b, 0)} ${at(b, r)}` +
    `V${formatNum(y + a)}H${formatNum(x + w - r)}` +
    `Q${at(w, a)} ${at(w, a + r)}` +
    `V${formatNum(y + b - r)}Q${at(w, b)} ${at(w - r, b)}` +
    `H${formatNum(x + b)}V${formatNum(y + w - r)}` +
    `Q${at(b, w)} ${at(b - r, w)}` +
    `H${formatNum(x + a + r)}Q${at(a, w)} ${at(a, w - r)}` +
    `V${formatNum(y + b)}H${formatNum(x + r)}` +
    `Q${at(0, b)} ${at(0, b - r)}` +
    `V${formatNum(y + a + r)}Q${at(0, a)} ${at(r, a)}` +
    `H${formatNum(x + a)}z`
  );
}

function shakeStamp(x, y, w) {
  const angle = (moduleNoise(x, y) * 2 - 1) * (20 * (Math.PI / 180));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const off = w / 12;
  const side = (w * 5) / 6;
  const corners = [
    [off, off],
    [off + side, off],
    [off + side, off + side],
    [off, off + side],
  ];

  return (
    "M" +
    corners
      .map(
        ([px, py]) =>
          `${formatNum(x + px * cos - py * sin)},${formatNum(y + px * sin + py * cos)}`
      )
      .join("L") +
    "z"
  );
}

function heartStamp(x, y, w) {
  const at = (px, py) => `${formatNum(x + px * w)},${formatNum(y + py * w)}`;

  return (
    `M${at(0.5, 1)}` +
    `C${at(0.1, 0.7)} ${at(0, 0.45)} ${at(0, 0.3)}` +
    `C${at(0, 0.08)} ${at(0.35, 0.02)} ${at(0.5, 0.22)}` +
    `C${at(0.65, 0.02)} ${at(1, 0.08)} ${at(1, 0.3)}` +
    `C${at(1, 0.45)} ${at(0.9, 0.7)} ${at(0.5, 1)}z`
  );
}

const CURVE_STAMPS = {
  sparkle: sparkleStamp,
  plus: plusStamp,
  "circle-small": (x, y, w) => circlePath(x + w / 2, y + w / 2, w * 0.35),
  shake: shakeStamp,
  "circle-mixed": (x, y, w) =>
    circlePath(x + w / 2, y + w / 2, moduleNoise(x, y) < 0.75 ? w / 3 : w / 2),
  heart: heartStamp,
};

function roundedRect(x, y, width, radius, cw) {
  if (radius === 0) {
    return cw
      ? `M${formatNum(x)},${formatNum(y)}h${width}v${width}h-${width}z`
      : `M${formatNum(x)},${formatNum(y)}v${width}h${width}v-${width}z`;
  }
  if (radius === width / 2) {
    const r = formatNum(radius);
    const cwFlag = cw ? "1" : "0";
    return `M${formatNum(x + radius)},${formatNum(y)}a${r},${r} 0,0,${cwFlag} 0,${width}a${r},${r} 0,0,${cwFlag} 0,-${width}`;
  }
  const r = formatNum(radius);
  const side = formatNum(width - 2 * radius);
  return cw
    ? `M${formatNum(x + radius)},${formatNum(y)}h${side}a${r},${r} 0,0,1 ${r},${r}v${side}a${r},${r} 0,0,1 -${r},${r}h-${side}a${r},${r} 0,0,1 -${r},-${r}v-${side}a${r},${r} 0,0,1 ${r},-${r}`
    : `M${formatNum(x + radius)},${formatNum(y)}a${r},${r} 0,0,0 -${r},${r}v${side}a${r},${r} 0,0,0 ${r},${r}h${side}a${r},${r} 0,0,0 ${r},-${r}v-${side}a${r},${r} 0,0,0 -${r},-${r}`;
}

function squircle(x, y, width, handle, cw) {
  const half = formatNum(width / 2);
  if (handle === 0) {
    return cw
      ? `M${formatNum(x + width / 2)},${formatNum(y)}l${half},${half}l-${half},${half}l-${half},-${half}z`
      : `M${formatNum(x + width / 2)},${formatNum(y)}l-${half},${half}l${half},${half}l${half},-${half}z`;
  }
  const h = formatNum(handle);
  const hInv1 = formatNum(width / 2 - handle);
  const hInv2 = formatNum(-(width / 2 - handle));
  return cw
    ? `M${formatNum(x + width / 2)},${formatNum(y)}c${h},0 ${half},${hInv1} ${half},${half}s${hInv2},${half} -${half},${half}s-${half},${hInv2} -${half},-${half}s${hInv1},-${half} ${half},-${half}`
    : `M${formatNum(x + width / 2)},${formatNum(y)}c-${h},0 -${half},${hInv1} -${half},${half}s${hInv1},${half} ${half},${half}s${half},${hInv2} ${half},-${half}s${hInv2},-${half} -${half},-${half}`;
}

function resolvePaint(value, defs) {
  if (!value || typeof value === "string") {
    return value;
  }

  const stops = value.stops ?? [];
  const id = `qsg${defs.length}`;

  const marks = stops
    .map(
      (color, i) =>
        `<stop offset="${formatNum(i / Math.max(1, stops.length - 1))}" stop-color="${color}"/>`
    )
    .join("");

  if (value.type === "radial") {
    defs.push(`<radialGradient id="${id}">${marks}</radialGradient>`);
  } else {
    const a = ((value.angle ?? 0) * Math.PI) / 180;
    defs.push(
      `<linearGradient id="${id}" x1="${formatNum(0.5 - Math.cos(a) / 2)}" y1="${formatNum(0.5 - Math.sin(a) / 2)}" x2="${formatNum(0.5 + Math.cos(a) / 2)}" y2="${formatNum(0.5 + Math.sin(a) / 2)}">${marks}</linearGradient>`
    );
  }

  return `url(#${id})`;
}

function scalePath(d, k) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let out = "";
  let command = "";
  let arg = 0;

  for (const token of tokens) {
    if (/^[a-z]$/i.test(token)) {
      command = token;
      arg = 0;
      out += token;
      continue;
    }

    const count = PATH_ARGS[command.toLowerCase()] ?? 2;
    const index = count ? arg % count : 0;
    const literal =
      command.toLowerCase() === "a" &&
      (index === 2 || index === 3 || index === 4);
    const value = literal ? token : formatNum(Number(token) * k);

    out += `${arg > 0 && !String(value).startsWith("-") ? "," : ""}${value}`;
    arg++;
  }

  return out;
}

function circlePath(cx, cy, radius) {
  const r = formatNum(radius);

  return (
    `M${formatNum(cx - r)},${formatNum(cy)}` +
    `a${r},${r} 0 1,0 ${formatNum(2 * r)},0` +
    `a${r},${r} 0 1,0 ${formatNum(-2 * r)},0z`
  );
}

function moduleNoise(x, y) {
  return getSeededRand(Math.round(x) * 73856093 + Math.round(y) * 19349663)();
}

function polygonStamp(points, x, y, w) {
  return (
    "M" +
    points
      .map(([px, py]) => `${formatNum(x + px * w)},${formatNum(y + py * w)}`)
      .join("L") +
    "z"
  );
}

function shapePath(kind, x, y, width, cw) {
  return (SHAPES[kind] ?? SHAPES.square)(x, y, width, cw);
}

export {
  CURVE_STAMPS,
  POLYGON_STAMPS,
  SHAPES,
  circlePath,
  formatNum,
  moduleNoise,
  polygonStamp,
  resolvePaint,
  scalePath,
  shapePath,
};
