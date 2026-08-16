/* eslint-disable no-undef */
/* eslint-disable no-bitwise */ // QR module flags are bit fields

// eslint-disable-next-line no-unused-vars
let lastQrModules = 0;

const PREFERRED_PIXELS_PER_MODULE = 4;
const HARD_MIN_PIXELS_PER_MODULE = 2;

function fitToBudget(budget, modules, margin, slack = 0) {
  const total = modules + 2 * margin;

  lastQrModules = total;

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

const LOGO_EC_BUDGET = [0.07, 0.15, 0.25, 0.3];

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

// eslint-disable-next-line no-unused-vars
async function renderQrCode(settings, size) {
  const logoCfg = parseLogoConfig(settings.qrcode_logo_config);

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

  return applyLogo(png, settings, {
    background,
    foreground,
    qrInsetRatio,
    qrSize: qr.get_size(),
    clipPath,
    canvasSize,
    margin: frameMargin,
  });
}

const LOGO_DEFAULTS = {
  enabled: false,
  source: "icon",
  size: 20,
  padding: 0,
  background: false,
  transparentBackground: true,
  showDataBehind: false,
};

function parseLogoConfig(raw) {
  if (!raw) {
    return { ...LOGO_DEFAULTS };
  }

  try {
    return { ...LOGO_DEFAULTS, ...(JSON.parse(raw) ?? {}) };
  } catch {
    return { ...LOGO_DEFAULTS };
  }
}

function iconToSVG(icon, color, size) {
  const [minX, minY, width, height] = (icon.viewBox || "0 0 512 512")
    .split(/[\s,]+/)
    .map(Number);
  const side = Math.max(width, height);
  const x = minX - (side - width) / 2;
  const y = minY - (side - height) / 2;

  const defs = [];
  const fill = paint(color, defs);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}" ` +
    `width="${size}" height="${size}">` +
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    `<g fill="${fill}">${icon.content}</g></svg>`
  );
}

async function loadLogoBitmap(cfg, settings, size, foreground) {
  if (cfg.source === "icon") {
    const icon = settings.qrcode_logo_icon;
    if (!icon?.content) {
      return null;
    }

    const bytes = QrCodeGen.WasmQrCode.svg_to_png(
      iconToSVG(icon, cfg.color || foreground, size),
      size
    );

    return createImageBitmap(new Blob([bytes], { type: "image/png" }));
  }

  if (!settings.qrcode_logo_image_url) {
    return null;
  }

  const response = await fetch(settings.qrcode_logo_image_url);
  if (!response.ok) {
    throw new Error(`Watermark logo image failed to load (${response.status})`);
  }

  return createImageBitmap(await response.blob());
}

async function applyLogo(
  png,
  settings,
  { background, foreground, qrInsetRatio, qrSize, clipPath, canvasSize, margin }
) {
  const cfg = parseLogoConfig(settings.qrcode_logo_config);
  if (!cfg.enabled) {
    return png;
  }

  const qrBitmap = await createImageBitmap(
    new Blob([png], { type: "image/png" })
  );
  const isBackground = cfg.background;
  const modulePx = (qrBitmap.width * qrInsetRatio) / qrSize;
  const reserve = isBackground ? null : reserveRange(qrSize, cfg.size);
  const box = isBackground
    ? qrBitmap.width
    : Math.round((reserve.x1 - reserve.x0) * modulePx);
  const logo = await loadLogoBitmap(cfg, settings, box, foreground);

  if (!logo) {
    return png;
  }

  const canvas = new OffscreenCanvas(qrBitmap.width, qrBitmap.height);
  const ctx = canvas.getContext("2d");

  if (isBackground) {
    clipToFrame(ctx, qrBitmap.width, clipPath, canvasSize, margin);

    const fitBox = Math.round(box * qrInsetRatio);
    const scale = Math.min(fitBox / logo.width, fitBox / logo.height);
    const width = Math.round(logo.width * scale);
    const height = Math.round(logo.height * scale);
    const x = Math.round((qrBitmap.width - width) / 2);
    const y = Math.round((qrBitmap.height - height) / 2);

    if (!cfg.transparentBackground) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, qrBitmap.width, qrBitmap.height);
    }

    ctx.drawImage(logo, x, y, width, height);
    ctx.drawImage(qrBitmap, 0, 0);
  } else {
    const pad = cfg.showDataBehind
      ? 0
      : Math.round((box * (cfg.padding ?? 0)) / 100);
    const innerBox = box - pad * 2;
    const scale = Math.min(innerBox / logo.width, innerBox / logo.height);
    const width = Math.round(logo.width * scale);
    const height = Math.round(logo.height * scale);
    const gridOriginX = Math.round((qrBitmap.width - qrSize * modulePx) / 2);
    const gridOriginY = Math.round((qrBitmap.height - qrSize * modulePx) / 2);
    const boxX = Math.round(gridOriginX + reserve.x0 * modulePx);
    const boxY = Math.round(gridOriginY + reserve.y0 * modulePx);
    const x = Math.round(boxX + (box - width) / 2);
    const y = Math.round(boxY + (box - height) / 2);

    ctx.drawImage(qrBitmap, 0, 0);
    ctx.drawImage(logo, x, y, width, height);
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });

  return new Uint8Array(await blob.arrayBuffer());
}

// Framework-free styled SVG renderers for QR codes, adapted from zhengkyl/qrframe presets
// and qr-code-styling (MIT licensed).

// ---------------------------------------------------------------------------
// Module flags (qrframe-compatible)
// ---------------------------------------------------------------------------

const Module = Object.freeze({
  ON: 1 << 0,
  DATA: 1 << 1,
  FINDER: 1 << 2,
  ALIGNMENT: 1 << 3,
  MODIFIER: 1 << 7,
  TIMING: 1 << 4,
  FORMAT: 1 << 5,
  VERSION: 1 << 6,
  LOGO: 1 << 8,
});

function getSeededRand(a) {
  return function () {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Adapter: WasmQrCode-like -> qrframe-like { version, matrix }
// ---------------------------------------------------------------------------

function alignmentPositions(version, size) {
  if (version === 1) {
    return [];
  }
  const numAlign = Math.floor(version / 7) + 2;
  const step =
    Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [];
  for (let i = 0; i < numAlign - 1; i++) {
    result.push(size - 7 - i * step);
  }
  result.push(6);
  result.reverse();
  return result;
}

function buildStyledMatrix(qrLike, reserve = null) {
  const size =
    typeof qrLike.get_size === "function" ? qrLike.get_size() : qrLike.size;
  const getModule =
    typeof qrLike.get_module === "function"
      ? (x, y) => qrLike.get_module(x, y)
      : (x, y) => qrLike.getModule(x, y);

  const version = (size - 17) / 4;
  const matrix = new Uint16Array(size * size);
  const flag = (x, y, f) => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      matrix[y * size + x] |= f;
    }
  };

  for (const [fx, fy] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        flag(fx + dx, fy + dy, Module.FINDER);
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    flag(6, i, Module.TIMING);
    flag(i, 6, Module.TIMING);
  }

  const pos = alignmentPositions(version, size);
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      // Skip pairs that fall in the finder corners.
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === pos.length - 1) ||
        (i === pos.length - 1 && j === 0)
      ) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          flag(pos[i] + dx, pos[j] + dy, Module.ALIGNMENT);
        }
      }
      flag(pos[i], pos[j], Module.MODIFIER);
    }
  }

  for (let i = 0; i <= 8; i++) {
    if (matrix[8 * size + i] === 0) {
      flag(i, 8, Module.FORMAT);
    }
    if (matrix[i * size + 8] === 0) {
      flag(8, i, Module.FORMAT);
    }
  }
  for (let i = 0; i < 8; i++) {
    flag(size - 1 - i, 8, Module.FORMAT);
    flag(8, size - 8 + i, Module.FORMAT);
  }

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      flag(size - 11 + (i % 3), Math.floor(i / 3), Module.VERSION);
      flag(Math.floor(i / 3), size - 11 + (i % 3), Module.VERSION);
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (matrix[i] === 0) {
        matrix[i] |= Module.DATA;
      }
      if (getModule(x, y)) {
        matrix[i] |= Module.ON;
      }
    }
  }

  if (reserve) {
    for (let y = reserve.y0; y < reserve.y1; y++) {
      for (let x = reserve.x0; x < reserve.x1; x++) {
        const i = y * size + x;
        matrix[i] = (matrix[i] & ~Module.ON) | Module.LOGO;
      }
    }
  }

  return { version, size, matrix };
}

function reserveRange(qrSize, sizePercent) {
  let boxModules = Math.max(1, Math.round((qrSize * sizePercent) / 100));

  if ((qrSize - boxModules) % 2 !== 0) {
    boxModules += 1;
  }

  const offset = (qrSize - boxModules) / 2;

  return {
    x0: offset,
    y0: offset,
    x1: offset + boxModules,
    y1: offset + boxModules,
  };
}

// ---------------------------------------------------------------------------
// Shared SVG path helpers (from qrframe Basic preset, MIT)
// ---------------------------------------------------------------------------

const fmt = (n) => n.toFixed(2).replace(/\.00$/, "");

function roundedRect(x, y, width, radius, cw) {
  if (radius === 0) {
    return cw
      ? `M${fmt(x)},${fmt(y)}h${width}v${width}h-${width}z`
      : `M${fmt(x)},${fmt(y)}v${width}h${width}v-${width}z`;
  }
  if (radius === width / 2) {
    const r = fmt(radius);
    const cwFlag = cw ? "1" : "0";
    return `M${fmt(x + radius)},${fmt(y)}a${r},${r} 0,0,${cwFlag} 0,${width}a${r},${r} 0,0,${cwFlag} 0,-${width}`;
  }
  const r = fmt(radius);
  const side = fmt(width - 2 * radius);
  return cw
    ? `M${fmt(x + radius)},${fmt(y)}h${side}a${r},${r} 0,0,1 ${r},${r}v${side}a${r},${r} 0,0,1 -${r},${r}h-${side}a${r},${r} 0,0,1 -${r},-${r}v-${side}a${r},${r} 0,0,1 ${r},-${r}`
    : `M${fmt(x + radius)},${fmt(y)}a${r},${r} 0,0,0 -${r},${r}v${side}a${r},${r} 0,0,0 ${r},${r}h${side}a${r},${r} 0,0,0 ${r},-${r}v-${side}a${r},${r} 0,0,0 -${r},-${r}`;
}

function squircle(x, y, width, handle, cw) {
  const half = fmt(width / 2);
  if (handle === 0) {
    return cw
      ? `M${fmt(x + width / 2)},${fmt(y)}l${half},${half}l-${half},${half}l-${half},-${half}z`
      : `M${fmt(x + width / 2)},${fmt(y)}l-${half},${half}l${half},${half}l${half},-${half}z`;
  }
  const h = fmt(handle);
  const hInv1 = fmt(width / 2 - handle);
  const hInv2 = fmt(-(width / 2 - handle));
  return cw
    ? `M${fmt(x + width / 2)},${fmt(y)}c${h},0 ${half},${hInv1} ${half},${half}s${hInv2},${half} -${half},${half}s-${half},${hInv2} -${half},-${half}s${hInv1},-${half} ${half},-${half}`
    : `M${fmt(x + width / 2)},${fmt(y)}c-${h},0 -${half},${hInv1} -${half},${half}s${hInv1},${half} ${half},${half}s${half},${hInv2} ${half},-${half}s${hInv2},-${half} -${half},-${half}`;
}

function paint(value, defs) {
  if (!value || typeof value === "string") {
    return value;
  }

  const stops = value.stops ?? [];
  const id = `qsg${defs.length}`;

  const marks = stops
    .map(
      (color, i) =>
        `<stop offset="${fmt(i / Math.max(1, stops.length - 1))}" stop-color="${color}"/>`
    )
    .join("");

  if (value.type === "radial") {
    defs.push(`<radialGradient id="${id}">${marks}</radialGradient>`);
  } else {
    const a = ((value.angle ?? 0) * Math.PI) / 180;
    defs.push(
      `<linearGradient id="${id}" x1="${fmt(0.5 - Math.cos(a) / 2)}" y1="${fmt(0.5 - Math.sin(a) / 2)}" x2="${fmt(0.5 + Math.cos(a) / 2)}" y2="${fmt(0.5 + Math.sin(a) / 2)}">${marks}</linearGradient>`
    );
  }

  return `url(#${id})`;
}

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
    const value = literal ? token : fmt(Number(token) * k);

    out += `${arg > 0 && !String(value).startsWith("-") ? "," : ""}${value}`;
    arg++;
  }

  return out;
}

function circlePath(cx, cy, radius) {
  const r = fmt(radius);

  return (
    `M${fmt(cx - r)},${fmt(cy)}` +
    `a${r},${r} 0 1,0 ${fmt(2 * r)},0` +
    `a${r},${r} 0 1,0 ${fmt(-2 * r)},0z`
  );
}

function moduleNoise(x, y) {
  return getSeededRand(Math.round(x) * 73856093 + Math.round(y) * 19349663)();
}

const CURVE_STAMPS = {
  sparkle: (x, y, w) => {
    const half = w / 2;
    const waist = w * 0.16;
    const cx = x + half;
    const cy = y + half;

    return (
      `M${fmt(cx)},${fmt(y)}` +
      `Q${fmt(cx + waist)},${fmt(cy - waist)} ${fmt(x + w)},${fmt(cy)}` +
      `Q${fmt(cx + waist)},${fmt(cy + waist)} ${fmt(cx)},${fmt(y + w)}` +
      `Q${fmt(cx - waist)},${fmt(cy + waist)} ${fmt(x)},${fmt(cy)}` +
      `Q${fmt(cx - waist)},${fmt(cy - waist)} ${fmt(cx)},${fmt(y)}z`
    );
  },

  plus: (x, y, w) => {
    const a = w * 0.3;
    const b = w * 0.7;
    const r = w * 0.14;
    const at = (px, py) => `${fmt(x + px)},${fmt(y + py)}`;

    return (
      `M${at(a, r)}Q${at(a, 0)} ${at(a + r, 0)}` +
      `H${fmt(x + b - r)}Q${at(b, 0)} ${at(b, r)}` +
      `V${fmt(y + a)}H${fmt(x + w - r)}` +
      `Q${at(w, a)} ${at(w, a + r)}` +
      `V${fmt(y + b - r)}Q${at(w, b)} ${at(w - r, b)}` +
      `H${fmt(x + b)}V${fmt(y + w - r)}` +
      `Q${at(b, w)} ${at(b - r, w)}` +
      `H${fmt(x + a + r)}Q${at(a, w)} ${at(a, w - r)}` +
      `V${fmt(y + b)}H${fmt(x + r)}` +
      `Q${at(0, b)} ${at(0, b - r)}` +
      `V${fmt(y + a + r)}Q${at(0, a)} ${at(r, a)}` +
      `H${fmt(x + a)}z`
    );
  },

  "circle-small": (x, y, w) => circlePath(x + w / 2, y + w / 2, w * 0.35),

  shake: (x, y, w) => {
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
            `${fmt(x + px * cos - py * sin)},${fmt(y + px * sin + py * cos)}`
        )
        .join("L") +
      "z"
    );
  },

  "circle-mixed": (x, y, w) =>
    circlePath(x + w / 2, y + w / 2, moduleNoise(x, y) < 0.75 ? w / 3 : w / 2),

  heart: (x, y, w) => {
    const at = (px, py) => `${fmt(x + px * w)},${fmt(y + py * w)}`;

    return (
      `M${at(0.5, 1)}` +
      `C${at(0.1, 0.7)} ${at(0, 0.45)} ${at(0, 0.3)}` +
      `C${at(0, 0.08)} ${at(0.35, 0.02)} ${at(0.5, 0.22)}` +
      `C${at(0.65, 0.02)} ${at(1, 0.08)} ${at(1, 0.3)}` +
      `C${at(1, 0.45)} ${at(0.9, 0.7)} ${at(0.5, 1)}z`
    );
  },
};

function polygonStamp(points, x, y, w) {
  return (
    "M" +
    points
      .map(([px, py]) => `${fmt(x + px * w)},${fmt(y + py * w)}`)
      .join("L") +
    "z"
  );
}

const ROUNDED_SHAPES = new Set(["rounded", "extra-rounded", "circle"]);

function shapePath(kind, x, y, width, cw) {
  return (SHAPES[kind] ?? SHAPES.square)(x, y, width, cw);
}

// ---------------------------------------------------------------------------
// Style: classic  (adapted from qrframe "Basic", MIT)
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
function renderClassic(qr, params) {
  const rowLen = qr.size;
  const margin = params.margin;
  const fg = params.foreground;
  const bg = params.background;
  const finderKind = params.finderType;
  const finderInnerKind = params.finderInnerType;
  const dataKind = params.dataType;
  const dataOpacity = params.dataOpacity ?? 1;

  const defs = [];
  const bgPaint = paint(bg, defs);
  const finderPaint = paint(params.finderColor || fg, defs);
  const dataPaint = paint(params.dataColor || fg, defs);

  const size = rowLen + 2 * margin;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margin} ${-margin} ${size} ${size}">`;
  if (defs.length) {
    svg += `<defs>${defs.join("")}</defs>`;
  }
  svg += `<rect x="${-margin}" y="${-margin}" width="${size}" height="${size}" fill="${bgPaint}"/>`;

  if (params.frame === "corners") {
    const bracketRadius = ROUNDED_SHAPES.has(finderKind) ? 2.2 : 0;
    const bracketStraight = 5 + margin / 2 - bracketRadius;
    const bracket = bracketRadius + bracketStraight;
    const bx = -margin / 2;
    const by = -margin / 2;
    const bw = size - margin;
    const side = fmt(bw - 2 * bracket);
    const r = fmt(bracketRadius);
    const cap = bracketRadius === 0 ? "square" : "round";
    svg += `<path fill="none" stroke="${finderPaint}" stroke-linecap="${cap}" d="`;
    svg += `M${bx},${fmt(by + bracket)}`;
    svg += `v-${bracketStraight}a${r},${r} 0,0,1 ${r},-${r}h${bracketStraight}m${side},0`;
    svg += `h${bracketStraight}a${r},${r} 0,0,1 ${r},${r}v${bracketStraight}m0,${side}`;
    svg += `v${bracketStraight}a${r},${r} 0,0,1 -${r},${r}h-${bracketStraight}m-${side},0`;
    svg += `h-${bracketStraight}a${r},${r} 0,0,1 -${r},-${r}v-${bracketStraight}`;
    svg += `"/>`;
  }

  svg += `<path fill="${finderPaint}" d="`;

  for (const [x, y] of [
    [0, 0],
    [rowLen - 7, 0],
    [0, rowLen - 7],
  ]) {
    svg += shapePath(finderKind, x, y, 7, true);
    svg += shapePath(finderKind, x + 1, y + 1, 5, false);
    svg += shapePath(finderInnerKind, x + 2, y + 2, 3, true);
  }
  svg += `"/>`;

  const dataSize = params.dataScale;
  const dataOffset = (1 - dataSize) / 2;

  svg += `<g fill="${dataPaint}" opacity="${fmt(dataOpacity)}"><path d="`;

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      const module = qr.matrix[y * rowLen + x];
      if (!(module & Module.ON) || module & Module.FINDER) {
        continue;
      }

      svg += shapePath(
        dataKind,
        x + dataOffset,
        y + dataOffset,
        dataSize,
        true
      );
    }
  }

  svg += `"/></g></svg>`;
  return svg;
}

// ---------------------------------------------------------------------------
// Style: dots  (qr-code-styling flavored: circular modules + optional gradient)
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
function renderDots(qr, params) {
  const rowLen = qr.size;
  const margin = params.margin;
  const dotScale = params.dotScale;

  const defs = [];
  const bgPaint = paint(params.background, defs);
  const fill = paint(params.foreground, defs);

  const size = rowLen + 2 * margin;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-margin} ${-margin} ${size} ${size}">`;
  if (defs.length) {
    svg += `<defs>${defs.join("")}</defs>`;
  }
  svg += `<rect x="${-margin}" y="${-margin}" width="${size}" height="${size}" fill="${bgPaint}"/>`;
  svg += `<g fill="${fill}">`;
  svg += `<path d="`;

  for (const [x, y] of [
    [0, 0],
    [rowLen - 7, 0],
    [0, rowLen - 7],
  ]) {
    svg += roundedRect(x, y, 7, 2.4, true);
    svg += roundedRect(x + 1, y + 1, 5, 1.8, false);
    svg += roundedRect(x + 2, y + 2, 3, 1.5, true); // radius = 1.5 -> circle
  }
  svg += `"/>`;

  const r = fmt(0.5 * dotScale);
  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      const module = qr.matrix[y * rowLen + x];
      if (!(module & Module.ON)) {
        continue;
      }
      if (module & Module.FINDER) {
        continue;
      }
      svg += `<circle cx="${fmt(x + 0.5)}" cy="${fmt(y + 0.5)}" r="${r}"/>`;
    }
  }
  svg += `</g></svg>`;
  return svg;
}

// ---------------------------------------------------------------------------
// Line tracer  (adapted from qrframe "Neon", MIT)
// ---------------------------------------------------------------------------

function neonPaths(qr, params, skipEyes) {
  const rand = getSeededRand(params.seed);
  const margin = params.margin;
  const colors = [params.color1, params.color2, params.color3, params.color4];

  const qrRowLen = qr.size;
  const rowLen = qrRowLen + 2 * margin;

  const newMatrix = Array(rowLen * rowLen).fill(0);
  const visited = new Uint16Array(rowLen * rowLen);

  for (let y = 0; y < margin - 1; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  for (let y = margin - 1; y < margin + qrRowLen + 1; y++) {
    for (let x = 0; x < margin - 1; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
    if (y >= margin && y < margin + qrRowLen) {
      for (let x = margin; x < rowLen - margin; x++) {
        newMatrix[y * rowLen + x] =
          qr.matrix[(y - margin) * qrRowLen + x - margin];
      }
    }
    for (let x = margin + qrRowLen + 1; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  for (let y = margin + qrRowLen + 1; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  if (params.quietZone === "minimal") {
    for (let x = margin + 8; x < rowLen - margin - 8; x++) {
      if (rand() > 0.5) {
        newMatrix[(margin - 1) * rowLen + x] = Module.ON;
      }
    }
    for (let y = margin + 8; y < rowLen - margin; y++) {
      if (y < rowLen - margin - 8) {
        if (rand() > 0.5) {
          newMatrix[y * rowLen + margin - 1] = Module.ON;
        }
      }
      if (rand() > 0.5) {
        newMatrix[y * rowLen + rowLen - margin] = Module.ON;
      }
    }
    for (let x = margin + 8; x < rowLen - margin + 1; x++) {
      if (rand() > 0.5) {
        newMatrix[(rowLen - margin) * rowLen + x] = Module.ON;
      }
    }
  }

  const unit = 4;
  let thin = params.lineThickness;
  let offset = (unit - thin) / 2;

  const xMax = rowLen - 1;
  const yMax = rowLen - 1;

  let baseX;
  let baseY;

  const rawOn = params.invert
    ? (x, y) => (newMatrix[y * rowLen + x] & Module.ON) === 0
    : (x, y) => (newMatrix[y * rowLen + x] & Module.ON) !== 0;
  const hole = params.fillHole;
  const inHole = (x, y) =>
    hole &&
    x >= hole.x &&
    x < hole.x + hole.size &&
    y >= hole.y &&
    y < hole.y + hole.size;
  const on = (x, y) =>
    rawOn(x, y) &&
    !inHole(x, y) &&
    !(skipEyes && newMatrix[y * rowLen + x] & Module.FINDER);

  const paths = [""];
  const fills = [null];

  function go(x, y, dx, dy, path, cw) {
    for (;;) {
      visited[y * rowLen + x] = path;
      let concave = false;

      let nx = x + dx;
      let ny = y + dy;
      while (nx >= 0 && nx <= xMax && ny >= 0 && ny <= yMax) {
        const next = on(nx, ny);
        const cx = nx + dy;
        const cy = ny - dx;
        const diag =
          cx >= 0 && cx <= xMax && cy >= 0 && cy <= yMax && on(cx, cy);
        if (!next || diag) {
          concave = next && diag;
          break;
        }
        visited[ny * rowLen + nx] = path;
        nx += dx;
        ny += dy;
      }

      if (nx - dx === baseX && ny - dy === baseY) {
        if ((cw && dy === -1) || (!cw && dx === -1)) {
          paths[path] += "z";
          return;
        }
      }

      if (concave) {
        if (dx) {
          paths[path] += `h${(nx - x) * unit}v${-dx * 2 * offset}`;
        } else {
          paths[path] += `v${(ny - y) * unit}h${dy * 2 * offset}`;
        }
        const nextX = nx + dy;
        const nextY = ny - dx;
        const nextDx = dy;
        const nextDy = -dx;
        x = nextX;
        y = nextY;
        dx = nextDx;
        dy = nextDy;
      } else {
        if (dx) {
          paths[path] += `h${(nx - x - dx) * unit + dx * thin}`;
        } else {
          paths[path] += `v${(ny - y - dy) * unit + dy * thin}`;
        }
        const nextX = nx - dx;
        const nextY = ny - dy;
        const nextDx = -dy;
        const nextDy = dx;
        x = nextX;
        y = nextY;
        dx = nextDx;
        dy = nextDy;
      }
    }
  }

  const stack = [];
  for (let x = 0; x < rowLen; x++) {
    if (!on(x, 0)) {
      stack.push([x, 0]);
    }
  }
  for (let y = 1; y < yMax; y++) {
    if (!on(0, y)) {
      stack.push([0, y]);
    }
    if (!on(xMax, y)) {
      stack.push([xMax, y]);
    }
  }
  for (let x = 0; x < rowLen; x++) {
    if (!on(x, yMax)) {
      stack.push([x, yMax]);
    }
  }

  function dfsOff() {
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (visited[y * rowLen + x]) {
        continue;
      }
      visited[y * rowLen + x] = 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) {
            continue;
          }
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx > xMax || ny < 0 || ny > yMax) {
            continue;
          }
          if (on(nx, ny)) {
            continue;
          }
          stack.push([nx, ny]);
        }
      }
    }
  }
  dfsOff();

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (visited[y * rowLen + x]) {
        continue;
      }

      if (newMatrix[y * rowLen + x] & Module.FINDER) {
        thin = params.finderThickness;
        offset = (unit - thin) / 2;
      } else {
        thin = params.lineThickness;
        offset = (unit - thin) / 2;
      }

      if (!on(x, y)) {
        const path = visited[y * rowLen + x - 1];
        paths[path] +=
          `M${x * unit - offset},${y * unit - offset}v${2 * offset}`;
        baseY = y - 1;
        baseX = x;
        go(x - 1, y, 0, 1, path, false);
        stack.push([x, y]);
        dfsOff();
        continue;
      }

      if (y > 0 && on(x, y - 1) && visited[(y - 1) * rowLen + x]) {
        visited[y * rowLen + x] = visited[(y - 1) * rowLen + x];
        continue;
      }
      if (x > 0 && on(x - 1, y) && visited[y * rowLen + x - 1]) {
        visited[y * rowLen + x] = visited[y * rowLen + x - 1];
        continue;
      }

      const color = colors[Math.floor(rand() * colors.length)];
      paths.push(`M${x * unit + offset},${y * unit + offset}`);
      fills.push(color);
      baseY = y;
      baseX = x;
      go(x, y, 1, 0, paths.length - 1, true);
    }
  }

  return paths.slice(1).map((d, i) => ({ d, fill: fills[i + 1] }));
}

// ---------------------------------------------------------------------------
// Style: camo  (adapted from qrframe "Camo", MIT)
// ---------------------------------------------------------------------------
function camoPaths(qr, params, skipEyes, originShift = 0) {
  const rand = getSeededRand(params.seed);
  const margin = params.margin;
  const quietZone = params.quietZone;

  const qrRowLen = qr.size;
  const rowLen = qrRowLen + 2 * margin;

  const newMatrix = Array(rowLen * rowLen).fill(0);
  const visited = new Uint16Array(rowLen * rowLen);

  for (let y = 0; y < margin - quietZone; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  for (let y = margin - quietZone; y < margin + qrRowLen + quietZone; y++) {
    for (let x = 0; x < margin - quietZone; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
    if (y >= margin && y < margin + qrRowLen) {
      for (let x = margin; x < rowLen - margin; x++) {
        newMatrix[y * rowLen + x] =
          qr.matrix[(y - margin) * qrRowLen + x - margin];
      }
    }
    for (let x = margin + qrRowLen + quietZone; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  for (let y = margin + qrRowLen + quietZone; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  if (quietZone === 0 && margin > 0) {
    for (let x = margin; x < margin + 7; x++) {
      newMatrix[(margin - 1) * rowLen + x] = 0;
      newMatrix[(margin - 1) * rowLen + x + qrRowLen - 7] = 0;
    }
    for (let y = margin; y < margin + 7; y++) {
      newMatrix[y * rowLen + margin - 1] = 0;
      newMatrix[y * rowLen + rowLen - margin] = 0;
    }
    for (let y = margin + qrRowLen - 7; y < margin + qrRowLen; y++) {
      newMatrix[y * rowLen + margin - 1] = 0;
    }
    for (let x = margin; x < margin + 7; x++) {
      newMatrix[(rowLen - margin) * rowLen + x] = 0;
    }
  }

  const xMax = rowLen - 1;
  const yMax = rowLen - 1;

  let baseX;
  let baseY;

  const rawOn = params.invert
    ? (x, y) => (newMatrix[y * rowLen + x] & Module.ON) === 0
    : (x, y) => (newMatrix[y * rowLen + x] & Module.ON) !== 0;
  const hole = params.fillHole;
  const inHole = (x, y) =>
    hole &&
    x >= hole.x &&
    x < hole.x + hole.size &&
    y >= hole.y &&
    y < hole.y + hole.size;
  const on = (x, y) =>
    rawOn(x, y) &&
    !inHole(x, y) &&
    !(skipEyes && newMatrix[y * rowLen + x] & Module.FINDER);

  const paths = [""];

  function go(x, y, dx, dy, path, cw) {
    visited[y * rowLen + x] = path;
    let concave = false;

    let nx = x + dx;
    let ny = y + dy;
    while (nx >= 0 && nx <= xMax && ny >= 0 && ny <= yMax) {
      const next = on(nx, ny);
      const cx = nx + dy;
      const cy = ny - dx;
      const diag = cx >= 0 && cx <= xMax && cy >= 0 && cy <= yMax && on(cx, cy);
      if (!next || diag) {
        concave = next && diag;
        break;
      }
      visited[ny * rowLen + nx] = path;
      nx += dx;
      ny += dy;
    }

    if (nx - dx === baseX && ny - dy === baseY) {
      if ((cw && dy === -1) || (!cw && dx === -1)) {
        paths[path] += "z";
        return;
      }
    }

    if (dx !== 0) {
      const dist = nx - x - dx * 2 * 0.5;
      if (dist) {
        paths[path] += `h${dist}`;
      }
    } else {
      const dist = ny - y - dy * 2 * 0.5;
      if (dist) {
        paths[path] += `v${dist}`;
      }
    }

    if (concave) {
      paths[path] += `a.5.5 0,0,0 ${(dx + dy) * 0.5},${(dy - dx) * 0.5}`;
      go(nx + dy, ny - dx, dy, -dx, path, cw);
    } else {
      paths[path] += `a.5.5 0,0,1 ${(dx - dy) * 0.5},${(dy + dx) * 0.5}`;
      go(nx - dx, ny - dy, -dy, dx, path, cw);
    }
  }

  const stack = [];
  for (let x = 0; x < rowLen; x++) {
    if (!on(x, 0)) {
      stack.push([x, 0]);
    }
  }
  for (let y = 1; y < yMax; y++) {
    if (!on(0, y)) {
      stack.push([0, y]);
    }
    if (!on(xMax, y)) {
      stack.push([xMax, y]);
    }
  }
  for (let x = 0; x < rowLen; x++) {
    if (!on(x, yMax)) {
      stack.push([x, yMax]);
    }
  }

  function dfsOff() {
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (visited[y * rowLen + x]) {
        continue;
      }
      visited[y * rowLen + x] = 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dy === 0 && dx === 0) {
            continue;
          }
          let nx = x + dx;
          let ny = y + dy;
          if (nx < 0 || nx > xMax || ny < 0 || ny > yMax) {
            continue;
          }
          if (on(nx, ny)) {
            continue;
          }
          stack.push([nx, ny]);
        }
      }
    }
  }
  dfsOff();

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (visited[y * rowLen + x]) {
        continue;
      }

      if (!on(x, y)) {
        const path = visited[y * rowLen + x - 1];
        paths[path] +=
          `M${x + 0.5 + originShift},${y + originShift}a.5.5 0,0,0 -.5.5`;

        baseY = y - 1;
        baseX = x;
        go(x - 1, y, 0, 1, path, false);
        stack.push([x, y]);
        dfsOff();
        continue;
      }

      if (y > 0 && on(x, y - 1) && visited[(y - 1) * rowLen + x]) {
        visited[y * rowLen + x] = visited[(y - 1) * rowLen + x];
        continue;
      }
      if (x > 0 && on(x - 1, y) && visited[y * rowLen + x - 1]) {
        visited[y * rowLen + x] = visited[y * rowLen + x - 1];
        continue;
      }

      paths.push(
        `M${x + originShift},${y + 0.5 + originShift}a.5.5 0,0,1 .5-.5`
      );
      baseY = y;
      baseX = x;
      go(x, y, 1, 0, paths.length - 1, true);
    }
  }

  return paths.slice(1).join("");
}

// eslint-disable-next-line no-unused-vars
function renderCamo(qr, params) {
  const rowLen = qr.size + 2 * params.margin;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rowLen} ${rowLen}">`;
  svg += `<rect width="${rowLen}" height="${rowLen}" fill="${params.background}"/>`;
  svg += `<g fill="${params.foreground}">`;

  const d = camoPaths(qr, params, false);
  if (d) {
    svg += `<path d="${d}"/>`;
  }

  svg += `</g></svg>`;
  return svg;
}

// ---------------------------------------------------------------------------
// Halftone - ported from zhengkyl/qrframe (Halftone.js, MIT);
// ---------------------------------------------------------------------------

function ditherImage(ctx, canvasSize, imgOffset, imgSize, fg, bg) {
  const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
  const data = imageData.data;

  for (let y = imgOffset; y < imgOffset + imgSize; y++) {
    for (let x = imgOffset; x < imgOffset + imgSize; x++) {
      const i = (y * canvasSize + x) * 4;

      if (data[i + 3] === 0) {
        continue;
      }

      const oldPixel =
        (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;

      let newPixel;
      if (oldPixel < 128) {
        newPixel = 0;
        ctx.fillStyle = fg;
      } else {
        newPixel = 255;
        ctx.fillStyle = bg;
      }

      ctx.fillRect(x, y, 1, 1);

      data[i] = data[i + 1] = data[i + 2] = newPixel;
      const error = oldPixel - newPixel;

      if (x < canvasSize - 1) {
        data[i + 4] += (error * 7) / 16;
      }
      if (y < canvasSize - 1) {
        if (x > 0) {
          data[i + canvasSize * 4 - 4] += (error * 3) / 16;
        }
        data[i + canvasSize * 4] += (error * 5) / 16;
        if (x < canvasSize - 1) {
          data[i + canvasSize * 4 + 4] += (error * 1) / 16;
        }
      }
    }
  }
}

const solidColor = (value, fallback) =>
  typeof value === "string" ? value : (value?.stops?.[0] ?? fallback);

function clipToFrame(ctx, size, clipPath, canvasSize, margin) {
  if (!clipPath) {
    return;
  }

  const scale = size / canvasSize;
  const marginPx = margin * scale;

  ctx.setTransform(scale, 0, 0, scale, marginPx, marginPx);
  ctx.beginPath();
  ctx.clip(new Path2D(clipPath));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

async function halftoneBackdrop(
  png,
  params,
  imageUrl,
  clipPath,
  canvasSize,
  frameMargin
) {
  const code = await createImageBitmap(new Blob([png], { type: "image/png" }));
  const size = code.width;

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const fg = solidColor(params.foreground, "#000000");
  const bg = solidColor(params.background, "#ffffff");

  clipToFrame(ctx, size, clipPath, canvasSize, frameMargin);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const image = imageUrl
    ? await fetch(imageUrl)
        .then((res) => res.blob())
        .then((blob) => createImageBitmap(blob))
    : null;

  if (image) {
    const cellPixels = Math.max(
      1,
      Math.round(size / (canvasSize * params.halftoneCells))
    );
    const grid = Math.ceil(size / cellPixels);

    const cells = new OffscreenCanvas(grid, grid);
    const cellCtx = cells.getContext("2d");

    cellCtx.fillStyle = bg;
    cellCtx.fillRect(0, 0, grid, grid);

    cellCtx.filter = `brightness(${params.halftoneBrightness}) contrast(${params.halftoneContrast})`;
    const imgSize = Math.floor(params.halftoneScale * grid);
    const offset = Math.floor((grid - imgSize) / 2);
    cellCtx.drawImage(image, offset, offset, imgSize, imgSize);
    cellCtx.filter = "none";

    ditherImage(cellCtx, grid, offset, imgSize, fg, bg);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cells, 0, 0, grid * cellPixels, grid * cellPixels);
    ctx.imageSmoothingEnabled = true;
  }

  ctx.drawImage(code, 0, 0);

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Pipeline: pattern -> margin -> eyes -> effect
// ---------------------------------------------------------------------------

const PATTERNS = {};
const MARGINS = {};
const FRAME_CLEARANCE = 0.02;

const circleFrameRadius = (qr, params) =>
  ((qr.size + 2 * params.margin) * Math.SQRT2) / 2;

const circleFramePad = (qr, params) =>
  circleFrameRadius(qr, params) +
  0.5 +
  FRAME_CLEARANCE -
  (qr.size / 2 + params.margin);

const FRAMES = {
  none: { pad: () => 0, build: () => "" },

  border: {
    pad: () => 1,
    build: (qr, params, edge) => {
      const thick = params.frameThickness ?? 0.5;
      const outer = qr.size + 2 * edge;

      return (
        `M${fmt(-edge)},${fmt(-edge)}h${fmt(outer)}v${fmt(outer)}h${fmt(-outer)}z` +
        `M${fmt(-edge + thick)},${fmt(-edge + thick)}` +
        `v${fmt(outer - 2 * thick)}h${fmt(outer - 2 * thick)}` +
        `v${fmt(-(outer - 2 * thick))}z`
      );
    },
  },

  corners: {
    pad: () => 1,
    build: (qr, params, edge) => {
      const thick = params.frameThickness ?? 0.5;
      const arm = (qr.size + 2 * edge) / 4;
      const lo = -edge;
      const hi = qr.size + edge;
      let d = "";

      for (const [x, sx] of [
        [lo, 1],
        [hi, -1],
      ]) {
        for (const [y, sy] of [
          [lo, 1],
          [hi, -1],
        ]) {
          d +=
            `M${fmt(x)},${fmt(y)}` +
            `L${fmt(x + sx * arm)},${fmt(y)}` +
            `L${fmt(x + sx * arm)},${fmt(y + sy * thick)}` +
            `L${fmt(x + sx * thick)},${fmt(y + sy * thick)}` +
            `L${fmt(x + sx * thick)},${fmt(y + sy * arm)}` +
            `L${fmt(x)},${fmt(y + sy * arm)}z`;
        }
      }

      return d;
    },
  },
};

const ICON_UNIT = 24;
const ICON_FRAMES = {
  "circle-sketch": {
    d: "M23.33,11.66l-0.03,1.01c0,0.03-0.03,0.06-0.06,0.06s-0.06-0.03-0.06-0.06c0,0,0,0,0,0l0-0.01l0.05-1 \tc0-0.03,0.02-0.05,0.05-0.05C23.31,11.61,23.33,11.64,23.33,11.66z M22.92,14.57c-0.04-0.01-0.08,0.01-0.09,0.05l0,0.01l-0.31,0.95 \tl0,0.01c0,0,0,0,0,0c-0.01,0.04,0.01,0.09,0.05,0.1s0.09-0.01,0.1-0.05l0.3-0.96C22.98,14.62,22.96,14.58,22.92,14.57z M21.77,17.32 \tc-0.04-0.03-0.11-0.02-0.14,0.03l0,0.01l-0.56,0.83l-0.01,0.01c0,0,0,0,0,0c-0.03,0.05-0.02,0.11,0.03,0.15 \tc0.05,0.03,0.11,0.02,0.15-0.03l0.56-0.85C21.83,17.41,21.82,17.35,21.77,17.32z M19.92,19.67c-0.04-0.05-0.12-0.06-0.17-0.01 \tl-0.01,0l-0.76,0.65l-0.01,0.01c0,0,0,0,0,0c-0.06,0.05-0.06,0.14-0.01,0.19c0.05,0.06,0.14,0.06,0.19,0.01l0.75-0.69 \tC19.96,19.8,19.97,19.72,19.92,19.67z M17.55,21.46c-0.04-0.09-0.14-0.13-0.23-0.09l-0.01,0l-0.9,0.42l-0.02,0.01c0,0,0,0-0.01,0 \tc-0.1,0.05-0.13,0.17-0.09,0.26c0.05,0.1,0.17,0.13,0.26,0.09l0.92-0.47C17.56,21.65,17.59,21.55,17.55,21.46z M14.79,22.56 \tc-0.02-0.13-0.14-0.21-0.27-0.19l-0.01,0l-0.98,0.16l-0.03,0.01c0,0-0.01,0-0.01,0c-0.14,0.03-0.23,0.16-0.2,0.3 \tc0.03,0.14,0.16,0.23,0.3,0.2l1.02-0.2C14.72,22.8,14.8,22.69,14.79,22.56z M11.81,22.89c0.02-0.16-0.1-0.3-0.26-0.32l-0.02,0 \tl-0.99-0.11l-0.04,0c0,0-0.01,0-0.01,0c-0.17-0.01-0.32,0.11-0.33,0.28c-0.01,0.17,0.11,0.32,0.28,0.33l1.05,0.08 \tC11.65,23.16,11.79,23.05,11.81,22.89z M8.83,22.43c0.07-0.18-0.01-0.38-0.19-0.45l-0.02-0.01L7.7,21.59l-0.04-0.02 \tc0,0-0.01,0-0.01,0c-0.19-0.07-0.4,0.03-0.47,0.22s0.03,0.4,0.22,0.47l1,0.37C8.56,22.68,8.76,22.6,8.83,22.43z M6.07,21.17 \tC6.21,21,6.18,20.74,6,20.61l-0.02-0.01L5.2,19.98l-0.04-0.03c0,0-0.01-0.01-0.01-0.01c-0.19-0.14-0.45-0.09-0.59,0.1 \tc-0.14,0.19-0.09,0.45,0.1,0.59l0.87,0.63C5.69,21.38,5.94,21.35,6.07,21.17z M3.74,19.2c0.2-0.14,0.24-0.42,0.09-0.62l-0.02-0.03 \tl-0.59-0.8l-0.03-0.04c0,0,0,0,0,0c-0.15-0.2-0.43-0.23-0.63-0.08c-0.2,0.15-0.23,0.43-0.08,0.63l0.65,0.85 \tC3.27,19.31,3.55,19.35,3.74,19.2z M2.01,16.65c0.24-0.09,0.36-0.36,0.27-0.6l-0.01-0.03l-0.35-0.93L1.9,15.04c0,0,0,0,0,0 \tc-0.1-0.24-0.37-0.36-0.61-0.26c-0.24,0.1-0.36,0.37-0.26,0.61l0.4,1C1.51,16.63,1.77,16.75,2.01,16.65z M1.03,13.73 \tC1.3,13.7,1.5,13.46,1.47,13.2l0-0.04l-0.09-0.99l0-0.05c0,0,0,0,0,0c-0.03-0.27-0.27-0.47-0.55-0.44s-0.47,0.27-0.44,0.55 \tl0.11,1.08C0.53,13.55,0.76,13.75,1.03,13.73z M0.5,10.06c-0.05,0.26,0.13,0.52,0.39,0.57s0.52-0.13,0.57-0.39l0.01-0.05l0.18-0.98 \tl0.01-0.04c0.05-0.26-0.12-0.5-0.38-0.55C1.01,8.56,0.76,8.73,0.71,8.99L0.5,10.06C0.5,10.05,0.5,10.06,0.5,10.06z M1.41,6.96 \tC1.3,7.19,1.39,7.46,1.62,7.58c0.23,0.11,0.51,0.02,0.62-0.21l0.02-0.04L2.7,6.43l0.02-0.03c0.11-0.22,0.02-0.49-0.2-0.61 \tc-0.22-0.11-0.5-0.02-0.61,0.2L1.41,6.96C1.41,6.95,1.41,6.96,1.41,6.96z M3.12,4.23C2.96,4.41,2.97,4.69,3.15,4.85 \tc0.18,0.16,0.46,0.15,0.62-0.04L3.8,4.78l0.66-0.74l0.02-0.03c0.16-0.18,0.14-0.45-0.03-0.61C4.28,3.24,4.01,3.26,3.85,3.43 \tL3.12,4.23C3.12,4.22,3.12,4.23,3.12,4.23z M5.5,2.1C5.31,2.22,5.25,2.47,5.37,2.65c0.12,0.19,0.37,0.24,0.56,0.12l0.04-0.03 \tl0.84-0.54l0.02-0.01C7,2.08,7.05,1.85,6.95,1.68C6.84,1.5,6.6,1.44,6.42,1.54L5.51,2.09C5.5,2.09,5.5,2.09,5.5,2.1z M8.36,0.72 \tC8.18,0.78,8.08,0.97,8.14,1.15c0.06,0.18,0.25,0.28,0.43,0.23l0.04-0.01l0.95-0.29l0.02-0.01c0.17-0.05,0.26-0.23,0.22-0.4 \tC9.75,0.5,9.57,0.4,9.4,0.45L8.38,0.72C8.37,0.72,8.37,0.72,8.36,0.72z M11.47,0.18c-0.16,0-0.29,0.13-0.28,0.29 \tc0,0.16,0.13,0.29,0.29,0.28l0.04,0c0.33-0.01,0.66-0.03,0.99-0.02c0.14,0,0.27-0.11,0.28-0.25c0.01-0.15-0.1-0.28-0.25-0.29 \tl-0.01,0C12.18,0.17,11.83,0.19,11.47,0.18C11.48,0.18,11.48,0.18,11.47,0.18z M14.58,0.5c-0.12-0.03-0.25,0.04-0.28,0.17 \tc-0.03,0.12,0.04,0.25,0.17,0.28l0.03,0.01l0.97,0.24l0.01,0c0.11,0.03,0.22-0.04,0.26-0.15c0.03-0.11-0.03-0.23-0.14-0.26 \tL14.58,0.5C14.59,0.5,14.58,0.5,14.58,0.5z M17.46,1.63c-0.08-0.05-0.19-0.02-0.24,0.06c-0.05,0.08-0.02,0.19,0.06,0.24l0.02,0.01 \tl0.86,0.5l0.01,0c0.07,0.04,0.16,0.02,0.21-0.05c0.05-0.07,0.02-0.17-0.05-0.21L17.46,1.63C17.46,1.64,17.46,1.63,17.46,1.63z \t M19.9,3.48c-0.05-0.05-0.12-0.05-0.17,0c-0.05,0.05-0.05,0.12,0,0.17l0.01,0.01l0.7,0.71l0.01,0.01c0.04,0.04,0.11,0.05,0.16,0 \tc0.05-0.04,0.05-0.11,0-0.16L19.9,3.48C19.9,3.48,19.9,3.48,19.9,3.48z M21.79,5.86c-0.03-0.05-0.08-0.06-0.13-0.04 \ts-0.06,0.08-0.04,0.13l0,0.01l0.48,0.87l0,0.01c0.02,0.04,0.08,0.06,0.12,0.04c0.04-0.02,0.06-0.08,0.04-0.12L21.79,5.86 \tC21.79,5.87,21.79,5.86,21.79,5.86z M22.96,8.66c-0.01-0.04-0.05-0.06-0.09-0.05s-0.06,0.05-0.05,0.09l0,0.01l0.23,0.97l0,0.01 \tc0.01,0.03,0.04,0.06,0.08,0.05c0.04-0.01,0.06-0.04,0.05-0.08L22.96,8.66C22.96,8.66,22.96,8.66,22.96,8.66z",
    place: (qr, params, edge) => {
      const radius = qr.size / 2 + edge - FRAME_CLEARANCE;

      return {
        scale: (2 * radius) / ICON_UNIT,
        x: qr.size / 2 - radius,
        y: qr.size / 2 - radius,
      };
    },
  },
};

for (const [key, icon] of Object.entries(ICON_FRAMES)) {
  FRAMES[key] = {
    pad: circleFramePad,
    build: (qr, params, edge) => {
      const { scale, x, y } = icon.place(qr, params, edge);

      return {
        d: icon.d,
        transform: `translate(${fmt(x)},${fmt(y)}) scale(${fmt(scale)})`,
      };
    },
    backdrop: (qr, params, outer) => {
      const centre = qr.size / 2;

      return ENCLOSURES.disc.path(centre, centre, outer - FRAME_CLEARANCE);
    },
    fillShape: (qr, params, outer) => {
      const centre = qr.size / 2;

      return ENCLOSURES.disc.path(centre, centre, outer - FRAME_CLEARANCE);
    },
    fillContains: (qr, params, outer) => {
      const centre = qr.size / 2;

      return ENCLOSURES.disc.contains(centre, centre, outer - FRAME_CLEARANCE);
    },
  };
}

const roundedCornersEnclosure = (qr, outer) => {
  const edge = outer - qr.size / 2;
  const arm = (qr.size + 2 * edge) / 4;
  const r = Math.min(2, arm / 2);

  return { lo: -edge, hi: qr.size + edge, r };
};

FRAMES["rounded-corners"] = {
  pad: () => 1,
  backdrop: (qr, params, outer) => {
    const { lo, hi, r } = roundedCornersEnclosure(qr, outer);

    return (
      `M${fmt(lo + r)},${fmt(lo)}` +
      `H${fmt(hi - r)}A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(hi)},${fmt(lo + r)}` +
      `V${fmt(hi - r)}A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(hi - r)},${fmt(hi)}` +
      `H${fmt(lo + r)}A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(lo)},${fmt(hi - r)}` +
      `V${fmt(lo + r)}A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(lo + r)},${fmt(lo)}z`
    );
  },
  fillShape: (qr, params, outer) =>
    FRAMES["rounded-corners"].backdrop(qr, params, outer),
  fillContains: (qr, params, outer) => {
    const { lo, hi, r } = roundedCornersEnclosure(qr, outer);

    return (x, y) => {
      const cx = Math.min(Math.max(x, lo + r), hi - r);
      const cy = Math.min(Math.max(y, lo + r), hi - r);

      return Math.hypot(x - cx, y - cy) <= r;
    };
  },
  build: (qr, params, edge) => {
    const thick = params.frameThickness ?? 0.5;
    const arm = (qr.size + 2 * edge) / 4;
    const r = Math.min(2, arm / 2);
    const lo = -edge;
    const hi = qr.size + edge;
    let d = "";

    for (const [x, sx] of [
      [lo, 1],
      [hi, -1],
    ]) {
      for (const [y, sy] of [
        [lo, 1],
        [hi, -1],
      ]) {
        const sweep = sx * sy > 0 ? 0 : 1;
        d +=
          `M${fmt(x + sx * arm)},${fmt(y)}` +
          `L${fmt(x + sx * r)},${fmt(y)}` +
          `A${fmt(r)},${fmt(r)} 0 0 ${sweep} ${fmt(x)},${fmt(y + sy * r)}` +
          `L${fmt(x)},${fmt(y + sy * arm)}` +
          `L${fmt(x + sx * thick)},${fmt(y + sy * arm)}` +
          `L${fmt(x + sx * thick)},${fmt(y + sy * (r + thick))}` +
          `A${fmt(r)},${fmt(r)} 0 0 ${1 - sweep} ${fmt(x + sx * (r + thick))},${fmt(y + sy * thick)}` +
          `L${fmt(x + sx * arm)},${fmt(y + sy * thick)}z`;
      }
    }

    return d;
  },
};

FRAMES["border-inset"] = {
  pad: () => 0,
  build: (qr, params) => MARGINS.extend.build(qr, params),
};

FRAMES["rounded-border"] = {
  pad: () => 1,
  backdrop: (qr, params, outer) => {
    const lo = qr.size / 2 - outer + FRAME_CLEARANCE;
    const side = (outer - FRAME_CLEARANCE) * 2;
    const r = Math.min(3, side / 6);

    return (
      `M${fmt(lo + r)},${fmt(lo)}h${fmt(side - 2 * r)}` +
      `a${fmt(r)},${fmt(r)} 0 0 1 ${fmt(r)},${fmt(r)}v${fmt(side - 2 * r)}` +
      `a${fmt(r)},${fmt(r)} 0 0 1 ${fmt(-r)},${fmt(r)}h${fmt(-(side - 2 * r))}` +
      `a${fmt(r)},${fmt(r)} 0 0 1 ${fmt(-r)},${fmt(-r)}v${fmt(-(side - 2 * r))}` +
      `a${fmt(r)},${fmt(r)} 0 0 1 ${fmt(r)},${fmt(-r)}z`
    );
  },
  build: (qr, params, edge) => {
    const thick = params.frameThickness ?? 0.5;
    const outer = qr.size + 2 * edge;
    const r = Math.min(3, outer / 6);
    const lo = -edge;
    const hi = qr.size + edge;
    const ri = r - thick > 0 ? r - thick : 0;
    const round = (x0, y0, x1, y1, radius, cw) => {
      const a = `A${fmt(radius)},${fmt(radius)} 0 0 ${cw ? 1 : 0} `;
      return cw
        ? `M${fmt(x0 + radius)},${fmt(y0)}H${fmt(x1 - radius)}${a}${fmt(x1)},${fmt(y0 + radius)}` +
            `V${fmt(y1 - radius)}${a}${fmt(x1 - radius)},${fmt(y1)}` +
            `H${fmt(x0 + radius)}${a}${fmt(x0)},${fmt(y1 - radius)}` +
            `V${fmt(y0 + radius)}${a}${fmt(x0 + radius)},${fmt(y0)}z`
        : `M${fmt(x0 + radius)},${fmt(y0)}${a}${fmt(x0)},${fmt(y0 + radius)}` +
            `V${fmt(y1 - radius)}${a}${fmt(x0 + radius)},${fmt(y1)}` +
            `H${fmt(x1 - radius)}${a}${fmt(x1)},${fmt(y1 - radius)}` +
            `V${fmt(y0 + radius)}${a}${fmt(x1 - radius)},${fmt(y0)}z`;
    };

    return (
      round(lo, lo, hi, hi, r, true) +
      round(lo + thick, lo + thick, hi - thick, hi - thick, ri, false)
    );
  },
};

const annulus = (cx, cy, outer, inner) => {
  const ring = (radius, cw) => {
    const r = fmt(radius);

    return (
      `M${fmt(cx - r)},${fmt(cy)}` +
      `a${r},${r} 0 1,${cw ? 1 : 0} ${fmt(2 * r)},0` +
      `a${r},${r} 0 1,${cw ? 1 : 0} ${fmt(-2 * r)},0z`
    );
  };

  return ring(outer, true) + ring(inner, false);
};

const disc = (cx, cy, radius) => {
  const r = fmt(radius);

  return (
    `M${fmt(cx - r)},${fmt(cy)}` +
    `a${r},${r} 0 1,1 ${fmt(2 * r)},0` +
    `a${r},${r} 0 1,1 ${fmt(-2 * r)},0z`
  );
};

const hexPoints = (cx, cy, radius) => {
  const points = [];

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(
      `${fmt(cx + radius * Math.cos(angle))},${fmt(cy + radius * Math.sin(angle))}`
    );
  }

  return points;
};

const circleFrames = {
  circle: (cx, cy, r, thick) => annulus(cx, cy, r, r - thick),
  "circle-double": (cx, cy, r, thick) =>
    annulus(cx, cy, r, r - thick) +
    annulus(cx, cy, r - 2 * thick, r - 3 * thick),
  "circle-dashed": (cx, cy, r, thick, segments = 16) => {
    const step = (Math.PI * 2) / segments;
    const inner = r - thick;
    let d = "";

    for (let i = 0; i < segments; i += 2) {
      const a0 = i * step;
      const a1 = a0 + step;
      const at = (rad, angle) =>
        `${fmt(cx + rad * Math.cos(angle))},${fmt(cy + rad * Math.sin(angle))}`;

      d +=
        `M${at(r, a0)}A${fmt(r)},${fmt(r)} 0 0 1 ${at(r, a1)}` +
        `L${at(inner, a1)}A${fmt(inner)},${fmt(inner)} 0 0 0 ${at(inner, a0)}z`;
    }

    return d;
  },
};

circleFrames["circle-dashed-wide"] = (cx, cy, r, thick) =>
  circleFrames["circle-dashed"](cx, cy, r, thick, 8);
circleFrames["circle-dashed-fine"] = (cx, cy, r, thick) =>
  circleFrames["circle-dashed"](cx, cy, r, thick, 32);

circleFrames.hexagon = (cx, cy, r, thick) => {
  const ring = (radius, cw) => {
    const points = hexPoints(cx, cy, radius);

    return "M" + (cw ? points : points.reverse()).join("L") + "z";
  };

  return ring(r, true) + ring(r - thick, false);
};

const HEX_COS60 = Math.cos(Math.PI / 3);
const HEX_SIN60 = Math.sin(Math.PI / 3);

const ENCLOSURES = {
  disc: {
    path: disc,
    contains: (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) <= r,
  },
  hex: {
    path: (cx, cy, r) => "M" + hexPoints(cx, cy, r).join("L") + "z",
    contains: (cx, cy, r) => {
      const apothem = r * HEX_SIN60;

      return (x, y) => {
        const dx = x - cx;
        const dy = y - cy;

        return (
          Math.abs(dx) <= apothem &&
          Math.abs(dx * HEX_COS60 + dy * HEX_SIN60) <= apothem &&
          Math.abs(dx * HEX_COS60 - dy * HEX_SIN60) <= apothem
        );
      };
    },
  },
};

const circleFrameFills = {
  "circle-double": { shape: "disc", rings: 3 },
  hexagon: { shape: "hex", rings: 1 },
};

for (const [key, build] of Object.entries(circleFrames)) {
  const { shape, rings } = circleFrameFills[key] ?? { shape: "disc", rings: 1 };
  const enclosure = ENCLOSURES[shape];
  const inset = (thick) => rings * thick;

  FRAMES[key] = {
    pad: circleFramePad,
    build: (qr, params, edge) => {
      const centre = qr.size / 2;
      const thick = params.frameThickness ?? 0.5;

      return build(centre, centre, centre + edge - FRAME_CLEARANCE, thick);
    },
    backdrop: (qr, params, outer) =>
      enclosure.path(qr.size / 2, qr.size / 2, outer - FRAME_CLEARANCE),
    fillShape: (qr, params, outer) => {
      const centre = qr.size / 2;

      return enclosure.path(
        centre,
        centre,
        outer - FRAME_CLEARANCE - inset(params.frameThickness ?? 0.5)
      );
    },
    fillContains: (qr, params, outer) => {
      const centre = qr.size / 2;

      return enclosure.contains(
        centre,
        centre,
        outer - FRAME_CLEARANCE - inset(params.frameThickness ?? 0.5)
      );
    },
  };
}

function frameClipPath(cfg, params, qrSize) {
  const frame = FRAMES[cfg.frame] ?? FRAMES.none;

  if (!frame.backdrop) {
    return null;
  }

  const qr = { size: qrSize };
  const pad = frame.pad(qr, params);
  const shift = Math.max(params.frameGap ?? 0, -(pad + params.margin));
  const outset = Math.max(0, params.framePadding ?? 0);
  const outer = qrSize / 2 + params.margin + pad + shift + outset;

  return frame.backdrop(qr, params, outer);
}

const EYE_FRAMES = {};
const EYE_INS = {};
const EFFECTS = {};

function runPoint(x, y, a, b, thick, horizontal) {
  return horizontal
    ? `${fmt(x + a)},${fmt(y + b)}`
    : `${fmt(x + thick - b)},${fmt(y + a)}`;
}

function capPolygon(points, x, y, thick, horizontal) {
  return (
    "M" +
    points.map(([a, b]) => runPoint(x, y, a, b, thick, horizontal)).join("L") +
    "z"
  );
}

const RUN_CAPS = {
  round: (x, y, len, thick, horizontal) => {
    const r = thick / 2;

    return horizontal
      ? `M${fmt(x + r)},${fmt(y)}H${fmt(x + len - r)}` +
          `A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x + len - r)},${fmt(y + thick)}` +
          `H${fmt(x + r)}A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x + r)},${fmt(y)}z`
      : `M${fmt(x)},${fmt(y + r)}` +
          `A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x + thick)},${fmt(y + r)}` +
          `V${fmt(y + len - r)}` +
          `A${fmt(r)},${fmt(r)} 0 0 1 ${fmt(x)},${fmt(y + len - r)}z`;
  },

  square: (x, y, len, thick, horizontal) => {
    const w = horizontal ? len : thick;
    const h = horizontal ? thick : len;

    return `M${fmt(x)},${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}z`;
  },

  pointed: (x, y, len, thick, horizontal) =>
    capPolygon(
      [
        [thick / 2, 0],
        [len - thick / 2, 0],
        [len, thick / 2],
        [len - thick / 2, thick],
        [thick / 2, thick],
        [0, thick / 2],
      ],
      x,
      y,
      thick,
      horizontal
    ),

  notched: (x, y, len, thick, horizontal) =>
    capPolygon(
      [
        [0, 0],
        [len, 0],
        [len - thick / 2, thick / 2],
        [len, thick],
        [0, thick],
        [thick / 2, thick / 2],
      ],
      x,
      y,
      thick,
      horizontal
    ),

  tilted: (x, y, len, thick, horizontal) =>
    capPolygon(
      [
        [thick / 2, 0],
        [len, 0],
        [len - thick / 2, thick],
        [0, thick],
      ],
      x,
      y,
      thick,
      horizontal
    ),

  asymmetric: (x, y, len, thick, horizontal) => {
    const r = thick / 2;
    const at = (a, b) => runPoint(x, y, a, b, thick, horizontal);
    const arc = `A${fmt(r)},${fmt(r)} 0 0 1 `;

    return (
      `M${at(r, 0)}L${at(len, 0)}L${at(len, thick - r)}` +
      arc +
      `${at(len - r, thick)}L${at(0, thick)}L${at(0, r)}` +
      arc +
      `${at(r, 0)}z`
    );
  },
};

const ISOLATED_SHAPES = {
  "ellipse-diagonal": (x, y, w) => {
    const rx = w * 0.5;
    const ry = w * 0.3;
    const cx = x + w / 2;
    const cy = y + w / 2;
    const k = Math.SQRT1_2;
    const arc = `A${fmt(rx)},${fmt(ry)} 45 0 1 `;

    return (
      `M${fmt(cx - rx * k)},${fmt(cy - rx * k)}` +
      arc +
      `${fmt(cx + rx * k)},${fmt(cy + rx * k)}` +
      arc +
      `${fmt(cx - rx * k)},${fmt(cy - rx * k)}z`
    );
  },
};

function runsAlong(qr, skipEyes, horizontal) {
  const rowLen = qr.size;
  const runs = [];
  const lit = (x, y) => {
    const module = qr.matrix[y * rowLen + x];

    if (!(module & Module.ON)) {
      return false;
    }

    return !(skipEyes && module & Module.FINDER);
  };

  for (let line = 0; line < rowLen; line++) {
    let start = null;

    for (let i = 0; i <= rowLen; i++) {
      const on = i < rowLen && (horizontal ? lit(i, line) : lit(line, i));

      if (on && start === null) {
        start = i;
      } else if (!on && start !== null) {
        runs.push({ start, length: i - start, line });
        start = null;
      }
    }
  }

  return runs;
}

const SIGNATURE_UNIT = 6;
const SIGNATURE_PATTERNS = {
  oriental: {
    "----": '<circle cx="3" cy="3" r="3"/>',
    "---L":
      '<path d="M0,0v6l1.3-0.4c1.1-0.4,2.4-0.4,3.5,0L6,6C6,2.7,3.3,0,0,0z"/>',
    "--D-":
      '<path d="M6,6H0v0c0-3.3,2.7-6,6-6h0L5.6,1.3c-0.4,1.1-0.4,2.4,0,3.5L6,6z"/>',
    "--DL": '<path d="M6,6H0V0l3,0c1.7,0,3,1.3,3,3V6z"/>',
    "-R--":
      '<path d="M4.7,0.4c-1.1,0.4-2.4,0.4-3.5,0L0,0c0,3.3,2.7,6,6,6V0L4.7,0.4z"/>',
    "-R-L": '<rect width="6" height="6"/>',
    "-RD-": '<path d="M6,6H0V3c0-1.7,1.3-3,3-3l3,0V6z"/>',
    "-RDL": '<rect width="6" height="6"/>',
    "U---":
      '<path d="M0,0l0.4,1.3c0.4,1.1,0.4,2.4,0,3.5L0,6c3.3,0,6-2.7,6-6H0z"/>',
    "U--L": '<path d="M3,6H0V0l6,0v3C6,4.7,4.7,6,3,6z"/>',
    "U-D-": '<rect width="6" height="6"/>',
    "U-DL": '<rect width="6" height="6"/>',
    "UR--": '<path d="M6,6H3C1.3,6,0,4.7,0,3V0l6,0V6z"/>',
    "UR-L": '<rect width="6" height="6"/>',
    "URD-": '<rect width="6" height="6"/>',
    URDL: '<rect width="6" height="6"/>',
  },
  ellipse: {
    "----":
      '<path d="M5.4,2.8C4.5,1.1,2.6-0.1,1.2,0c-1.3,0.1-1.6,1.6-0.7,3.2c1,1.7,2.8,2.9,4.2,2.8C6.1,5.9,6.4,4.4,5.4,2.8z"/>',
    "---L":
      '<path d="M6,0.8L6,0.8C6,2.2,1.4,6,0,6l0,0V0h5.2C5.6,0,6,0.4,6,0.8z"/>',
    "--D-":
      '<path d="M0.8,0L0.8,0C2.2,0,6,4.6,6,6l0,0H0V0.8C0,0.4,0.4,0,0.8,0z"/>',
    "--DL": '<path d="M0,6V0h4c1.1,0,2,0.9,2,2v4H0z"/>',
    "-R--":
      '<path d="M0,5.2L0,5.2C0,3.8,4.6,0,6,0l0,0v6H0.8C0.4,6,0,5.6,0,5.2z"/>',
    "-R-L": '<rect width="6" height="6"/>',
    "-RD-": '<path d="M6,6H0V2c0-1.1,0.9-2,2-2h4V6z"/>',
    "-RDL": '<rect width="6" height="6"/>',
    "U---":
      '<path d="M5.2,6L5.2,6C3.8,6,0,1.4,0,0l0,0h6v5.2C6,5.6,5.6,6,5.2,6z"/>',
    "U--L": '<path d="M0,0h6v4c0,1.1-0.9,2-2,2H0V0z"/>',
    "U-D-": '<rect width="6" height="6"/>',
    "U-DL": '<rect width="6" height="6"/>',
    "UR--": '<path d="M6,0v6H2C0.9,6,0,5.1,0,4V0H6z"/>',
    "UR-L": '<rect width="6" height="6"/>',
    "URD-": '<rect width="6" height="6"/>',
    URDL: '<rect width="6" height="6"/>',
  },
  origami: {
    "----":
      '<g transform="scale(0.06)"><polygon points="99.999,49.999 99.998,49.999 49.999,0 0,49.999 -0.001,49.999 -0.001,50 0,50 49.999,99.999 99.998,50 99.999,50 99.998,50"/></g>',
    "---L":
      '<g transform="scale(0.06)"><polygon points="0,100 100,50 100,50 0,0"/></g>',
    "--D-":
      '<g transform="scale(0.06)"><polygon points="100,100 50,0 50,0 0,100"/></g>',
    "-R--":
      '<g transform="scale(0.06)"><polygon points="100,100 0,50 0,50 100,0"/></g>',
    "U---":
      '<g transform="scale(0.06)"><polygon points="0,-0.001 50,99.999 50,99.999 100,-0.001"/></g>',
    "--DL":
      '<g transform="scale(0.06)"><path d="M100,34.375c0-9.505-3.354-17.611-10.059-24.316S75.131,0,65.625,0H0v100h100V34.375z"/></g>',
    "-RD-":
      '<g transform="scale(0.06)"><path d="M100,34.375V0H34.375C24.87,0,16.764,3.353,10.059,10.059S0,24.87,0,34.375V100h100V34.375z"/></g>',
    "U--L":
      '<g transform="scale(0.06)"><path d="M100,0H0v100h65.625c9.506,0,17.611-3.354,24.316-10.059S100,75.131,100,65.625V0z"/></g>',
    "UR--":
      '<g transform="scale(0.06)"><path d="M100,0H0v65.625c0,9.506,3.353,17.611,10.059,24.316S24.87,100,34.375,100H100V0z"/></g>',
  },
};

function signaturePaths(qr, params, skipEyes, shapes) {
  const rowLen = qr.size;
  const scale = params.dataScale ?? 1;
  const inset = (1 - scale) / 2;
  const unit = scale / SIGNATURE_UNIT;
  let markup = "";

  const lit = (x, y) => {
    if (x < 0 || y < 0 || x >= rowLen || y >= rowLen) {
      return false;
    }

    const module = qr.matrix[y * rowLen + x];

    if (!(module & Module.ON)) {
      return false;
    }

    return !(skipEyes && module & Module.FINDER);
  };

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (!lit(x, y)) {
        continue;
      }

      const signature =
        (lit(x, y - 1) ? "U" : "-") +
        (lit(x + 1, y) ? "R" : "-") +
        (lit(x, y + 1) ? "D" : "-") +
        (lit(x - 1, y) ? "L" : "-");

      markup +=
        `<g transform="translate(${fmt(x + inset)},${fmt(y + inset)}) scale(${fmt(unit)})">` +
        (shapes[signature] ?? '<rect width="6" height="6"/>') +
        `</g>`;
    }
  }

  return markup;
}

function signatureNeighborStamp(shapes) {
  return (x, y, w, neighbors = {}) => {
    const { up, right, down, left } = neighbors;
    const signature =
      (up ? "U" : "-") +
      (right ? "R" : "-") +
      (down ? "D" : "-") +
      (left ? "L" : "-");
    const unit = w / SIGNATURE_UNIT;

    return (
      `<g transform="translate(${fmt(x)},${fmt(y)}) scale(${fmt(unit)})">` +
      (shapes[signature] ?? '<rect width="6" height="6"/>') +
      `</g>`
    );
  };
}

function runPaths(qr, params, skipEyes, spec) {
  const scale = params.dataScale ?? 1;
  const thick = scale * (spec.thickness ?? 1);
  const along = (1 - scale) / 2;
  const across = (1 - thick) / 2;
  const cap = RUN_CAPS[spec.cap] ?? RUN_CAPS.square;
  const covered = new Set();
  let d = "";

  const emit = (horizontal) => {
    for (const { start, length, line } of runsAlong(qr, skipEyes, horizontal)) {
      if (length < 2) {
        continue;
      }

      for (let i = 0; i < length; i++) {
        covered.add(
          horizontal ? `${start + i},${line}` : `${line},${start + i}`
        );
      }

      const x = horizontal ? start + along : line + across;
      const y = horizontal ? line + across : start + along;
      d += cap(x, y, length - 1 + scale, thick, horizontal);
    }
  };

  if (spec.axes !== "vertical") {
    emit(true);
  }
  if (spec.axes !== "horizontal") {
    emit(false);
  }

  for (const { start, length, line } of runsAlong(qr, skipEyes, true)) {
    for (let i = 0; i < length; i++) {
      if (covered.has(`${start + i},${line}`)) {
        continue;
      }

      const draw = ISOLATED_SHAPES[spec.isolated];
      const ix = start + i + across;
      const iy = line + across;
      d += draw
        ? draw(ix, iy, thick)
        : shapePath(spec.isolated, ix, iy, thick, true);
    }
  }

  return d;
}

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
  const unlit = {
    ...qr,
    matrix: qr.matrix.map((cell) =>
      cell & Module.LOGO ? cell : cell ^ Module.ON
    ),
  };

  return stampModulesLinked(unlit, params, skipEyes, stamp);
}

function cornerCutPath(x, y, w, cuts, round) {
  const half = w / 2;
  const corners = [
    { cut: cuts.tl, entry: [x, y + half], exit: [x + half, y], sharp: [x, y] },
    {
      cut: cuts.tr,
      entry: [x + w - half, y],
      exit: [x + w, y + half],
      sharp: [x + w, y],
    },
    {
      cut: cuts.br,
      entry: [x + w, y + w - half],
      exit: [x + w - half, y + w],
      sharp: [x + w, y + w],
    },
    {
      cut: cuts.bl,
      entry: [x + half, y + w],
      exit: [x, y + w - half],
      sharp: [x, y + w],
    },
  ];

  let d = "";

  corners.forEach((corner, i) => {
    const [ex, ey] = corner.cut ? corner.entry : corner.sharp;
    d += `${i === 0 ? "M" : "L"}${fmt(ex)},${fmt(ey)}`;

    if (corner.cut) {
      const [ox, oy] = corner.exit;
      d += round
        ? `A${fmt(half)},${fmt(half)} 0 0 1 ${fmt(ox)},${fmt(oy)}`
        : `L${fmt(ox)},${fmt(oy)}`;
    }
  });

  return d + "Z";
}

function linkedModuleStamp(spec) {
  const round = spec.cap === "round";
  const cutting = spec.cap === "round" || spec.cap === "pointed";
  const vertGoverned = spec.axes !== "horizontal";
  const horizGoverned = spec.axes !== "vertical";
  const off = (governed, on) => !governed || !on;

  return (x, y, w, neighbors = {}) => {
    const { up, right, down, left } = neighbors;

    if (!cutting) {
      if (!up && !right && !down && !left) {
        const draw = ISOLATED_SHAPES[spec.isolated];
        return draw ? draw(x, y, w) : shapePath(spec.isolated, x, y, w, true);
      }

      return shapePath("square", x, y, w, true);
    }

    const cuts = {
      tl: off(vertGoverned, up) && off(horizGoverned, left),
      tr: off(vertGoverned, up) && off(horizGoverned, right),
      br: off(vertGoverned, down) && off(horizGoverned, right),
      bl: off(vertGoverned, down) && off(horizGoverned, left),
    };

    return cornerCutPath(x, y, w, cuts, round);
  };
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
      paint: paint(layer.fill, defs),
      clipId: layer.clip ? `qsClip${index}` : null,
      maskId,
    };
  });
  const bgPaint = paint(params.background, defs);

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
      opacityValue !== undefined ? ` opacity="${fmt(opacityValue)}"` : "";
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

      const scale = layer.fillSize
        ? 1
        : transformScale(
            layer.transform ? `transform="${layer.transform}"` : ""
          );
      const boxX = (useCanvas ? -margin : 0) / scale;
      const boxSize = (layer.fillSize ?? (useCanvas ? size : qr.size)) / scale;
      svg += `${open}<rect x="${fmt(boxX)}" y="${fmt(boxX)}" width="${fmt(boxSize)}" height="${fmt(boxSize)}" fill="${layer.paint}"${attrs}${transform}${clipAttr}${opacity} mask="url(#${layer.maskId})"/>${close}`;
      continue;
    }
    svg += layer.markup
      ? `${open}<g fill="${layer.paint}"${strokePaint}${attrs}${transform}${clipAttr}${opacity}>${layer.markup}</g>${close}`
      : `${open}<path fill="${layer.paint}"${strokePaint}${attrs}${transform}${clipAttr}${opacity} d="${layer.d}"/>${close}`;
  }

  svg += opts.afterLayers ?? "";
  return svg + `</svg>`;
}

for (const kind of Object.keys(SHAPES)) {
  PATTERNS[kind] = {
    label: kind,
    kind: "stamp",
    stamp: (x, y, w) => shapePath(kind, x, y, w, true),
  };

  EYE_FRAMES[kind] = (x, y) =>
    shapePath(kind, x, y, 7, true) + shapePath(kind, x + 1, y + 1, 5, false);

  EYE_INS[kind] = (x, y) => shapePath(kind, x + 2, y + 2, 3, true);
}

for (const [key, points] of Object.entries(POLYGON_STAMPS)) {
  PATTERNS[key] = {
    label: key,
    kind: "stamp",
    stamp: (x, y, w) => polygonStamp(points, x, y, w),
  };
}

for (const [key, stamp] of Object.entries(CURVE_STAMPS)) {
  PATTERNS[key] = { label: key, kind: "stamp", stamp };
}

const RUN_PATTERNS = {
  "special-circle": { axes: "both", cap: "round", isolated: "circle" },
  "special-circle-orizz": {
    axes: "horizontal",
    cap: "round",
    isolated: "circle",
    thickness: 5 / 6,
  },
  "special-circle-vert": {
    axes: "vertical",
    cap: "round",
    isolated: "circle",
    thickness: 5 / 6,
  },
  "square-circle": { axes: "both", cap: "square", isolated: "circle" },
  "special-diamond": { axes: "both", cap: "pointed", isolated: "diamond" },
  ribbon: { axes: "both", cap: "notched", isolated: "square" },
};

for (const [key, spec] of Object.entries(RUN_PATTERNS)) {
  PATTERNS[key] = {
    label: key,
    kind: "merge",
    build: (qr, params, skipEyes) => runPaths(qr, params, skipEyes, spec),
    linkedStamp: linkedModuleStamp(spec),
  };
}

for (const [key, shapes] of Object.entries(SIGNATURE_PATTERNS)) {
  PATTERNS[key] = {
    label: key,
    kind: "merge",
    build: (qr, params, skipEyes) => [
      { markup: signaturePaths(qr, params, skipEyes, shapes) },
    ],
    linkedStamp: signatureNeighborStamp(shapes),
    linkedMarkup: true,
  };
}

for (const key of [
  "star",
  "danger",
  "x",
  "sparkle",
  "circle-small",
  "heart",
  "special-circle-orizz",
  "special-circle-vert",
  "shake",
  "circle-mixed",
]) {
  PATTERNS[key].solidEyes = true;
}

PATTERNS.diamond.solidEyes = true;

EYE_FRAMES.blocks = (x, y) =>
  `M${x + 2},${y}h3v1h-3z` +
  `M${x},${y + 2}h1v3h-1z` +
  `M${x + 6},${y + 2}h1v3h-1z` +
  `M${x + 2},${y + 6}h3v1h-3z`;

const dotStamps = (cells) =>
  cells.map(([x, y]) => shapePath("circle", x, y, 1, true)).join("");

EYE_FRAMES.dots = (x, y) => {
  const cells = [];

  for (let i = 0; i < 7; i++) {
    cells.push([x + i, y], [x + i, y + 6]);

    if (i > 0 && i < 6) {
      cells.push([x, y + i], [x + 6, y + i]);
    }
  }

  return dotStamps(cells);
};

EYE_INS.dots = (x, y) => {
  const cells = [];

  for (let dy = 2; dy < 5; dy++) {
    for (let dx = 2; dx < 5; dx++) {
      cells.push([x + dx, y + dy]);
    }
  }

  return dotStamps(cells);
};

const shakenStamps = (cells) =>
  cells.map(([x, y]) => PATTERNS.shake.stamp(x, y, 1)).join("");

EYE_FRAMES.shaken = (x, y) => {
  const cells = [];

  for (let i = 0; i < 7; i++) {
    cells.push([x + i, y], [x + i, y + 6]);

    if (i > 0 && i < 6) {
      cells.push([x, y + i], [x + 6, y + i]);
    }
  }

  return shakenStamps(cells);
};

EYE_FRAMES.default = null;
EYE_INS.default = null;

const EYE_ORIGINS = (rowLen) => [
  [0, 0],
  [rowLen - 7, 0],
  [0, rowLen - 7],
];

const EYE_SCALE = 0.5;

const EYE_ART = {
  frame: {
    atom: '<g stroke="none"><circle cx="7" cy="1" r="1"/><circle cx="1" cy="7" r="1"/><circle cx="13" cy="7" r="1"/><circle cx="7" cy="13" r="1"/></g><path fill="none" stroke-width="0.2" d="M14.83,2.5a1.96,3 60,0,1 -15.66,9a1.96,3 60,0,1 15.66,-9M14.83,11.5a3,1.96 30,0,1 -15.66,-9a3,1.96 30,0,1 15.66,9M7,-2a1.96,3 0,0,1 0,18a1.96,3 0,0,1 0,-18"/>',
    planet:
      '<g stroke="none"><circle cx="7" cy="1" r="1"/><circle cx="1" cy="7" r="1"/><circle cx="13" cy="7" r="1"/><circle cx="7" cy="13" r="1"/></g><path fill="none" stroke-width="0.2" stroke-dasharray="1 1.3" d="M7,1a6,6 0,0,1 0,12a6,6 0,0,1 0,-12"/>',
    alien:
      '<g stroke="none"><circle cx="1" cy="1" r="1"/><circle cx="7" cy="1" r="1"/><circle cx="13" cy="1" r="1"/><circle cx="1" cy="7" r="1"/><circle cx="13" cy="7" r="1"/><circle cx="1" cy="13" r="1"/><circle cx="7" cy="13" r="1"/><circle cx="13" cy="13" r="1"/></g><g fill="none" stroke-width="0.9"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></g>',
    flurry:
      '<path d="M0.2,0.1L0.1,0.6l0.1,0.5L0.2,1.6L0.1,2.1l0.1,0.5L0,3.1l0,0.5L0,4l0.1,0.5l0,0.5l0.1,0.5L0.1,6l0,0.5l0,0.5 l0.2,0.5L0.1,8l0.1,0.5L0,8.9l0.2,0.5L0,9.9l0.2,0.5l-0.1,0.5l0,0.5L0,11.9l0.2,0.5l-0.1,0.5l0.1,0.5l0,0.4L0.6,14l0.5,0l0.5-0.1 l0.5,0.1l0.5,0.1L3.1,14l0.5-0.1l0.5-0.1l0.5,0L5,13.9l0.5-0.1l0.5,0l0.5,0L7,13.9L7.5,14L8,14l0.5-0.2L9,13.9L9.4,14l0.5-0.2 l0.5,0.2l0.5-0.1l0.5,0l0.5-0.1l0.5,0l0.5,0l0.5,0l0.5,0.1l-0.1-0.5l0.2-0.5l-0.1-0.5l-0.1-0.5l0.2-0.5l-0.2-0.5l0.1-0.5L14,9.9 l-0.2-0.5L13.9,9L14,8.5L14,8l-0.2-0.5l0-0.5l0.1-0.5L13.8,6l0-0.5L14,5l0-0.5l-0.1-0.5l0.1-0.5l-0.2-0.5l0.1-0.5l0-0.5l0-0.5 l-0.1-0.5L14,0.6l-0.2-0.4l-0.4,0l-0.5,0L12.4,0l-0.5,0.2l-0.5,0l-0.5-0.1l-0.5,0L10,0l-0.5,0L9,0L8.5,0.2L8,0.2L7.5,0.1L7,0.1 L6.5,0.2L6,0L5.5,0.2L5.1,0.2L4.6,0.1L4.1,0.1L3.6,0L3.1,0.1L2.6,0L2.1,0.1l-0.5,0l-0.5,0L0.6,0.2L0.2,0.1z M11.9,11.9l-0.5-0.1 L10.9,12l-0.5-0.1L10,11.9l-0.5,0.1L9,11.8l-0.5,0l-0.5,0l-0.5,0.1l-0.5,0L6.5,12L6,11.9l-0.5,0l-0.5,0L4.6,12l-0.5-0.2L3.6,12 l-0.5-0.1L2.6,12l-0.4-0.1L2,11.4l0.1-0.5l0-0.5l0.1-0.5L2,9.5L2.1,9L2,8.5L2,8l0.2-0.5l0-0.5L2,6.5L2.1,6l0.1-0.5L2.2,5L2.1,4.5 L2,4.1l0-0.5l0.2-0.5L2,2.6L2,2l0.5,0l0.5,0.1l0.5,0.1l0.5,0L4.5,2L5,2.1l0.5,0.1L6,2l0.5,0.2L7,2.1l0.5,0L8,2l0.5,0L9,2l0.5,0 l0.5,0.1L10.4,2l0.5,0.2L11.4,2L12,2l-0.1,0.6L12,3.1l-0.1,0.5L11.8,4L12,4.5L11.9,5l-0.1,0.5l0,0.5L12,6.5L12,7l-0.1,0.5L12,8 l0,0.5l-0.2,0.5l0,0.5l0.1,0.5l-0.1,0.5l0.2,0.5l-0.1,0.5L11.9,11.9z"></path>',
    sdoz: '<path d="M0,0l0.9,13c0,0.6,0.5,1,1,1h12V2c0-0.6-0.4-1-1-1L0,0z M12,12H3.8c-0.5,0-1-0.4-1-1L2,2l9,0.7c0.5,0,1,0.5,1,1 V12z"></path>',
    drop_in:
      '<path d="M0,0l0,7c0,3.9,3.1,7,7,7h0c3.9,0,7-3.1,7-7v0c0-3.9-3.1-7-7-7H0z M7,12L7,12c-2.8,0-5-2.2-5-5V2h5c2.8,0,5,2.2,5,5v0 C12,9.8,9.8,12,7,12z"></path>',
    drop: '<path d="M0,7L0,7c0,3.9,3.1,7,7,7h7V7c0-3.9-3.1-7-7-7h0C3.1,0,0,3.1,0,7z M12,12H7c-2.8,0-5-2.2-5-5v0c0-2.8,2.2-5,5-5h0 c2.8,0,5,2.2,5,5V12z"></path>',
    dropeye:
      '<path d="M0,0l0,7c0,3.9,3.1,7,7,7h7V7c0-3.9-3.1-7-7-7H0z M12,12H7c-2.8,0-5-2.2-5-5V2h5c2.8,0,5,2.2,5,5V12z"></path>',
    dropeyeleft:
      '<path d="M0,0l0,7c0,3.9,3.1,7,7,7h7V7c0-3.9-3.1-7-7-7H0z M12,12H7c-2.8,0-5-2.2-5-5v0c0-2.8,2.2-5,5-5h0c2.8,0,5,2.2,5,5V12z"></path>',
    dropeyeleaf:
      '<path d="M0,0l0,7c0,3.9,3.1,7,7,7h7V7c0-3.9-3.1-7-7-7H0z M7,12L7,12c-2.8,0-5-2.2-5-5v0c0-2.8,2.2-5,5-5h0c2.8,0,5,2.2,5,5v0 C12,9.8,9.8,12,7,12z"></path>',
    dropeyeright:
      '<path d="M0,0l0,7c0,3.9,3.1,7,7,7h7V7c0-3.9-3.1-7-7-7H0z M7,12L7,12c-2.8,0-5-2.2-5-5V2h5c2.8,0,5,2.2,5,5v0C12,9.8,9.8,12,7,12z"></path>',
    squarecircle:
      '<path d="M0,0l0,14h14V0H0z M7,12L7,12c-2.8,0-5-2.2-5-5v0c0-2.8,2.2-5,5-5h0c2.8,0,5,2.2,5,5v0C12,9.8,9.8,12,7,12z"></path>',
    flower:
      '<path d="M0,0v9.6C0,12,2,14,4.4,14h5.1C12,14,14,12,14,9.6V4.4C14,2,12,0,9.6,0H0z M9.2,12H4.8C3.3,12,2,10.7,2,9.2V2h7.2 C10.7,2,12,3.3,12,4.8v4.4C12,10.7,10.7,12,9.2,12z"></path>',
    flower_in:
      '<path d="M14,14V4.4C14,2,12,0,9.6,0H4.4C2,0,0,2,0,4.4v5.1C0,12,2,14,4.4,14H14z M4.8,2h4.4C10.7,2,12,3.3,12,4.8V12H4.8 C3.3,12,2,10.7,2,9.2V4.8C2,3.3,3.3,2,4.8,2z"></path>',
    leaf: '<path d="M0,0v9.6C0,12,2,14,4.4,14H14V4.4C14,2,12,0,9.6,0H0z M12,12H4.8C3.3,12,2,10.7,2,9.2V2h7.2C10.7,2,12,3.3,12,4.8V12z"></path>',
    ninja:
      '<g transform="matrix(.14286 0 0 .14286 -.14278 -.14278)"> <path d="m90.252 34.183c-0.979 0.471-1.6 0.789-2.235 1.072-2.591 1.156-5.125 1.39-7.531-0.493-0.551-0.433-1.165-0.782-1.719-1.214-6.562-5.124-13.069-10.319-19.692-15.363-5.26-4.007-11.032-7.082-17.513-8.553-2.244-0.51-4.576-0.621-6.752-0.899 0.199 1.866 0.591 3.438 0.486 4.979-0.263 3.846-2.177 7.049-4.466 9.995-4.26 5.48-8.739 10.79-12.883 16.355-4.244 5.702-7.29 12.033-8.378 19.171-0.288 1.895-0.371 3.822-0.565 5.925 1.218-0.539 2.046-0.975 2.921-1.276 2.396-0.828 4.671-1.013 6.837 0.831 4.991 4.25 10.068 8.397 15.114 12.581 7.517 6.231 15.531 11.476 25.453 12.85 1.803 0.25 3.635 0.313 5.685 0.485-0.469-1.011-0.821-1.669-1.085-2.363-0.798-2.1-1.517-4.283-0.115-6.349 1.392-2.052 2.986-3.97 4.544-5.904 4.282-5.325 8.742-10.515 12.848-15.977 4.712-6.27 7.873-13.297 8.757-21.22 0.159-1.453 0.184-2.919 0.289-4.633z" fill="none"></path> <path d="m88.082 69.946c2.253-6.309 4.971-12.447 7.359-18.711 2.374-6.227 3.859-12.637 3.507-19.397-0.345-6.622-1.721-13.027-3.699-19.319-0.647-2.062-1.387-4.094-2.041-6.018-0.766 1.416-1.323 2.899-2.256 4.082-3.325 4.22-10.951 5.614-16.381 3.188-9.181-4.1-18.491-7.846-28.259-10.33-5.229-1.33-10.519-2.186-15.91-2.397-8.308-0.324-16.264 1.105-23.691 4.744 1.794 1.395 3.706 2.61 5.289 4.167 3.832 3.769 4.606 9.094 2.172 13.868-4.896 9.601-9.026 19.492-11.332 30.083-2.316 10.64-2.745 21.26 0.459 31.808 0.764 2.515 1.789 4.951 2.686 7.398 0.343-0.102 0.41-0.102 0.428-0.129 0.141-0.239 0.277-0.483 0.409-0.729 2.039-3.829 5.01-6.359 9.4-6.998 3.832-0.558 7.474 0.184 10.903 1.803 2.611 1.233 5.011 2.914 7.594 4.217 9.143 4.611 18.84 7.148 29.059 7.63 6.001 0.281 11.975-0.061 17.87-1.178 3.732-0.708 7.399-1.765 11.499-2.765-0.738-0.552-1.117-0.793-1.448-1.092-1.83-1.654-3.792-3.194-5.431-5.028-1.46-1.64-2.328-3.757-1.767-6.019 1.077-4.323 2.087-8.691 3.581-12.878zm-6.878-9.912c-4.104 5.46-8.566 10.651-12.849 15.977-1.556 1.937-3.152 3.854-4.544 5.904-1.4 2.064-0.683 4.249 0.116 6.349 0.265 0.694 0.617 1.353 1.086 2.363-2.05-0.172-3.882-0.235-5.687-0.485-9.921-1.374-17.936-6.618-25.452-12.85-5.046-4.184-10.124-8.331-15.114-12.581-2.165-1.844-4.44-1.659-6.837-0.831-0.875 0.302-1.703 0.737-2.921 1.276 0.195-2.103 0.277-4.03 0.565-5.925 1.088-7.138 4.134-13.468 8.378-19.171 4.144-5.566 8.623-10.876 12.883-16.355 2.29-2.946 4.204-6.148 4.466-9.995 0.104-1.54-0.287-3.113-0.486-4.979 2.176 0.278 4.509 0.389 6.752 0.899 6.48 1.471 12.254 4.546 17.513 8.553 6.622 5.044 13.13 10.24 19.693 15.363 0.552 0.431 1.166 0.782 1.719 1.214 2.404 1.882 4.938 1.649 7.53 0.493 0.635-0.283 1.257-0.601 2.235-1.072-0.104 1.715-0.13 3.181-0.293 4.633-0.88 7.923-4.042 14.951-8.753 21.22z"></path> </g>',
    "round-corner":
      '<g transform="matrix(0 .14 -.14 0 14 0)"><path d="m33.78 85h51.22v-70h-69.996l0.016 50.855c0 10.559 8.416 19.145 18.76 19.145z" fill="none"></path><path d="m100 100v-65.859-34.141h-33.75-66.25l0.02 65.859c0 18.821 15.14 34.141 33.76 34.141h32.47zm-15-15h-51.22c-10.344 0-18.76-8.586-18.76-19.145l-0.016-50.855h69.996z"></path> </g>',
    balls:
      '<g transform="matrix(.14 0 0 .14 0 0)"> <path d="m90.055 71.25c-2.942-1.016-5.055-3.799-5.055-7.084s2.113-6.066 5.052-7.084c-2.939-1.016-5.052-3.799-5.052-7.082 0-3.284 2.113-6.068 5.052-7.083-2.939-1.018-5.052-3.8-5.052-7.084s2.113-6.067 5.052-7.083c-2.939-1.017-5.052-3.799-5.052-7.083s2.113-6.068 5.053-7.083c-2.171-0.75-3.886-2.464-4.636-4.635-1.017 2.938-3.799 5.051-7.083 5.051-3.285 0-6.068-2.114-7.084-5.055-1.016 2.941-3.799 5.055-7.084 5.055-3.284 0-6.066-2.113-7.083-5.051-1.017 2.938-3.799 5.051-7.083 5.051s-6.068-2.113-7.083-5.052c-1.017 2.939-3.8 5.052-7.084 5.052s-6.067-2.113-7.083-5.051c-1.016 2.938-3.799 5.051-7.083 5.051s-6.068-2.114-7.083-5.054c-0.75 2.172-2.465 3.887-4.636 4.637 2.938 1.016 5.052 3.8 5.052 7.084s-2.114 6.066-5.052 7.083c2.939 1.016 5.052 3.799 5.052 7.083s-2.113 6.066-5.052 7.083c2.939 1.016 5.052 3.799 5.052 7.084s-2.113 6.068-5.051 7.082c2.938 1.018 5.051 3.799 5.051 7.084s-2.115 6.068-5.055 7.084c2.941 1.016 5.055 3.799 5.055 7.084 0 3.283-2.114 6.066-5.052 7.082 2.17 0.75 3.885 2.465 4.635 4.635 1.016-2.938 3.8-5.051 7.084-5.051s6.067 2.113 7.083 5.051c1.016-2.938 3.799-5.051 7.083-5.051s6.067 2.113 7.083 5.051c1.016-2.938 3.799-5.051 7.084-5.051s6.068 2.113 7.083 5.051c1.017-2.938 3.799-5.051 7.083-5.051 3.285 0 6.068 2.113 7.084 5.055 1.016-2.942 3.799-5.055 7.084-5.055 3.284 0 6.066 2.113 7.083 5.051 0.75-2.17 2.465-3.885 4.635-4.635-2.939-1.016-5.052-3.799-5.052-7.082 0-3.285 2.113-6.068 5.055-7.084z" fill="none"></path> <path d="m100 21.667c0-3.284-2.113-6.068-5.053-7.083 2.94-1.017 5.053-3.8 5.053-7.084 0-4.144-3.357-7.5-7.5-7.5-3.284 0-6.066 2.112-7.083 5.051-1.017-2.939-3.799-5.051-7.083-5.051-3.285 0-6.068 2.114-7.084 5.054-1.016-2.94-3.799-5.054-7.084-5.054-3.284 0-6.066 2.112-7.083 5.051-1.017-2.939-3.799-5.051-7.083-5.051s-6.068 2.112-7.083 5.052c-1.017-2.94-3.8-5.052-7.084-5.052s-6.067 2.112-7.083 5.051c-1.016-2.939-3.799-5.051-7.083-5.051s-6.068 2.114-7.083 5.053c-1.016-2.939-3.8-5.053-7.084-5.053-4.143 0-7.5 3.356-7.5 7.5 0 3.284 2.114 6.067 5.053 7.083-2.939 1.016-5.053 3.8-5.053 7.084s2.113 6.066 5.051 7.083c-2.938 1.016-5.051 3.799-5.051 7.083s2.113 6.066 5.052 7.083c-2.939 1.016-5.052 3.799-5.052 7.084s2.113 6.068 5.051 7.082c-2.938 1.018-5.051 3.799-5.051 7.084s2.114 6.068 5.054 7.084c-2.94 1.016-5.054 3.799-5.054 7.084 0 3.283 2.113 6.066 5.051 7.082-2.938 1.018-5.051 3.799-5.051 7.084 0 4.143 3.357 7.5 7.5 7.5 0.518 0 1.023-0.053 1.512-0.152 2.608-0.533 4.716-2.426 5.572-4.898 1.015 2.938 3.799 5.051 7.083 5.051s6.067-2.111 7.083-5.051c1.016 2.938 3.799 5.051 7.083 5.051s6.067-2.111 7.083-5.051c1.016 2.937 3.799 5.05 7.084 5.05s6.068-2.113 7.083-5.053c1.017 2.938 3.799 5.053 7.083 5.053 3.285 0 6.068-2.115 7.084-5.055 1.016 2.939 3.799 5.055 7.084 5.055 3.284 0 6.066-2.113 7.083-5.053 1.017 2.94 3.799 5.053 7.083 5.053 4.143 0 7.5-3.357 7.5-7.5 0-3.285-2.113-6.066-5.052-7.084 2.939-1.016 5.052-3.799 5.052-7.082 0-3.285-2.113-6.068-5.055-7.084 2.939-1.016 5.055-3.799 5.055-7.084s-2.113-6.066-5.052-7.084c2.939-1.016 5.052-3.799 5.052-7.082 0-3.284-2.113-6.068-5.052-7.083 2.938-1.018 5.052-3.8 5.052-7.084s-2.113-6.067-5.052-7.083c2.939-1.017 5.052-3.799 5.052-7.083zm-9.948 63.749c-2.17 0.75-3.885 2.465-4.635 4.635-1.017-2.938-3.799-5.051-7.083-5.051-3.285 0-6.068 2.113-7.084 5.055-1.016-2.942-3.799-5.055-7.084-5.055-3.284 0-6.066 2.113-7.083 5.051-1.017-2.938-3.799-5.051-7.083-5.051s-6.068 2.113-7.083 5.051c-1.017-2.938-3.8-5.051-7.084-5.051s-6.067 2.113-7.083 5.051c-1.016-2.938-3.799-5.051-7.083-5.051s-6.068 2.113-7.083 5.051c-0.75-2.17-2.465-3.885-4.635-4.635 2.938-1.016 5.051-3.799 5.051-7.082 0-3.285-2.115-6.068-5.055-7.084 2.941-1.016 5.055-3.799 5.055-7.084s-2.114-6.066-5.052-7.084c2.939-1.016 5.052-3.799 5.052-7.082 0-3.284-2.113-6.068-5.052-7.083 2.939-1.018 5.052-3.8 5.052-7.084s-2.113-6.067-5.051-7.083c2.938-1.017 5.051-3.799 5.051-7.083s-2.114-6.068-5.053-7.083c2.171-0.75 3.886-2.465 4.636-4.636 1.016 2.938 3.8 5.052 7.084 5.052s6.067-2.113 7.083-5.051c1.016 2.938 3.799 5.051 7.083 5.051s6.067-2.113 7.083-5.052c1.016 2.939 3.799 5.052 7.084 5.052s6.068-2.113 7.083-5.051c1.017 2.938 3.799 5.051 7.083 5.051 3.285 0 6.068-2.114 7.084-5.055 1.016 2.941 3.799 5.055 7.084 5.055 3.284 0 6.066-2.113 7.083-5.051 0.75 2.17 2.465 3.885 4.636 4.635-2.94 1.015-5.053 3.799-5.053 7.083s2.113 6.066 5.052 7.083c-2.939 1.016-5.052 3.799-5.052 7.083s2.113 6.066 5.052 7.083c-2.939 1.016-5.052 3.799-5.052 7.084s2.113 6.068 5.052 7.082c-2.939 1.018-5.052 3.799-5.052 7.084s2.113 6.068 5.055 7.084c-2.942 1.016-5.055 3.799-5.055 7.084 0 3.283 2.113 6.066 5.052 7.082z"></path> </g>',
    comic:
      '<path d="m5.4274 13.99c-0.92878 2.8e-4 -1.8576-8.4e-4 -2.7862-5.6e-4 -0.46439 2.8e-4 -0.92878 5.6e-4 -1.3932 0.0015-0.22288 7e-4 -0.44577 0.0013-0.66865 0.0018-0.13048 2.8e-4 -0.28673 0.02212-0.41497-0.01316-0.087782-0.02436-0.11396-0.1001-0.11284-0.18424 0.0028001-0.20174 0.072522-0.40937 0.10626-0.60789 0.076022-0.44703 0.1246-0.89826 0.16562-1.3501 0.083022-0.9138 0.15904-1.8301 0.18858-2.7478 0.029261-0.91058 4.2e-4 -1.8241-0.093802-2.7298-0.046341-0.44641-0.1113-0.89134-0.20286-1.3311-0.084422-0.40503-0.1841-0.80068-0.20846-1.2155-0.045921-0.7815 0.1358-1.5524 0.54573-2.2209 0.38263-0.62413 0.9586-1.0565 1.6428-1.3051 0.83652-0.30381 1.7201-0.28687 2.5965-0.28407 0.92388 0.0029401 1.8476-0.0030801 2.7716-0.0033601 0.9236-4.2001e-4 1.8469 0.0047601 2.7708 0.030101 0.69176 0.01918 1.3872 0.14266 1.9953 0.48945 0.64583 0.36807 1.1476 0.9607 1.3869 1.6659 0.27399 0.8088 0.25579 1.7167 0.25705 2.5608 0.0024 1.8258 0.05992 3.6576-0.0029 5.4828-0.02464 0.70576-0.1603 1.4203-0.52333 2.0347-0.38473 0.65116-0.99248 1.135-1.6947 1.4049-0.81818 0.31445-1.6872 0.33895-2.5523 0.32397-0.90862-0.01554-1.8172 0.0066-2.7263 2e-3 -0.34903-0.0015-0.69792-0.0043-1.0467-0.0043-1.6718 2.8e-4 0.91786 0 0 0zm0.39887-2.004c0-0.0098 2.5009-0.0038 2.7378-0.0063 0.44087-0.0032 0.88776 0.01176 1.3212-0.08456 0.37437-0.08288 0.73264-0.23675 1.0469-0.45725 0.51563-0.36149 0.85304-0.90134 0.9565-1.5217 0.06692-0.40027 0.04494-0.81622 0.04858-1.2207 0.0038-0.46593 0.0046-0.93158 0.0029-1.3975-2e-3 -0.46593-6e-3 -0.93172-0.01232-1.3975-0.0057-0.44213 0.01092-0.88594-0.0074-1.3274-0.0287-0.69162-0.23128-1.4096-0.73964-1.9053-0.21294-0.20762-0.47335-0.36289-0.75854-0.44801-0.37437-0.11158-0.78346-0.098982-1.1699-0.11998-0.92388-0.051101-1.8487-0.088902-2.7742-0.087222-0.46243 8.4e-4 -0.925 0.01176-1.3869 0.035561-0.41273 0.02128-0.8452 0.025481-1.2505 0.11186-0.60117 0.12852-1.1379 0.50583-1.4556 1.0334-0.41385 0.68728-0.33923 1.4507-0.20622 2.2079 0.15736 0.8963 0.19362 1.8009 0.19236 2.7089-8.4e-4 0.67384-0.01862 1.3428-0.089462 2.0134-0.034301 0.32425-0.075742 0.64794-0.1183 0.97134-0.021281 0.16184-0.042981 0.32369-0.064121 0.48525-0.01246 0.0959-0.034721 0.2107 0.01218 0.30115 0.091982 0.17738 0.43415 0.10962 0.58633 0.10794 0.35379-0.0034 0.70772-0.0052 1.0615-0.0055 0.68854-9.8e-4 1.3776 0.0022 2.0667 0.0022 0-0.0025-1.136 0 0 0z" stroke-width=".14"></path>',
    emblema:
      '<g transform="matrix(.14 0 0 .14 0 .0084)"> <path d="m84.997 28.739c-6.046-2.982-10.777-7.683-13.907-13.799h-43.34c-0.562 0.145-1.072 0.269-1.496 0.372l-0.125 0.031c-1.139 0.282-2.316 0.573-2.943 0.839-1.639 0.692-3.165 2.181-4.602 3.719-1.336 1.423-2.205 2.952-2.648 4.662l-0.112 0.514c-0.38 1.713-0.811 3.652-0.824 4.807l0.08 22.687-0.077 18.571c6.039 2.979 10.769 7.678 13.905 13.798h43.357c0.575-0.149 1.085-0.275 1.481-0.371l0.125-0.031c1.14-0.282 2.318-0.573 2.971-0.849 1.606-0.676 3.143-2.171 4.56-3.684 1.349-1.439 2.224-2.98 2.667-4.702l0.108-0.5c0.38-1.712 0.811-3.651 0.823-4.808l-0.08-22.686z" fill="none"></path> <path d="m100 27.994c0-6.328-2.49-10.162-7.49-12.305-4.319-1.842-7.38-5.196-9.109-9.992-1.391-3.875-4.261-5.757-8.761-5.757h-0.09-48.72c-0.06 0.01-0.13 0-0.19 0.02-0.98 0.3-2 0.55-2.99 0.791-1.74 0.431-3.55 0.871-5.3 1.612-4.22 1.782-7.27 4.666-9.7 7.269-3.3 3.514-5.46 7.579-6.45 12.064l-0.02 0.13c-0.58 2.613-1.17 5.327-1.18 8.04l0.08 22.757-0.08 19.264c0 6.327 2.49 10.161 7.49 12.305 4.32 1.842 7.38 5.206 9.11 9.991 1.39 3.875 4.26 5.757 8.76 5.757h0.09 0.38 48.34 0.01 0.181v-0.02c0.979-0.29 2-0.551 2.989-0.791 1.74-0.431 3.551-0.871 5.301-1.611 4.22-1.772 7.27-4.666 9.699-7.259 3.301-3.524 5.46-7.59 6.45-12.074l0.021-0.131c0.58-2.613 1.17-5.316 1.18-8.039l-0.08-22.758zm-15.823 46.809-0.108 0.5c-0.443 1.722-1.318 3.263-2.667 4.702-1.417 1.513-2.953 3.008-4.56 3.684-0.652 0.275-1.831 0.566-2.971 0.849l-0.125 0.031c-0.396 0.096-0.906 0.222-1.481 0.371h-43.357c-3.136-6.12-7.866-10.819-13.905-13.798l0.077-18.572-0.08-22.686c0.013-1.155 0.443-3.094 0.824-4.807l0.112-0.514c0.443-1.71 1.312-3.239 2.648-4.662 1.437-1.539 2.963-3.027 4.602-3.719 0.627-0.266 1.805-0.557 2.943-0.839l0.125-0.031c0.424-0.103 0.934-0.227 1.496-0.372h43.34c3.13 6.116 7.861 10.817 13.907 13.799l-0.077 18.57 0.08 22.686c-0.013 1.156-0.443 3.096-0.823 4.808z"></path> </g>',
    stamp:
      '<g transform="matrix(.14 0 0 .14 0 0)"> <polygon fill="none" points="87.791 40.332 85 35.498 87.791 30.665 85 25.831 87.791 20.997 85 16.163 86.589 13.411 83.837 15 79.004 12.209 74.17 15 69.336 12.209 64.502 15 59.668 12.209 54.834 15 50 12.209 45.166 15 40.332 12.209 35.498 15 30.665 12.209 25.831 15 20.997 12.209 16.163 15 13.412 13.412 15 16.163 12.209 20.997 15 25.831 12.209 30.665 15 35.498 12.209 40.332 15 45.166 12.209 50 15 54.834 12.209 59.668 15 64.502 12.209 69.336 15 74.17 12.209 79.004 15 83.837 13.411 86.589 16.163 85 20.997 87.791 25.831 85 30.665 87.791 35.498 85 40.332 87.791 45.166 85 50 87.791 54.834 85 59.668 87.791 64.502 85 69.336 87.791 74.17 85 79.004 87.791 83.837 85 86.589 86.589 85 83.837 87.791 79.004 85 74.17 87.791 69.336 85 64.502 87.791 59.668 85 54.834 87.791 50 85 45.166"></polygon> <path d="M 97.623,2.377 96.25,0 h -7.5 L 87.521,2.127 83.837,0 79.004,2.791 74.17,0 69.336,2.791 64.502,0 59.668,2.791 54.834,0 50,2.791 45.166,0 40.332,2.791 35.498,0 30.665,2.791 25.831,0 20.997,2.791 16.163,0 12.478,2.127 11.25,0 H 3.75 L 2.377,2.377 0,3.75 v 7.5 L 2.127,12.478 0,16.163 2.791,20.997 0,25.831 2.791,30.664 0,35.498 2.791,40.332 0,45.166 2.791,50 0,54.834 2.791,59.668 0,64.502 2.791,69.336 0,74.17 2.791,79.004 0,83.837 2.127,87.522 0,88.75 v 7.5 L 2.377,97.623 3.75,100 h 7.5 L 12.478,97.873 16.163,100 20.997,97.209 25.831,100 30.664,97.209 35.498,100 40.332,97.209 45.166,100 50,97.209 54.834,100 59.668,97.209 64.502,100 69.336,97.209 74.17,100 79.004,97.209 83.837,100 87.522,97.873 88.75,100 h 7.5 L 97.623,97.623 100,96.25 v -7.5 L 97.873,87.521 100,83.837 97.209,79.004 100,74.17 97.209,69.336 100,64.502 97.209,59.668 100,54.834 97.209,50 100,45.166 97.209,40.332 100,35.498 97.209,30.665 100,25.831 97.209,20.997 100,16.163 97.873,12.478 100,11.25 V 3.75 Z M 79.004,87.791 74.17,85 69.336,87.791 64.502,85 59.668,87.791 54.834,85 50,87.791 45.166,85 40.332,87.791 35.498,85 30.665,87.791 25.831,85 20.997,87.791 16.163,85 13.412,86.589 15,83.837 12.209,79.004 15,74.17 12.209,69.336 15,64.502 12.209,59.668 15,54.834 12.209,50 15,45.166 12.209,40.332 15,35.498 12.209,30.665 15,25.831 12.209,20.997 15,16.163 13.412,13.412 16.163,15 20.997,12.209 25.831,15 30.664,12.209 35.498,15 40.332,12.209 45.166,15 50,12.209 54.834,15 59.668,12.209 64.502,15 69.336,12.209 74.17,15 79.004,12.209 83.837,15 86.589,13.411 85,16.163 87.791,20.997 85,25.831 87.791,30.664 85,35.498 87.791,40.332 85,45.166 87.791,50 85,54.834 87.791,59.668 85,64.502 87.791,69.336 85,74.17 87.791,79.004 85,83.837 86.589,86.589 83.837,85 Z"></path> </g>',
    jungle:
      '<g transform="matrix(.14 0 0 .14 0 0)"><path fill-rule="evenodd" d="M21.475,99.992c-6.648,0-12.964-6.852-13.958-13.207L0.011-0.008l88.112,5.649c6.212,0.931,11.096,6.804,11.104,13.848 l0.762,80.503H21.475z M85.706,85.71l-0.544-57.492c-0.005-5.029-3.495-9.233-7.931-9.898l-62.938-4.03l5.36,61.98 c0.71,4.536,5.222,9.44,9.971,9.44H85.706z"></path></g>',
  },
  in: {
    drop_in:
      '<path d="M3,6L3,6C1.3,6,0,4.7,0,3l0-3l3,0c1.7,0,3,1.3,3,3v0C6,4.7,4.7,6,3,6z"></path>',
    flurry:
      '<polygon points="5.9,5.9 5.6,5.9 5.3,6 5,5.7 4.7,5.8 4.4,5.8 4.1,5.8 3.9,5.7 3.6,5.7 3.3,5.8 3,5.9 2.7,5.8 2.4,5.8 2.1,5.8 1.9,5.7 1.6,5.7 1.3,5.7 1,5.8 0.7,5.8 0.4,5.8 0.1,5.9 0,5.5 0.1,5.3 0,5 0.3,4.7 0.3,4.4 0.2,4.1 0.2,3.8 0.1,3.5 0.3,3.3 0.1,3 0.1,2.7 0.2,2.4 0.1,2.1 0.1,1.8 0.1,1.5 0.2,1.3 0.3,1 0,0.7 0,0.4 0.3,0.2 0.4,0.1 0.7,0.1 1,0.2 1.3,0.1 1.6,0.3 1.9,0.1 2.1,0.1 2.4,0.2 2.7,0.1 3,0.3 3.3,0.2 3.6,0.2 3.8,0.2 4.1,0.1 4.4,0.3 4.7,0.1 5,0.2 5.3,0.1 5.6,0 5.9,0 5.8,0.4 6,0.7 6,1 5.9,1.2 5.7,1.5 5.7,1.8 5.9,2.1 5.7,2.4 5.8,2.7 6,3 5.9,3.3 5.8,3.5 5.8,3.8 5.8,4.1 6,4.4 5.8,4.7 5.7,5 5.7,5.3 5.8,5.5"></polygon>',
    sdoz: '<polygon points="6,6 0.5,6 0,0 6,0.5"></polygon>',
    drop: '<path d="M6,6H3C1.3,6,0,4.7,0,3v0c0-1.7,1.3-3,3-3h0c1.7,0,3,1.3,3,3V6z"></path>',
    dropeye:
      '<path d="M6,6H3C1.3,6,0,4.7,0,3l0-3l3,0c1.7,0,3,1.3,3,3V6z"></path>',
    sun: '<polygon points="3,0 3.4,0.7 4,0.2 4.1,0.9 4.9,0.7 4.8,1.5 5.6,1.5 5.2,2.2 5.9,2.5 5.3,3 5.9,3.5 5.2,3.8 5.6,4.5 4.8,4.5 4.9,5.3 4.1,5.1 4,5.8 3.4,5.3 3,6 2.5,5.3 1.9,5.8 1.8,5.1 1,5.3 1.1,4.5 0.4,4.5 0.7,3.8 0,3.5 0.6,3 0,2.5 0.7,2.2 0.4,1.5 1.1,1.5 1,0.7 1.8,0.9 1.9,0.2 2.5,0.7"></polygon>',
    star: '<path d="M3.2,0.3l0.6,1.3C4,1.8,4.1,1.9,4.3,1.9l1.4,0.2c0.2,0,0.3,0.3,0.2,0.5l-1,1C4.7,3.7,4.7,3.9,4.7,4.1L5,5.5 c0,0.2-0.2,0.4-0.4,0.3L3.3,5.2c-0.2-0.1-0.4-0.1-0.6,0L1.4,5.8C1.2,5.9,1,5.8,1,5.5l0.2-1.4c0-0.2,0-0.4-0.2-0.5l-1-1 C-0.1,2.4,0,2.2,0.2,2.1l1.4-0.2c0.2,0,0.4-0.2,0.5-0.3l0.6-1.3C2.9,0.1,3.1,0.1,3.2,0.3z"></path>',
    sparkle:
      '<path d="M3,7.2L2.7,5.6C2.4,4.5,1.5,3.6,0.4,3.3L-1.2,3l1.6-0.3c1.2-0.2,2.1-1.1,2.3-2.3L3-1.2l0.3,1.6 c0.2,1.2,1.1,2.1,2.3,2.3L7.2,3L5.6,3.3C4.5,3.6,3.6,4.5,3.3,5.6L3,7.2z"></path>',
    danger:
      '<polygon points="3,5.1 3.9,6 6,6 6,3.9 5.1,3 6,2.1 6,0 3.9,0 3,0.9 2.1,0 0,0 0,2.1 0.9,3 0,3.9 0,6 2.1,6"></polygon>',
    cross:
      '<polygon points="6,1.5 4.5,1.5 4.5,0 1.5,0 1.5,1.5 0,1.5 0,4.5 1.5,4.5 1.5,6 4.5,6 4.5,4.5 6,4.5"></polygon>',
    plus: '<path d="M4.5,1.5L4.5,1.5L4.5,1.5C4.5,0.7,3.8,0,3,0h0C2.2,0,1.5,0.7,1.5,1.5v0h0C0.7,1.5,0,2.2,0,3v0 c0,0.8,0.7,1.5,1.5,1.5h0v0C1.5,5.3,2.2,6,3,6h0c0.8,0,1.5-0.7,1.5-1.5v0h0C5.3,4.5,6,3.8,6,3v0C6,2.2,5.3,1.5,4.5,1.5z"></path>',
    x: '<path d="M3,5.1l0.4,0.4C3.7,5.8,4.1,6,4.5,6h0C5.3,6,6,5.3,6,4.5v0c0-0.4-0.2-0.8-0.4-1.1L5.1,3l0.4-0.4 C5.8,2.3,6,1.9,6,1.5v0C6,0.7,5.3,0,4.5,0h0C4.1,0,3.7,0.2,3.4,0.4L3,0.9L2.6,0.4C2.3,0.2,1.9,0,1.5,0h0C0.7,0,0,0.7,0,1.5v0 c0,0.4,0.2,0.8,0.4,1.1L0.9,3L0.4,3.4C0.2,3.7,0,4.1,0,4.5v0C0,5.3,0.7,6,1.5,6h0c0.4,0,0.8-0.2,1.1-0.4L3,5.1z"></path>',
    heart:
      '<path d="M6,1.8C5.9,1,5.3,0.4,4.5,0.3C3.9,0.2,3.4,0.5,3,0.9C2.6,0.5,2.1,0.3,1.6,0.3C0.8,0.4,0.1,1,0,1.8 C0,2.3,0.1,2.7,0.3,3l0,0l0,0c0.1,0.1,0.2,0.2,0.3,0.3l1.9,2.2c0.3,0.3,0.7,0.3,0.9,0l1.8-1.9c0.1-0.1,0.3-0.3,0.4-0.5 C5.9,2.8,6.1,2.3,6,1.8z"></path>',
    ninja:
      '<g transform="matrix(.061224 0 0 .061224 -.061224 -.061224)"> <path d="m99 31.456c-1.179 0.562-1.929 0.943-2.695 1.282-3.125 1.384-6.182 1.663-9.084-0.59-0.665-0.518-1.405-0.937-2.073-1.453-7.914-6.13-15.764-12.349-23.751-18.385-6.346-4.795-13.308-8.473-21.125-10.234-2.706-0.609-5.519-0.743-8.144-1.076 0.239 2.232 0.713 4.115 0.586 5.957-0.316 4.604-2.625 8.437-5.386 11.961-5.139 6.558-10.543 12.912-15.54 19.573-5.119 6.822-8.792 14.399-10.106 22.94-0.348 2.268-0.447 4.574-0.682 7.09 1.469-0.644 2.469-1.167 3.524-1.528 2.892-0.99 5.635-1.211 8.247 0.996 6.021 5.084 12.144 10.047 18.232 15.054 9.066 7.457 18.731 13.731 30.699 15.377 2.176 0.298 4.386 0.375 6.858 0.58-0.566-1.209-0.991-1.998-1.311-2.827-0.964-2.513-1.83-5.127-0.141-7.599 1.678-2.453 3.603-4.749 5.481-7.064 5.165-6.374 10.546-12.585 15.496-19.12 5.685-7.503 9.497-15.911 10.561-25.393 0.199-1.735 0.229-3.489 0.354-5.541z"></path> </g>',
    "round-corner":
      '<path d="m9.6e-4 6h5.999v-6l-4.3421 0.00168c-0.91398-6e-5 -1.6579 0.73086-1.6579 1.6282v2.7317c0 0.28092 0 0.69048 9.6e-4 1.0303v0.60816z" stroke-width=".06"></path> <g display="none"> <g transform="matrix(.061224 0 0 .061224 -.061224 -.061224)"> <path d="m99 31.456c-1.179 0.562-1.929 0.943-2.695 1.282-3.125 1.384-6.182 1.663-9.084-0.59-0.665-0.518-1.405-0.937-2.073-1.453-7.914-6.13-15.764-12.349-23.751-18.385-6.346-4.795-13.308-8.473-21.125-10.234-2.706-0.609-5.519-0.743-8.144-1.076 0.239 2.232 0.713 4.115 0.586 5.957-0.316 4.604-2.625 8.437-5.386 11.961-5.139 6.558-10.543 12.912-15.54 19.573-5.119 6.822-8.792 14.399-10.106 22.94-0.348 2.268-0.447 4.574-0.682 7.09 1.469-0.644 2.469-1.167 3.524-1.528 2.892-0.99 5.635-1.211 8.247 0.996 6.021 5.084 12.144 10.047 18.232 15.054 9.066 7.457 18.731 13.731 30.699 15.377 2.176 0.298 4.386 0.375 6.858 0.58-0.566-1.209-0.991-1.998-1.311-2.827-0.964-2.513-1.83-5.127-0.141-7.599 1.678-2.453 3.603-4.749 5.481-7.064 5.165-6.374 10.546-12.585 15.496-19.12 5.685-7.503 9.497-15.911 10.561-25.393 0.199-1.735 0.229-3.489 0.354-5.541z"></path> </g> </g>',
    "square-corner":
      '<g display="none"> <g display="inline" transform="matrix(.061224 0 0 .061224 -.097889 -.16497)"> <path d="m99 31.456c-1.179 0.562-1.929 0.943-2.695 1.282-3.125 1.384-6.182 1.663-9.084-0.59-0.665-0.518-1.405-0.937-2.073-1.453-7.914-6.13-15.764-12.349-23.751-18.385-6.346-4.795-13.308-8.473-21.125-10.234-2.706-0.609-5.519-0.743-8.144-1.076 0.239 2.232 0.713 4.115 0.586 5.957-0.316 4.604-2.625 8.437-5.386 11.961-5.139 6.558-10.543 12.912-15.54 19.573-5.119 6.822-8.792 14.399-10.106 22.94-0.348 2.268-0.447 4.574-0.682 7.09 1.469-0.644 2.469-1.167 3.524-1.528 2.892-0.99 5.635-1.211 8.247 0.996 6.021 5.084 12.144 10.047 18.232 15.054 9.066 7.457 18.731 13.731 30.699 15.377 2.176 0.298 4.386 0.375 6.858 0.58-0.566-1.209-0.991-1.998-1.311-2.827-0.964-2.513-1.83-5.127-0.141-7.599 1.678-2.453 3.603-4.749 5.481-7.064 5.165-6.374 10.546-12.585 15.496-19.12 5.685-7.503 9.497-15.911 10.561-25.393 0.199-1.735 0.229-3.489 0.354-5.541z"></path> </g> </g> <g display="none"> <path d="m-0.13234 6.0895h5.999v-6l-4.3421 0.0017c-0.91398-6e-5 -1.6579 0.73086-1.6579 1.6282v2.7317c0 0.28092 0 0.69048 9.6e-4 1.0303v0.60816z" display="inline" stroke-width=".06"></path> </g> <g> <path d="M 1.63326,6 H 4.3683 C 5.26782,6 6,5.25624 6,4.3422 V 1.6578 C 6,0.74382 5.26782,0 4.3683,0 H 0 L 0.00252,4.3422 C 0.00252,5.25624 0.73374,6 1.63326,6 Z" stroke-width=".06"></path> </g>',
    "round-diagonal":
      '<g display="none"> <g display="inline" transform="matrix(.061224 0 0 .061224 -.097889 -.16497)"> <path d="m99 31.456c-1.179 0.562-1.929 0.943-2.695 1.282-3.125 1.384-6.182 1.663-9.084-0.59-0.665-0.518-1.405-0.937-2.073-1.453-7.914-6.13-15.764-12.349-23.751-18.385-6.346-4.795-13.308-8.473-21.125-10.234-2.706-0.609-5.519-0.743-8.144-1.076 0.239 2.232 0.713 4.115 0.586 5.957-0.316 4.604-2.625 8.437-5.386 11.961-5.139 6.558-10.543 12.912-15.54 19.573-5.119 6.822-8.792 14.399-10.106 22.94-0.348 2.268-0.447 4.574-0.682 7.09 1.469-0.644 2.469-1.167 3.524-1.528 2.892-0.99 5.635-1.211 8.247 0.996 6.021 5.084 12.144 10.047 18.232 15.054 9.066 7.457 18.731 13.731 30.699 15.377 2.176 0.298 4.386 0.375 6.858 0.58-0.566-1.209-0.991-1.998-1.311-2.827-0.964-2.513-1.83-5.127-0.141-7.599 1.678-2.453 3.603-4.749 5.481-7.064 5.165-6.374 10.546-12.585 15.496-19.12 5.685-7.503 9.497-15.911 10.561-25.393 0.199-1.735 0.229-3.489 0.354-5.541z"></path> </g> </g> <g display="none"> <path d="m-0.13234 6.0895h5.999v-6l-4.3421 0.0017c-0.91398-6e-5 -1.6579 0.73086-1.6579 1.6282v2.7317c0 0.28092 0 0.69048 9.6e-4 1.0303v0.60816z" display="inline" stroke-width=".06"></path> </g> <g> <path d="m0 1.6384v2.7308c0 0.14046 0.01782 0.27672 0.0525 0.40626 0.07536 0.2868 0.22764 0.54246 0.43416 0.74514 0.03726 0.03702 0.07704 0.07236 0.1176 0.10512 0.28602 0.23298 0.65418 0.3726 1.0537 0.3726l4.3421 0.00168v-4.3616c0-0.89826-0.74382-1.6283-1.6578-1.6283h-2.6843l-1.657-0.01008s-9e-4 1.0766-9e-4 1.6384z" stroke-width=".06"></path> </g> <g display="none"> <path d="M 1.63326,6 H 4.3683 C 5.26782,6 6,5.25624 6,4.3422 V 1.6578 C 6,0.74382 5.26782,0 4.3683,0 H 0 L 0.00252,4.3422 C 0.00252,5.25624 0.73374,6 1.63326,6 Z" stroke-width=".06"></path> </g> <g display="none"> <path clip-rule="evenodd" d="m3.0159 5.4998c-0.20042-1.5176-1.0412-2.293-2.4388-2.5024 1.4079-0.18484 2.2189-0.98287 2.4397-2.4973 0.2134 1.4742 1.0131 2.2844 2.406 2.4986-1.4017 0.21258-2.1865 1.0303-2.4069 2.5011z" fill-rule="evenodd" stroke-width=".049221"></path> </g>',
    "borders-arc":
      '<path d="m1.8e-4 5.9996c0.35296-1.9959 0.35296-4.0028-1.8e-4 -5.9996 1.0003 0.17729 2.0038 0.26674 3 0.26674 0.996 0 1.9991-0.0894 2.9998-0.2668-0.35314 1.996-0.35314 4.0027 1.8e-4 5.9996-1.0003-0.17729-2.0038-0.2668-3-0.2668-0.99606 0-1.9993 0.08946-2.9998 0.2668z" stroke-width=".059996"></path>',
    "diagonal-pill":
      '<polygon points="100 100 51.156 100 0 49.844 0 0 49.844 0 100 51.156" transform="scale(.06)"></polygon>',
    "3-horizontal":
      '<g transform="matrix(.061224 0 0 .061224 -.061224 -.061224)"><path d="m99 16.68c0 8.659-6.619 15.68-14.782 15.68h-68.437c-8.163 0-14.781-7.021-14.781-15.68s6.618-15.68 14.781-15.68h68.437c8.163 0 14.782 7.021 14.782 15.68z"></path><path d="m99 83.32c0 8.66-6.619 15.68-14.782 15.68h-68.437c-8.163 0-14.781-7.02-14.781-15.68s6.618-15.68 14.781-15.68h68.437c8.163 0 14.782 7.02 14.782 15.68z"></path><path d="m99 50c0 8.66-6.619 15.68-14.782 15.68h-68.437c-8.163 0-14.781-7.02-14.781-15.68 0-8.661 6.618-15.68 14.781-15.68h68.437c8.163 0 14.782 7.019 14.782 15.68z"></path></g>',
    "3-ver":
      '<g display="none"><g display="inline" transform="matrix(.061224 0 0 .061224 -.097889 -.16497)"><path d="m99 31.456c-1.179 0.562-1.929 0.943-2.695 1.282-3.125 1.384-6.182 1.663-9.084-0.59-0.665-0.518-1.405-0.937-2.073-1.453-7.914-6.13-15.764-12.349-23.751-18.385-6.346-4.795-13.308-8.473-21.125-10.234-2.706-0.609-5.519-0.743-8.144-1.076 0.239 2.232 0.713 4.115 0.586 5.957-0.316 4.604-2.625 8.437-5.386 11.961-5.139 6.558-10.543 12.912-15.54 19.573-5.119 6.822-8.792 14.399-10.106 22.94-0.348 2.268-0.447 4.574-0.682 7.09 1.469-0.644 2.469-1.167 3.524-1.528 2.892-0.99 5.635-1.211 8.247 0.996 6.021 5.084 12.144 10.047 18.232 15.054 9.066 7.457 18.731 13.731 30.699 15.377 2.176 0.298 4.386 0.375 6.858 0.58-0.566-1.209-0.991-1.998-1.311-2.827-0.964-2.513-1.83-5.127-0.141-7.599 1.678-2.453 3.603-4.749 5.481-7.064 5.165-6.374 10.546-12.585 15.496-19.12 5.685-7.503 9.497-15.911 10.561-25.393 0.199-1.735 0.229-3.489 0.354-5.541z"></path></g></g><g display="none"><path d="m-0.13234 6.0895h5.999v-6l-4.3421 0.0017c-0.91398-6e-5 -1.6579 0.73086-1.6579 1.6282v2.7317c0 0.28092 0 0.69048 9.6e-4 1.0303v0.60816z" display="inline" stroke-width=".06"></path></g><g display="none"><path d="m0 1.6384v2.7308c0 0.14046 0.01782 0.27672 0.0525 0.40626 0.07536 0.2868 0.22764 0.54246 0.43416 0.74514 0.03726 0.03702 0.07704 0.07236 0.1176 0.10512 0.28602 0.23298 0.65418 0.3726 1.0537 0.3726l4.3421 0.00168v-4.3616c0-0.89826-0.74382-1.6283-1.6578-1.6283h-2.6843l-1.657-0.01008s-9e-4 1.0766-9e-4 1.6384z" stroke-width=".06"></path></g><g display="none"><path d="m1.8e-4 5.9996c0.35296-1.9959 0.35296-4.0028-1.8e-4 -5.9996 1.0003 0.17729 2.0038 0.26674 3 0.26674 0.996 0 1.9991-0.0894 2.9998-0.2668-0.35314 1.996-0.35314 4.0027 1.8e-4 5.9996-1.0003-0.17729-2.0038-0.2668-3-0.2668-0.99606 0-1.9993 0.08946-2.9998 0.2668z" stroke-width=".059996"></path></g><g transform="matrix(.061224 0 0 .061224 -.061224 -.061224)"><path d="m16.68 1c8.659 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.021 14.782-15.68 14.782s-15.68-6.618-15.68-14.782v-68.436c0-8.163 7.021-14.782 15.68-14.782z"></path><path d="m83.32 1c8.659 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.021 14.782-15.68 14.782-8.661 0-15.68-6.618-15.68-14.782v-68.436c1e-3 -8.163 7.019-14.782 15.68-14.782z"></path><path d="m50 1c8.661 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.019 14.782-15.68 14.782s-15.68-6.618-15.68-14.782v-68.436c0-8.163 7.019-14.782 15.68-14.782z"></path></g><g display="none"><path d="M 1.63326,6 H 4.3683 C 5.26782,6 6,5.25624 6,4.3422 V 1.6578 C 6,0.74382 5.26782,0 4.3683,0 H 0 L 0.00252,4.3422 C 0.00252,5.25624 0.73374,6 1.63326,6 Z" stroke-width=".06"></path></g><g display="none"><path clip-rule="evenodd" d="m3.0159 5.4998c-0.20042-1.5176-1.0412-2.293-2.4388-2.5024 1.4079-0.18484 2.2189-0.98287 2.4397-2.4973 0.2134 1.4742 1.0131 2.2844 2.406 2.4986-1.4017 0.21258-2.1865 1.0303-2.4069 2.5011z" fill-rule="evenodd" stroke-width=".049221"></path></g>',
    comic:
      '<g display="none"> <g display="inline" transform="matrix(.061224 0 0 .061224 -.097889 -.16497)"> <path d="m99 31.456c-1.179 0.562-1.929 0.943-2.695 1.282-3.125 1.384-6.182 1.663-9.084-0.59-0.665-0.518-1.405-0.937-2.073-1.453-7.914-6.13-15.764-12.349-23.751-18.385-6.346-4.795-13.308-8.473-21.125-10.234-2.706-0.609-5.519-0.743-8.144-1.076 0.239 2.232 0.713 4.115 0.586 5.957-0.316 4.604-2.625 8.437-5.386 11.961-5.139 6.558-10.543 12.912-15.54 19.573-5.119 6.822-8.792 14.399-10.106 22.94-0.348 2.268-0.447 4.574-0.682 7.09 1.469-0.644 2.469-1.167 3.524-1.528 2.892-0.99 5.635-1.211 8.247 0.996 6.021 5.084 12.144 10.047 18.232 15.054 9.066 7.457 18.731 13.731 30.699 15.377 2.176 0.298 4.386 0.375 6.858 0.58-0.566-1.209-0.991-1.998-1.311-2.827-0.964-2.513-1.83-5.127-0.141-7.599 1.678-2.453 3.603-4.749 5.481-7.064 5.165-6.374 10.546-12.585 15.496-19.12 5.685-7.503 9.497-15.911 10.561-25.393 0.199-1.735 0.229-3.489 0.354-5.541z"></path> </g> </g> <g display="none"> <path d="m-0.13234 6.0895h5.999v-6l-4.3421 0.0017c-0.91398-6e-5 -1.6579 0.73086-1.6579 1.6282v2.7317c0 0.28092 0 0.69048 9.6e-4 1.0303v0.60816z" display="inline" stroke-width=".06"></path> </g> <g display="none"> <path d="m0 1.6384v2.7308c0 0.14046 0.01782 0.27672 0.0525 0.40626 0.07536 0.2868 0.22764 0.54246 0.43416 0.74514 0.03726 0.03702 0.07704 0.07236 0.1176 0.10512 0.28602 0.23298 0.65418 0.3726 1.0537 0.3726l4.3421 0.00168v-4.3616c0-0.89826-0.74382-1.6283-1.6578-1.6283h-2.6843l-1.657-0.01008s-9e-4 1.0766-9e-4 1.6384z" stroke-width=".06"></path> </g> <g display="none"> <path d="m1.8e-4 5.9996c0.35296-1.9959 0.35296-4.0028-1.8e-4 -5.9996 1.0003 0.17729 2.0038 0.26674 3 0.26674 0.996 0 1.9991-0.0894 2.9998-0.2668-0.35314 1.996-0.35314 4.0027 1.8e-4 5.9996-1.0003-0.17729-2.0038-0.2668-3-0.2668-0.99606 0-1.9993 0.08946-2.9998 0.2668z" stroke-width=".059996"></path> </g> <g display="none"> <g transform="matrix(.061224 0 0 .061224 -.061224 -.061224)"> <path d="m16.68 1c8.659 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.021 14.782-15.68 14.782s-15.68-6.618-15.68-14.782v-68.436c0-8.163 7.021-14.782 15.68-14.782z"></path> <path d="m83.32 1c8.659 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.021 14.782-15.68 14.782-8.661 0-15.68-6.618-15.68-14.782v-68.436c1e-3 -8.163 7.019-14.782 15.68-14.782z"></path> <path d="m50 1c8.661 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.019 14.782-15.68 14.782s-15.68-6.618-15.68-14.782v-68.436c0-8.163 7.019-14.782 15.68-14.782z"></path> </g> </g> <g> <path d="m4.7506 5.9354c-0.26389 0.058019-0.53552 0.048719-0.80373 0.051299-0.14389 8.4e-4 -1.6653-0.00258-1.6653 0.00336h-0.00168c-0.017041-8.399e-4 -0.14731-8.399e-4 -0.23155 0h-0.0051c-0.33973-8.399e-4 -0.67856-0.00252-1.0182-0.00168-0.21541 0-0.43082 9e-4 -0.64532 0.00342-0.092823 8.4e-4 -0.30055 0.041219-0.35671-0.064739-0.028921-0.054659-0.015301-0.12366-0.0076803-0.18084 0.01278-0.097498 0.026401-0.19422 0.039181-0.29171 0.025561-0.19422 0.051062-0.38849 0.072363-0.58355 0.042542-0.40277 0.053642-0.80381 0.054482-1.2091 0-0.54485-0.022141-1.088-0.11748-1.627-0.080883-0.45401-0.126-0.91312 0.12516-1.326 0.19327-0.31613 0.52022-0.54317 0.88545-0.62051 0.24691-0.051299 0.51002-0.053819 0.76029-0.067259 0.28093-0.01428 0.56276-0.02016 0.84375-0.02106 0.56258-8.3999e-4 1.1253 0.0219 1.6864 0.052139 0.23497 0.0126 0.4844 0.00504 0.71174 0.072299 0.17371 0.051299 0.33199 0.14466 0.46142 0.26904 0.30901 0.29765 0.4325 0.72899 0.44954 1.1444 0.0111 0.26574 8.401e-4 0.53225 0.0051 0.79709 0.00342 0.28002 6e-3 0.55997 0.00678 0.83999 9.001e-4 0.27912 9.001e-4 0.55907-0.00168 0.83909-0.00168 0.243 0.0111 0.49271-0.028921 0.73319-0.063002 0.37247-0.26899 0.69707-0.58232 0.91396-0.19069 0.13212-0.40867 0.22464-0.63596 0.2742z" stroke-width=".06"></path> </g> <g display="none"> <g transform="matrix(.059999 0 0 .06 -.0070199 -1.6305e-6)"> <path d="m100.11 9.15c-1.488 0.196-1.372-3.001-1.583-5.262l-1.567 0.406c1.156-0.47-0.028-1.336-1.721-1.639-4.87-0.563-3.902 3.094-7.679 1.2 0.549 0.04 0.64-0.193 1.197-0.155l-1.942-0.833c-0.41 3.951-11.443-2.518-11.86 1.438-2.773-1.596-0.195-0.952 3.361-2.82l-5.088 0.367c0.063 0.04-1.837 0.418-0.761 0.095-3.868-1.666-1.126 0.345-3.219 1.378-1.481-0.571 1.156-2.969-3.05-2.317-5.944 0.772 1.129 2.886-2.443 3.352l-2.585-2.048c-4.559 1.565-7.969 0.115-11.815-0.144-0.872 0.164-1.296 0.376-1.51 0.598-4.091-0.887-8.58 2.001-11.662 1.329 0.719-0.421-1.765-0.317-2.138-0.813l-5.567 1.267c2.459-0.537 2.354-1.715 2.806-2.858-1.744 0.121-2.559 0.767-3.744 0.918 0.722-0.415 1.452-0.838 0.532-1.366l-5.842 1.947c0.339 0.2 1.014 0.276 1.574 0.328-1.459 0.013-4.617 0.754-6.708-0.206 0.185-0.452 0.903-0.875 1.084-1.334 1.753 1.294 2.752 0.191 3.662-0.688-4.033 0.201-1.005-0.3-2.944-1.135-2.845 0.045-4.015 2.909-3.266 3.899-3.211-0.449-4.231-1.187-7.516 0l0.625-2.473-3.014-0.436 2.444-1.008c-5.443-1.025-1.585 4.044-6.47 3.891-0.193 2.252-0.112 5.314-1.57 5.122 0.091 1.272 0.079 2.428-0.01 3.372 0.576 0.548 1.083 0.542 1.274-2.258l1.301 4.665c5.275 2.589-0.442 12.431 1.257 19.496-0.203-0.499-0.486-0.628-0.649-0.689 1.689 6.275-1.423 14.073-0.581 15.53l-1.449 0.559c2.225 5.367 2.414 6.002 1.514 12.402-0.233-0.081-0.651-0.821-0.954 0.19 1.071 1.537 2.141 3.086 1.845 7.469l-0.455-0.183 0.238 6.856c-4.464-0.051 2.732 11.738-2.11 13.803 0.883 0.906 1.356 3.498 1.763 5.77 2.66 0.833 0.273 4.632 5.056 3.731l-2.444-1.009 3.014-0.436-0.625-2.473c3.285 1.187 4.305 0.448 7.516 0-0.749 0.99 0.421 3.854 3.266 3.899 1.939-0.836-1.089-1.337 2.944-1.136-0.91-0.879-1.909-1.982-3.662-0.688-0.181-0.458-0.899-0.882-1.084-1.334 2.091-0.96 5.249-0.218 6.708-0.206-0.56 0.053-1.235 0.129-1.574 0.329l5.843 1.947c0.919-0.528 0.19-0.952-0.532-1.367 1.185 0.151 2 0.797 3.744 0.918-0.452-1.143-0.347-2.32-2.806-2.857l5.567 1.267c0.373-0.496 2.857-0.393 2.138-0.813 3.083-0.672 7.571 2.216 11.662 1.329 0.214 0.223 0.639 0.435 1.51 0.599 3.847-0.259 7.257-1.709 11.815-0.144l2.585-2.049c3.572 0.466-3.501 2.581 2.443 3.353 4.206 0.652 1.568-1.746 3.05-2.316 2.093 1.032-0.649 3.044 3.219 1.377-1.076-0.323 0.824 0.056 0.761 0.096l5.088 0.367c-3.557-1.869-6.135-1.225-3.361-2.82 0.417 3.955 11.45-2.514 11.86 1.438l1.942-0.833c-0.558 0.038-0.648-0.195-1.197-0.155 3.776-1.894 2.809 1.764 7.679 1.2 0.757-0.135 1.397-0.385 1.788-0.661 0.05-0.275 0.1-0.561 0.152-0.849-0.065-0.044-0.123-0.09-0.22-0.129l0.231 0.06c0.394-2.178 0.862-4.546 1.697-5.403-4.842-2.064 2.354-13.854-2.109-13.803l0.238-6.856-0.455 0.183c-0.296-4.383 0.774-5.932 1.845-7.469-0.303-1.012-0.721-0.271-0.953-0.19-0.9-6.399-0.711-7.035 1.515-12.402l-1.449-0.559c0.841-1.457-2.271-9.255-0.582-15.53-0.163 0.061-0.446 0.19-0.648 0.689 1.699-7.065-4.02-16.908 1.256-19.497l1.301-4.665c0.189 2.801 0.696 2.806 1.275 2.257-0.091-0.944-0.103-2.1-0.012-3.372z"></path> </g> </g> <g display="none"> <path d="M 6,3 C 6,2.5200612 5.6681633,2.1187347 5.2216531,2.01 5.6681633,1.9013265 6,1.4999388 6,1.02 6,0.4566122 5.5433265,0 4.98,0 4.5001224,0 4.0986735,0.331898 3.99,0.77834688 3.8813265,0.331898 3.4798776,0 3,0 2.5200612,0 2.1186735,0.331898 2.01,0.77828568 1.9013265,0.331898 1.4999388,0 1.02,0 0.4566122,0 0,0.4566122 0,1.02 0,1.4999388 0.331898,1.9013265 0.7783469,2.01 0.331898,2.1187347 0,2.5200612 0,3 0,3.4798776 0.331898,3.8813265 0.7783469,3.99 0.331898,4.0986735 0,4.5001224 0,4.98 0,5.5433265 0.4566122,6 1.02,6 1.4999388,6 1.9013265,5.6681633 2.01,5.2216531 2.1186735,5.6681633 2.5200612,6 3,6 3.4798776,6 3.8813265,5.6681633 3.99,5.2216531 4.0986735,5.6681633 4.5001224,6 4.98,6 5.5433265,6 6,5.5433265 6,4.98 6,4.5001224 5.6681633,4.0986735 5.2216531,3.99 5.6681633,3.8813265 6,3.4798776 6,3 Z" stroke-width=".061224"></path> </g> <g display="none"> <g transform="scale(.06)"> <path d="m99.996 19.713c-8.638-4.26-15.396-10.976-19.868-19.713h-61.913c-0.803 0.206-1.532 0.384-2.137 0.531l-0.179 0.044c-1.626 0.402-3.309 0.818-4.205 1.198-2.341 0.989-4.522 3.116-6.574 5.313-1.909 2.033-3.15 4.217-3.784 6.661l-0.16 0.734c-0.543 2.447-1.157 5.217-1.176 6.868l0.114 32.409-0.11 26.531c8.627 4.255 15.385 10.968 19.864 19.711h61.938c0.821-0.213 1.55-0.394 2.116-0.53l0.179-0.044c1.628-0.403 3.312-0.819 4.244-1.213 2.295-0.965 4.489-3.102 6.514-5.262 1.927-2.057 3.177-4.258 3.81-6.718l0.155-0.714c0.542-2.446 1.157-5.217 1.176-6.868l-0.114-32.409z"></path> </g> </g> <g display="none"> <path d="M 1.63326,6 H 4.3683 C 5.26782,6 6,5.25624 6,4.3422 V 1.6578 C 6,0.74382 5.26782,0 4.3683,0 H 0 L 0.00252,4.3422 C 0.00252,5.25624 0.73374,6 1.63326,6 Z" stroke-width=".06"></path> </g> <g display="none"> <path clip-rule="evenodd" d="m3.0159 5.4998c-0.20042-1.5176-1.0412-2.293-2.4388-2.5024 1.4079-0.18484 2.2189-0.98287 2.4397-2.4973 0.2134 1.4742 1.0131 2.2844 2.406 2.4986-1.4017 0.21258-2.1865 1.0303-2.4069 2.5011z" fill-rule="evenodd" stroke-width=".049221"></path> </g>',
    rough:
      '<g display="none"> <g display="inline" transform="matrix(.061224 0 0 .061224 -.097889 -.16497)"> <path d="m99 31.456c-1.179 0.562-1.929 0.943-2.695 1.282-3.125 1.384-6.182 1.663-9.084-0.59-0.665-0.518-1.405-0.937-2.073-1.453-7.914-6.13-15.764-12.349-23.751-18.385-6.346-4.795-13.308-8.473-21.125-10.234-2.706-0.609-5.519-0.743-8.144-1.076 0.239 2.232 0.713 4.115 0.586 5.957-0.316 4.604-2.625 8.437-5.386 11.961-5.139 6.558-10.543 12.912-15.54 19.573-5.119 6.822-8.792 14.399-10.106 22.94-0.348 2.268-0.447 4.574-0.682 7.09 1.469-0.644 2.469-1.167 3.524-1.528 2.892-0.99 5.635-1.211 8.247 0.996 6.021 5.084 12.144 10.047 18.232 15.054 9.066 7.457 18.731 13.731 30.699 15.377 2.176 0.298 4.386 0.375 6.858 0.58-0.566-1.209-0.991-1.998-1.311-2.827-0.964-2.513-1.83-5.127-0.141-7.599 1.678-2.453 3.603-4.749 5.481-7.064 5.165-6.374 10.546-12.585 15.496-19.12 5.685-7.503 9.497-15.911 10.561-25.393 0.199-1.735 0.229-3.489 0.354-5.541z"></path> </g> </g> <g display="none"> <path d="m-0.13234 6.0895h5.999v-6l-4.3421 0.0017c-0.91398-6e-5 -1.6579 0.73086-1.6579 1.6282v2.7317c0 0.28092 0 0.69048 9.6e-4 1.0303v0.60816z" display="inline" stroke-width=".06"></path> </g> <g display="none"> <path d="m0 1.6384v2.7308c0 0.14046 0.01782 0.27672 0.0525 0.40626 0.07536 0.2868 0.22764 0.54246 0.43416 0.74514 0.03726 0.03702 0.07704 0.07236 0.1176 0.10512 0.28602 0.23298 0.65418 0.3726 1.0537 0.3726l4.3421 0.00168v-4.3616c0-0.89826-0.74382-1.6283-1.6578-1.6283h-2.6843l-1.657-0.01008s-9e-4 1.0766-9e-4 1.6384z" stroke-width=".06"></path> </g> <g display="none"> <path d="m1.8e-4 5.9996c0.35296-1.9959 0.35296-4.0028-1.8e-4 -5.9996 1.0003 0.17729 2.0038 0.26674 3 0.26674 0.996 0 1.9991-0.0894 2.9998-0.2668-0.35314 1.996-0.35314 4.0027 1.8e-4 5.9996-1.0003-0.17729-2.0038-0.2668-3-0.2668-0.99606 0-1.9993 0.08946-2.9998 0.2668z" stroke-width=".059996"></path> </g> <g display="none"> <g transform="matrix(.061224 0 0 .061224 -.061224 -.061224)"> <path d="m16.68 1c8.659 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.021 14.782-15.68 14.782s-15.68-6.618-15.68-14.782v-68.436c0-8.163 7.021-14.782 15.68-14.782z"></path> <path d="m83.32 1c8.659 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.021 14.782-15.68 14.782-8.661 0-15.68-6.618-15.68-14.782v-68.436c1e-3 -8.163 7.019-14.782 15.68-14.782z"></path> <path d="m50 1c8.661 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.019 14.782-15.68 14.782s-15.68-6.618-15.68-14.782v-68.436c0-8.163 7.019-14.782 15.68-14.782z"></path> </g> </g> <g display="none"> <path d="m4.7506 5.9354c-0.26389 0.058019-0.53552 0.048719-0.80373 0.051299-0.14389 8.4e-4 -1.6653-0.00258-1.6653 0.00336h-0.00168c-0.017041-8.399e-4 -0.14731-8.399e-4 -0.23155 0h-0.0051c-0.33973-8.399e-4 -0.67856-0.00252-1.0182-0.00168-0.21541 0-0.43082 9e-4 -0.64532 0.00342-0.092823 8.4e-4 -0.30055 0.041219-0.35671-0.064739-0.028921-0.054659-0.015301-0.12366-0.0076803-0.18084 0.01278-0.097498 0.026401-0.19422 0.039181-0.29171 0.025561-0.19422 0.051062-0.38849 0.072363-0.58355 0.042542-0.40277 0.053642-0.80381 0.054482-1.2091 0-0.54485-0.022141-1.088-0.11748-1.627-0.080883-0.45401-0.126-0.91312 0.12516-1.326 0.19327-0.31613 0.52022-0.54317 0.88545-0.62051 0.24691-0.051299 0.51002-0.053819 0.76029-0.067259 0.28093-0.01428 0.56276-0.02016 0.84375-0.02106 0.56258-8.3999e-4 1.1253 0.0219 1.6864 0.052139 0.23497 0.0126 0.4844 0.00504 0.71174 0.072299 0.17371 0.051299 0.33199 0.14466 0.46142 0.26904 0.30901 0.29765 0.4325 0.72899 0.44954 1.1444 0.0111 0.26574 8.401e-4 0.53225 0.0051 0.79709 0.00342 0.28002 6e-3 0.55997 0.00678 0.83999 9.001e-4 0.27912 9.001e-4 0.55907-0.00168 0.83909-0.00168 0.243 0.0111 0.49271-0.028921 0.73319-0.063002 0.37247-0.26899 0.69707-0.58232 0.91396-0.19069 0.13212-0.40867 0.22464-0.63596 0.2742z" stroke-width=".06"></path> </g> <g> <g transform="matrix(.059999 0 0 .06 -.0070199 -1.6305e-6)"> <path d="m100.11 9.15c-1.488 0.196-1.372-3.001-1.583-5.262l-1.567 0.406c1.156-0.47-0.028-1.336-1.721-1.639-4.87-0.563-3.902 3.094-7.679 1.2 0.549 0.04 0.64-0.193 1.197-0.155l-1.942-0.833c-0.41 3.951-11.443-2.518-11.86 1.438-2.773-1.596-0.195-0.952 3.361-2.82l-5.088 0.367c0.063 0.04-1.837 0.418-0.761 0.095-3.868-1.666-1.126 0.345-3.219 1.378-1.481-0.571 1.156-2.969-3.05-2.317-5.944 0.772 1.129 2.886-2.443 3.352l-2.585-2.048c-4.559 1.565-7.969 0.115-11.815-0.144-0.872 0.164-1.296 0.376-1.51 0.598-4.091-0.887-8.58 2.001-11.662 1.329 0.719-0.421-1.765-0.317-2.138-0.813l-5.567 1.267c2.459-0.537 2.354-1.715 2.806-2.858-1.744 0.121-2.559 0.767-3.744 0.918 0.722-0.415 1.452-0.838 0.532-1.366l-5.842 1.947c0.339 0.2 1.014 0.276 1.574 0.328-1.459 0.013-4.617 0.754-6.708-0.206 0.185-0.452 0.903-0.875 1.084-1.334 1.753 1.294 2.752 0.191 3.662-0.688-4.033 0.201-1.005-0.3-2.944-1.135-2.845 0.045-4.015 2.909-3.266 3.899-3.211-0.449-4.231-1.187-7.516 0l0.625-2.473-3.014-0.436 2.444-1.008c-5.443-1.025-1.585 4.044-6.47 3.891-0.193 2.252-0.112 5.314-1.57 5.122 0.091 1.272 0.079 2.428-0.01 3.372 0.576 0.548 1.083 0.542 1.274-2.258l1.301 4.665c5.275 2.589-0.442 12.431 1.257 19.496-0.203-0.499-0.486-0.628-0.649-0.689 1.689 6.275-1.423 14.073-0.581 15.53l-1.449 0.559c2.225 5.367 2.414 6.002 1.514 12.402-0.233-0.081-0.651-0.821-0.954 0.19 1.071 1.537 2.141 3.086 1.845 7.469l-0.455-0.183 0.238 6.856c-4.464-0.051 2.732 11.738-2.11 13.803 0.883 0.906 1.356 3.498 1.763 5.77 2.66 0.833 0.273 4.632 5.056 3.731l-2.444-1.009 3.014-0.436-0.625-2.473c3.285 1.187 4.305 0.448 7.516 0-0.749 0.99 0.421 3.854 3.266 3.899 1.939-0.836-1.089-1.337 2.944-1.136-0.91-0.879-1.909-1.982-3.662-0.688-0.181-0.458-0.899-0.882-1.084-1.334 2.091-0.96 5.249-0.218 6.708-0.206-0.56 0.053-1.235 0.129-1.574 0.329l5.843 1.947c0.919-0.528 0.19-0.952-0.532-1.367 1.185 0.151 2 0.797 3.744 0.918-0.452-1.143-0.347-2.32-2.806-2.857l5.567 1.267c0.373-0.496 2.857-0.393 2.138-0.813 3.083-0.672 7.571 2.216 11.662 1.329 0.214 0.223 0.639 0.435 1.51 0.599 3.847-0.259 7.257-1.709 11.815-0.144l2.585-2.049c3.572 0.466-3.501 2.581 2.443 3.353 4.206 0.652 1.568-1.746 3.05-2.316 2.093 1.032-0.649 3.044 3.219 1.377-1.076-0.323 0.824 0.056 0.761 0.096l5.088 0.367c-3.557-1.869-6.135-1.225-3.361-2.82 0.417 3.955 11.45-2.514 11.86 1.438l1.942-0.833c-0.558 0.038-0.648-0.195-1.197-0.155 3.776-1.894 2.809 1.764 7.679 1.2 0.757-0.135 1.397-0.385 1.788-0.661 0.05-0.275 0.1-0.561 0.152-0.849-0.065-0.044-0.123-0.09-0.22-0.129l0.231 0.06c0.394-2.178 0.862-4.546 1.697-5.403-4.842-2.064 2.354-13.854-2.109-13.803l0.238-6.856-0.455 0.183c-0.296-4.383 0.774-5.932 1.845-7.469-0.303-1.012-0.721-0.271-0.953-0.19-0.9-6.399-0.711-7.035 1.515-12.402l-1.449-0.559c0.841-1.457-2.271-9.255-0.582-15.53-0.163 0.061-0.446 0.19-0.648 0.689 1.699-7.065-4.02-16.908 1.256-19.497l1.301-4.665c0.189 2.801 0.696 2.806 1.275 2.257-0.091-0.944-0.103-2.1-0.012-3.372z"></path> </g> </g> <g display="none"> <path d="M 6,3 C 6,2.5200612 5.6681633,2.1187347 5.2216531,2.01 5.6681633,1.9013265 6,1.4999388 6,1.02 6,0.4566122 5.5433265,0 4.98,0 4.5001224,0 4.0986735,0.331898 3.99,0.77834688 3.8813265,0.331898 3.4798776,0 3,0 2.5200612,0 2.1186735,0.331898 2.01,0.77828568 1.9013265,0.331898 1.4999388,0 1.02,0 0.4566122,0 0,0.4566122 0,1.02 0,1.4999388 0.331898,1.9013265 0.7783469,2.01 0.331898,2.1187347 0,2.5200612 0,3 0,3.4798776 0.331898,3.8813265 0.7783469,3.99 0.331898,4.0986735 0,4.5001224 0,4.98 0,5.5433265 0.4566122,6 1.02,6 1.4999388,6 1.9013265,5.6681633 2.01,5.2216531 2.1186735,5.6681633 2.5200612,6 3,6 3.4798776,6 3.8813265,5.6681633 3.99,5.2216531 4.0986735,5.6681633 4.5001224,6 4.98,6 5.5433265,6 6,5.5433265 6,4.98 6,4.5001224 5.6681633,4.0986735 5.2216531,3.99 5.6681633,3.8813265 6,3.4798776 6,3 Z" stroke-width=".061224"></path> </g> <g display="none"> <g transform="scale(.06)"> <path d="m99.996 19.713c-8.638-4.26-15.396-10.976-19.868-19.713h-61.913c-0.803 0.206-1.532 0.384-2.137 0.531l-0.179 0.044c-1.626 0.402-3.309 0.818-4.205 1.198-2.341 0.989-4.522 3.116-6.574 5.313-1.909 2.033-3.15 4.217-3.784 6.661l-0.16 0.734c-0.543 2.447-1.157 5.217-1.176 6.868l0.114 32.409-0.11 26.531c8.627 4.255 15.385 10.968 19.864 19.711h61.938c0.821-0.213 1.55-0.394 2.116-0.53l0.179-0.044c1.628-0.403 3.312-0.819 4.244-1.213 2.295-0.965 4.489-3.102 6.514-5.262 1.927-2.057 3.177-4.258 3.81-6.718l0.155-0.714c0.542-2.446 1.157-5.217 1.176-6.868l-0.114-32.409z"></path> </g> </g> <g display="none"> <path d="M 1.63326,6 H 4.3683 C 5.26782,6 6,5.25624 6,4.3422 V 1.6578 C 6,0.74382 5.26782,0 4.3683,0 H 0 L 0.00252,4.3422 C 0.00252,5.25624 0.73374,6 1.63326,6 Z" stroke-width=".06"></path> </g> <g display="none"> <path clip-rule="evenodd" d="m3.0159 5.4998c-0.20042-1.5176-1.0412-2.293-2.4388-2.5024 1.4079-0.18484 2.2189-0.98287 2.4397-2.4973 0.2134 1.4742 1.0131 2.2844 2.406 2.4986-1.4017 0.21258-2.1865 1.0303-2.4069 2.5011z" fill-rule="evenodd" stroke-width=".049221"></path> </g>',
    "stamp-thick":
      '<g display="none"> <g display="inline" transform="matrix(.061224 0 0 .061224 -.097889 -.16497)"> <path d="m99 31.456c-1.179 0.562-1.929 0.943-2.695 1.282-3.125 1.384-6.182 1.663-9.084-0.59-0.665-0.518-1.405-0.937-2.073-1.453-7.914-6.13-15.764-12.349-23.751-18.385-6.346-4.795-13.308-8.473-21.125-10.234-2.706-0.609-5.519-0.743-8.144-1.076 0.239 2.232 0.713 4.115 0.586 5.957-0.316 4.604-2.625 8.437-5.386 11.961-5.139 6.558-10.543 12.912-15.54 19.573-5.119 6.822-8.792 14.399-10.106 22.94-0.348 2.268-0.447 4.574-0.682 7.09 1.469-0.644 2.469-1.167 3.524-1.528 2.892-0.99 5.635-1.211 8.247 0.996 6.021 5.084 12.144 10.047 18.232 15.054 9.066 7.457 18.731 13.731 30.699 15.377 2.176 0.298 4.386 0.375 6.858 0.58-0.566-1.209-0.991-1.998-1.311-2.827-0.964-2.513-1.83-5.127-0.141-7.599 1.678-2.453 3.603-4.749 5.481-7.064 5.165-6.374 10.546-12.585 15.496-19.12 5.685-7.503 9.497-15.911 10.561-25.393 0.199-1.735 0.229-3.489 0.354-5.541z"></path> </g> </g> <g display="none"> <path d="m-0.13234 6.0895h5.999v-6l-4.3421 0.0017c-0.91398-6e-5 -1.6579 0.73086-1.6579 1.6282v2.7317c0 0.28092 0 0.69048 9.6e-4 1.0303v0.60816z" display="inline" stroke-width=".06"></path> </g> <g display="none"> <path d="m0 1.6384v2.7308c0 0.14046 0.01782 0.27672 0.0525 0.40626 0.07536 0.2868 0.22764 0.54246 0.43416 0.74514 0.03726 0.03702 0.07704 0.07236 0.1176 0.10512 0.28602 0.23298 0.65418 0.3726 1.0537 0.3726l4.3421 0.00168v-4.3616c0-0.89826-0.74382-1.6283-1.6578-1.6283h-2.6843l-1.657-0.01008s-9e-4 1.0766-9e-4 1.6384z" stroke-width=".06"></path> </g> <g display="none"> <path d="m1.8e-4 5.9996c0.35296-1.9959 0.35296-4.0028-1.8e-4 -5.9996 1.0003 0.17729 2.0038 0.26674 3 0.26674 0.996 0 1.9991-0.0894 2.9998-0.2668-0.35314 1.996-0.35314 4.0027 1.8e-4 5.9996-1.0003-0.17729-2.0038-0.2668-3-0.2668-0.99606 0-1.9993 0.08946-2.9998 0.2668z" stroke-width=".059996"></path> </g> <g display="none"> <g transform="matrix(.061224 0 0 .061224 -.061224 -.061224)"> <path d="m16.68 1c8.659 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.021 14.782-15.68 14.782s-15.68-6.618-15.68-14.782v-68.436c0-8.163 7.021-14.782 15.68-14.782z"></path> <path d="m83.32 1c8.659 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.021 14.782-15.68 14.782-8.661 0-15.68-6.618-15.68-14.782v-68.436c1e-3 -8.163 7.019-14.782 15.68-14.782z"></path> <path d="m50 1c8.661 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.019 14.782-15.68 14.782s-15.68-6.618-15.68-14.782v-68.436c0-8.163 7.019-14.782 15.68-14.782z"></path> </g> </g> <g display="none"> <path d="m4.7506 5.9354c-0.26389 0.058019-0.53552 0.048719-0.80373 0.051299-0.14389 8.4e-4 -1.6653-0.00258-1.6653 0.00336h-0.00168c-0.017041-8.399e-4 -0.14731-8.399e-4 -0.23155 0h-0.0051c-0.33973-8.399e-4 -0.67856-0.00252-1.0182-0.00168-0.21541 0-0.43082 9e-4 -0.64532 0.00342-0.092823 8.4e-4 -0.30055 0.041219-0.35671-0.064739-0.028921-0.054659-0.015301-0.12366-0.0076803-0.18084 0.01278-0.097498 0.026401-0.19422 0.039181-0.29171 0.025561-0.19422 0.051062-0.38849 0.072363-0.58355 0.042542-0.40277 0.053642-0.80381 0.054482-1.2091 0-0.54485-0.022141-1.088-0.11748-1.627-0.080883-0.45401-0.126-0.91312 0.12516-1.326 0.19327-0.31613 0.52022-0.54317 0.88545-0.62051 0.24691-0.051299 0.51002-0.053819 0.76029-0.067259 0.28093-0.01428 0.56276-0.02016 0.84375-0.02106 0.56258-8.3999e-4 1.1253 0.0219 1.6864 0.052139 0.23497 0.0126 0.4844 0.00504 0.71174 0.072299 0.17371 0.051299 0.33199 0.14466 0.46142 0.26904 0.30901 0.29765 0.4325 0.72899 0.44954 1.1444 0.0111 0.26574 8.401e-4 0.53225 0.0051 0.79709 0.00342 0.28002 6e-3 0.55997 0.00678 0.83999 9.001e-4 0.27912 9.001e-4 0.55907-0.00168 0.83909-0.00168 0.243 0.0111 0.49271-0.028921 0.73319-0.063002 0.37247-0.26899 0.69707-0.58232 0.91396-0.19069 0.13212-0.40867 0.22464-0.63596 0.2742z" stroke-width=".06"></path> </g> <g display="none"> <g transform="matrix(.059999 0 0 .06 -.0070199 -1.6305e-6)"> <path d="m100.11 9.15c-1.488 0.196-1.372-3.001-1.583-5.262l-1.567 0.406c1.156-0.47-0.028-1.336-1.721-1.639-4.87-0.563-3.902 3.094-7.679 1.2 0.549 0.04 0.64-0.193 1.197-0.155l-1.942-0.833c-0.41 3.951-11.443-2.518-11.86 1.438-2.773-1.596-0.195-0.952 3.361-2.82l-5.088 0.367c0.063 0.04-1.837 0.418-0.761 0.095-3.868-1.666-1.126 0.345-3.219 1.378-1.481-0.571 1.156-2.969-3.05-2.317-5.944 0.772 1.129 2.886-2.443 3.352l-2.585-2.048c-4.559 1.565-7.969 0.115-11.815-0.144-0.872 0.164-1.296 0.376-1.51 0.598-4.091-0.887-8.58 2.001-11.662 1.329 0.719-0.421-1.765-0.317-2.138-0.813l-5.567 1.267c2.459-0.537 2.354-1.715 2.806-2.858-1.744 0.121-2.559 0.767-3.744 0.918 0.722-0.415 1.452-0.838 0.532-1.366l-5.842 1.947c0.339 0.2 1.014 0.276 1.574 0.328-1.459 0.013-4.617 0.754-6.708-0.206 0.185-0.452 0.903-0.875 1.084-1.334 1.753 1.294 2.752 0.191 3.662-0.688-4.033 0.201-1.005-0.3-2.944-1.135-2.845 0.045-4.015 2.909-3.266 3.899-3.211-0.449-4.231-1.187-7.516 0l0.625-2.473-3.014-0.436 2.444-1.008c-5.443-1.025-1.585 4.044-6.47 3.891-0.193 2.252-0.112 5.314-1.57 5.122 0.091 1.272 0.079 2.428-0.01 3.372 0.576 0.548 1.083 0.542 1.274-2.258l1.301 4.665c5.275 2.589-0.442 12.431 1.257 19.496-0.203-0.499-0.486-0.628-0.649-0.689 1.689 6.275-1.423 14.073-0.581 15.53l-1.449 0.559c2.225 5.367 2.414 6.002 1.514 12.402-0.233-0.081-0.651-0.821-0.954 0.19 1.071 1.537 2.141 3.086 1.845 7.469l-0.455-0.183 0.238 6.856c-4.464-0.051 2.732 11.738-2.11 13.803 0.883 0.906 1.356 3.498 1.763 5.77 2.66 0.833 0.273 4.632 5.056 3.731l-2.444-1.009 3.014-0.436-0.625-2.473c3.285 1.187 4.305 0.448 7.516 0-0.749 0.99 0.421 3.854 3.266 3.899 1.939-0.836-1.089-1.337 2.944-1.136-0.91-0.879-1.909-1.982-3.662-0.688-0.181-0.458-0.899-0.882-1.084-1.334 2.091-0.96 5.249-0.218 6.708-0.206-0.56 0.053-1.235 0.129-1.574 0.329l5.843 1.947c0.919-0.528 0.19-0.952-0.532-1.367 1.185 0.151 2 0.797 3.744 0.918-0.452-1.143-0.347-2.32-2.806-2.857l5.567 1.267c0.373-0.496 2.857-0.393 2.138-0.813 3.083-0.672 7.571 2.216 11.662 1.329 0.214 0.223 0.639 0.435 1.51 0.599 3.847-0.259 7.257-1.709 11.815-0.144l2.585-2.049c3.572 0.466-3.501 2.581 2.443 3.353 4.206 0.652 1.568-1.746 3.05-2.316 2.093 1.032-0.649 3.044 3.219 1.377-1.076-0.323 0.824 0.056 0.761 0.096l5.088 0.367c-3.557-1.869-6.135-1.225-3.361-2.82 0.417 3.955 11.45-2.514 11.86 1.438l1.942-0.833c-0.558 0.038-0.648-0.195-1.197-0.155 3.776-1.894 2.809 1.764 7.679 1.2 0.757-0.135 1.397-0.385 1.788-0.661 0.05-0.275 0.1-0.561 0.152-0.849-0.065-0.044-0.123-0.09-0.22-0.129l0.231 0.06c0.394-2.178 0.862-4.546 1.697-5.403-4.842-2.064 2.354-13.854-2.109-13.803l0.238-6.856-0.455 0.183c-0.296-4.383 0.774-5.932 1.845-7.469-0.303-1.012-0.721-0.271-0.953-0.19-0.9-6.399-0.711-7.035 1.515-12.402l-1.449-0.559c0.841-1.457-2.271-9.255-0.582-15.53-0.163 0.061-0.446 0.19-0.648 0.689 1.699-7.065-4.02-16.908 1.256-19.497l1.301-4.665c0.189 2.801 0.696 2.806 1.275 2.257-0.091-0.944-0.103-2.1-0.012-3.372z"></path> </g> </g> <g> <path d="M 6,3 C 6,2.5200612 5.6681633,2.1187347 5.2216531,2.01 5.6681633,1.9013265 6,1.4999388 6,1.02 6,0.4566122 5.5433265,0 4.98,0 4.5001224,0 4.0986735,0.331898 3.99,0.77834688 3.8813265,0.331898 3.4798776,0 3,0 2.5200612,0 2.1186735,0.331898 2.01,0.77828568 1.9013265,0.331898 1.4999388,0 1.02,0 0.4566122,0 0,0.4566122 0,1.02 0,1.4999388 0.331898,1.9013265 0.7783469,2.01 0.331898,2.1187347 0,2.5200612 0,3 0,3.4798776 0.331898,3.8813265 0.7783469,3.99 0.331898,4.0986735 0,4.5001224 0,4.98 0,5.5433265 0.4566122,6 1.02,6 1.4999388,6 1.9013265,5.6681633 2.01,5.2216531 2.1186735,5.6681633 2.5200612,6 3,6 3.4798776,6 3.8813265,5.6681633 3.99,5.2216531 4.0986735,5.6681633 4.5001224,6 4.98,6 5.5433265,6 6,5.5433265 6,4.98 6,4.5001224 5.6681633,4.0986735 5.2216531,3.99 5.6681633,3.8813265 6,3.4798776 6,3 Z" stroke-width=".061224"></path> </g> <g display="none"> <g transform="scale(.06)"> <path d="m99.996 19.713c-8.638-4.26-15.396-10.976-19.868-19.713h-61.913c-0.803 0.206-1.532 0.384-2.137 0.531l-0.179 0.044c-1.626 0.402-3.309 0.818-4.205 1.198-2.341 0.989-4.522 3.116-6.574 5.313-1.909 2.033-3.15 4.217-3.784 6.661l-0.16 0.734c-0.543 2.447-1.157 5.217-1.176 6.868l0.114 32.409-0.11 26.531c8.627 4.255 15.385 10.968 19.864 19.711h61.938c0.821-0.213 1.55-0.394 2.116-0.53l0.179-0.044c1.628-0.403 3.312-0.819 4.244-1.213 2.295-0.965 4.489-3.102 6.514-5.262 1.927-2.057 3.177-4.258 3.81-6.718l0.155-0.714c0.542-2.446 1.157-5.217 1.176-6.868l-0.114-32.409z"></path> </g> </g> <g display="none"> <path d="M 1.63326,6 H 4.3683 C 5.26782,6 6,5.25624 6,4.3422 V 1.6578 C 6,0.74382 5.26782,0 4.3683,0 H 0 L 0.00252,4.3422 C 0.00252,5.25624 0.73374,6 1.63326,6 Z" stroke-width=".06"></path> </g> <g display="none"> <path clip-rule="evenodd" d="m3.0159 5.4998c-0.20042-1.5176-1.0412-2.293-2.4388-2.5024 1.4079-0.18484 2.2189-0.98287 2.4397-2.4973 0.2134 1.4742 1.0131 2.2844 2.406 2.4986-1.4017 0.21258-2.1865 1.0303-2.4069 2.5011z" fill-rule="evenodd" stroke-width=".049221"></path> </g>',
    stamp:
      '<g transform="matrix(.06 0 0 .06 0 0)"> <polygon points="100 62.791 96.309 56.396 100 50 96.309 43.604 100 37.208 96.309 30.813 100 24.418 96.309 18.023 100 11.627 96.309 5.231 98.409 1.59 94.77 3.693 88.374 0 81.979 3.693 75.583 0 69.188 3.693 62.791 0 56.396 3.693 50 0 43.604 3.693 37.208 0 30.813 3.693 24.418 0 18.023 3.693 11.627 0 5.231 3.693 1.591 1.591 3.693 5.231 0 11.627 3.693 18.023 0 24.418 3.693 30.813 0 37.208 3.693 43.604 0 50 3.693 56.396 0 62.791 3.693 69.188 0 75.583 3.693 81.979 0 88.374 3.693 94.77 1.59 98.409 5.231 96.309 11.627 100 18.023 96.309 24.418 100 30.813 96.309 37.208 100 43.604 96.309 50 100 56.396 96.309 62.791 100 69.188 96.309 75.583 100 81.979 96.309 88.374 100 94.77 96.309 98.409 98.409 96.309 94.77 100 88.374 96.309 81.979 100 75.583 96.309 69.188"></polygon> </g>',
    jungle:
      '<g transform="matrix(.06 0 0 .06 0 0)"><path d="M21.468,99.999c-6.65,0-12.966-6.875-13.959-13.225L0.003-0.001L88.13,5.638c6.21,0.93,11.099,6.823,11.105,13.866 l0.762,80.495H21.468z"></path></g>',
    emblema:
      '<g display="none"> <g display="inline" transform="matrix(.061224 0 0 .061224 -.097889 -.16497)"> <path d="m99 31.456c-1.179 0.562-1.929 0.943-2.695 1.282-3.125 1.384-6.182 1.663-9.084-0.59-0.665-0.518-1.405-0.937-2.073-1.453-7.914-6.13-15.764-12.349-23.751-18.385-6.346-4.795-13.308-8.473-21.125-10.234-2.706-0.609-5.519-0.743-8.144-1.076 0.239 2.232 0.713 4.115 0.586 5.957-0.316 4.604-2.625 8.437-5.386 11.961-5.139 6.558-10.543 12.912-15.54 19.573-5.119 6.822-8.792 14.399-10.106 22.94-0.348 2.268-0.447 4.574-0.682 7.09 1.469-0.644 2.469-1.167 3.524-1.528 2.892-0.99 5.635-1.211 8.247 0.996 6.021 5.084 12.144 10.047 18.232 15.054 9.066 7.457 18.731 13.731 30.699 15.377 2.176 0.298 4.386 0.375 6.858 0.58-0.566-1.209-0.991-1.998-1.311-2.827-0.964-2.513-1.83-5.127-0.141-7.599 1.678-2.453 3.603-4.749 5.481-7.064 5.165-6.374 10.546-12.585 15.496-19.12 5.685-7.503 9.497-15.911 10.561-25.393 0.199-1.735 0.229-3.489 0.354-5.541z"></path> </g> </g> <g display="none"> <path d="m-0.13234 6.0895h5.999v-6l-4.3421 0.0017c-0.91398-6e-5 -1.6579 0.73086-1.6579 1.6282v2.7317c0 0.28092 0 0.69048 9.6e-4 1.0303v0.60816z" display="inline" stroke-width=".06"></path> </g> <g display="none"> <path d="m0 1.6384v2.7308c0 0.14046 0.01782 0.27672 0.0525 0.40626 0.07536 0.2868 0.22764 0.54246 0.43416 0.74514 0.03726 0.03702 0.07704 0.07236 0.1176 0.10512 0.28602 0.23298 0.65418 0.3726 1.0537 0.3726l4.3421 0.00168v-4.3616c0-0.89826-0.74382-1.6283-1.6578-1.6283h-2.6843l-1.657-0.01008s-9e-4 1.0766-9e-4 1.6384z" stroke-width=".06"></path> </g> <g display="none"> <path d="m1.8e-4 5.9996c0.35296-1.9959 0.35296-4.0028-1.8e-4 -5.9996 1.0003 0.17729 2.0038 0.26674 3 0.26674 0.996 0 1.9991-0.0894 2.9998-0.2668-0.35314 1.996-0.35314 4.0027 1.8e-4 5.9996-1.0003-0.17729-2.0038-0.2668-3-0.2668-0.99606 0-1.9993 0.08946-2.9998 0.2668z" stroke-width=".059996"></path> </g> <g display="none"> <g transform="matrix(.061224 0 0 .061224 -.061224 -.061224)"> <path d="m16.68 1c8.659 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.021 14.782-15.68 14.782s-15.68-6.618-15.68-14.782v-68.436c0-8.163 7.021-14.782 15.68-14.782z"></path> <path d="m83.32 1c8.659 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.021 14.782-15.68 14.782-8.661 0-15.68-6.618-15.68-14.782v-68.436c1e-3 -8.163 7.019-14.782 15.68-14.782z"></path> <path d="m50 1c8.661 0 15.68 6.619 15.68 14.782v68.436c0 8.164-7.019 14.782-15.68 14.782s-15.68-6.618-15.68-14.782v-68.436c0-8.163 7.019-14.782 15.68-14.782z"></path> </g> </g> <g display="none"> <path d="m4.7506 5.9354c-0.26389 0.058019-0.53552 0.048719-0.80373 0.051299-0.14389 8.4e-4 -1.6653-0.00258-1.6653 0.00336h-0.00168c-0.017041-8.399e-4 -0.14731-8.399e-4 -0.23155 0h-0.0051c-0.33973-8.399e-4 -0.67856-0.00252-1.0182-0.00168-0.21541 0-0.43082 9e-4 -0.64532 0.00342-0.092823 8.4e-4 -0.30055 0.041219-0.35671-0.064739-0.028921-0.054659-0.015301-0.12366-0.0076803-0.18084 0.01278-0.097498 0.026401-0.19422 0.039181-0.29171 0.025561-0.19422 0.051062-0.38849 0.072363-0.58355 0.042542-0.40277 0.053642-0.80381 0.054482-1.2091 0-0.54485-0.022141-1.088-0.11748-1.627-0.080883-0.45401-0.126-0.91312 0.12516-1.326 0.19327-0.31613 0.52022-0.54317 0.88545-0.62051 0.24691-0.051299 0.51002-0.053819 0.76029-0.067259 0.28093-0.01428 0.56276-0.02016 0.84375-0.02106 0.56258-8.3999e-4 1.1253 0.0219 1.6864 0.052139 0.23497 0.0126 0.4844 0.00504 0.71174 0.072299 0.17371 0.051299 0.33199 0.14466 0.46142 0.26904 0.30901 0.29765 0.4325 0.72899 0.44954 1.1444 0.0111 0.26574 8.401e-4 0.53225 0.0051 0.79709 0.00342 0.28002 6e-3 0.55997 0.00678 0.83999 9.001e-4 0.27912 9.001e-4 0.55907-0.00168 0.83909-0.00168 0.243 0.0111 0.49271-0.028921 0.73319-0.063002 0.37247-0.26899 0.69707-0.58232 0.91396-0.19069 0.13212-0.40867 0.22464-0.63596 0.2742z" stroke-width=".06"></path> </g> <g display="none"> <g transform="matrix(.059999 0 0 .06 -.0070199 -1.6305e-6)"> <path d="m100.11 9.15c-1.488 0.196-1.372-3.001-1.583-5.262l-1.567 0.406c1.156-0.47-0.028-1.336-1.721-1.639-4.87-0.563-3.902 3.094-7.679 1.2 0.549 0.04 0.64-0.193 1.197-0.155l-1.942-0.833c-0.41 3.951-11.443-2.518-11.86 1.438-2.773-1.596-0.195-0.952 3.361-2.82l-5.088 0.367c0.063 0.04-1.837 0.418-0.761 0.095-3.868-1.666-1.126 0.345-3.219 1.378-1.481-0.571 1.156-2.969-3.05-2.317-5.944 0.772 1.129 2.886-2.443 3.352l-2.585-2.048c-4.559 1.565-7.969 0.115-11.815-0.144-0.872 0.164-1.296 0.376-1.51 0.598-4.091-0.887-8.58 2.001-11.662 1.329 0.719-0.421-1.765-0.317-2.138-0.813l-5.567 1.267c2.459-0.537 2.354-1.715 2.806-2.858-1.744 0.121-2.559 0.767-3.744 0.918 0.722-0.415 1.452-0.838 0.532-1.366l-5.842 1.947c0.339 0.2 1.014 0.276 1.574 0.328-1.459 0.013-4.617 0.754-6.708-0.206 0.185-0.452 0.903-0.875 1.084-1.334 1.753 1.294 2.752 0.191 3.662-0.688-4.033 0.201-1.005-0.3-2.944-1.135-2.845 0.045-4.015 2.909-3.266 3.899-3.211-0.449-4.231-1.187-7.516 0l0.625-2.473-3.014-0.436 2.444-1.008c-5.443-1.025-1.585 4.044-6.47 3.891-0.193 2.252-0.112 5.314-1.57 5.122 0.091 1.272 0.079 2.428-0.01 3.372 0.576 0.548 1.083 0.542 1.274-2.258l1.301 4.665c5.275 2.589-0.442 12.431 1.257 19.496-0.203-0.499-0.486-0.628-0.649-0.689 1.689 6.275-1.423 14.073-0.581 15.53l-1.449 0.559c2.225 5.367 2.414 6.002 1.514 12.402-0.233-0.081-0.651-0.821-0.954 0.19 1.071 1.537 2.141 3.086 1.845 7.469l-0.455-0.183 0.238 6.856c-4.464-0.051 2.732 11.738-2.11 13.803 0.883 0.906 1.356 3.498 1.763 5.77 2.66 0.833 0.273 4.632 5.056 3.731l-2.444-1.009 3.014-0.436-0.625-2.473c3.285 1.187 4.305 0.448 7.516 0-0.749 0.99 0.421 3.854 3.266 3.899 1.939-0.836-1.089-1.337 2.944-1.136-0.91-0.879-1.909-1.982-3.662-0.688-0.181-0.458-0.899-0.882-1.084-1.334 2.091-0.96 5.249-0.218 6.708-0.206-0.56 0.053-1.235 0.129-1.574 0.329l5.843 1.947c0.919-0.528 0.19-0.952-0.532-1.367 1.185 0.151 2 0.797 3.744 0.918-0.452-1.143-0.347-2.32-2.806-2.857l5.567 1.267c0.373-0.496 2.857-0.393 2.138-0.813 3.083-0.672 7.571 2.216 11.662 1.329 0.214 0.223 0.639 0.435 1.51 0.599 3.847-0.259 7.257-1.709 11.815-0.144l2.585-2.049c3.572 0.466-3.501 2.581 2.443 3.353 4.206 0.652 1.568-1.746 3.05-2.316 2.093 1.032-0.649 3.044 3.219 1.377-1.076-0.323 0.824 0.056 0.761 0.096l5.088 0.367c-3.557-1.869-6.135-1.225-3.361-2.82 0.417 3.955 11.45-2.514 11.86 1.438l1.942-0.833c-0.558 0.038-0.648-0.195-1.197-0.155 3.776-1.894 2.809 1.764 7.679 1.2 0.757-0.135 1.397-0.385 1.788-0.661 0.05-0.275 0.1-0.561 0.152-0.849-0.065-0.044-0.123-0.09-0.22-0.129l0.231 0.06c0.394-2.178 0.862-4.546 1.697-5.403-4.842-2.064 2.354-13.854-2.109-13.803l0.238-6.856-0.455 0.183c-0.296-4.383 0.774-5.932 1.845-7.469-0.303-1.012-0.721-0.271-0.953-0.19-0.9-6.399-0.711-7.035 1.515-12.402l-1.449-0.559c0.841-1.457-2.271-9.255-0.582-15.53-0.163 0.061-0.446 0.19-0.648 0.689 1.699-7.065-4.02-16.908 1.256-19.497l1.301-4.665c0.189 2.801 0.696 2.806 1.275 2.257-0.091-0.944-0.103-2.1-0.012-3.372z"></path> </g> </g> <g display="none"> <path d="M 6,3 C 6,2.5200612 5.6681633,2.1187347 5.2216531,2.01 5.6681633,1.9013265 6,1.4999388 6,1.02 6,0.4566122 5.5433265,0 4.98,0 4.5001224,0 4.0986735,0.331898 3.99,0.77834688 3.8813265,0.331898 3.4798776,0 3,0 2.5200612,0 2.1186735,0.331898 2.01,0.77828568 1.9013265,0.331898 1.4999388,0 1.02,0 0.4566122,0 0,0.4566122 0,1.02 0,1.4999388 0.331898,1.9013265 0.7783469,2.01 0.331898,2.1187347 0,2.5200612 0,3 0,3.4798776 0.331898,3.8813265 0.7783469,3.99 0.331898,4.0986735 0,4.5001224 0,4.98 0,5.5433265 0.4566122,6 1.02,6 1.4999388,6 1.9013265,5.6681633 2.01,5.2216531 2.1186735,5.6681633 2.5200612,6 3,6 3.4798776,6 3.8813265,5.6681633 3.99,5.2216531 4.0986735,5.6681633 4.5001224,6 4.98,6 5.5433265,6 6,5.5433265 6,4.98 6,4.5001224 5.6681633,4.0986735 5.2216531,3.99 5.6681633,3.8813265 6,3.4798776 6,3 Z" stroke-width=".061224"></path> </g> <g transform="scale(.06)"> <path d="m99.996 19.713c-8.638-4.26-15.396-10.976-19.868-19.713h-61.913c-0.803 0.206-1.532 0.384-2.137 0.531l-0.179 0.044c-1.626 0.402-3.309 0.818-4.205 1.198-2.341 0.989-4.522 3.116-6.574 5.313-1.909 2.033-3.15 4.217-3.784 6.661l-0.16 0.734c-0.543 2.447-1.157 5.217-1.176 6.868l0.114 32.409-0.11 26.531c8.627 4.255 15.385 10.968 19.864 19.711h61.938c0.821-0.213 1.55-0.394 2.116-0.53l0.179-0.044c1.628-0.403 3.312-0.819 4.244-1.213 2.295-0.965 4.489-3.102 6.514-5.262 1.927-2.057 3.177-4.258 3.81-6.718l0.155-0.714c0.542-2.446 1.157-5.217 1.176-6.868l-0.114-32.409z"></path> </g> <g display="none"> <path d="M 1.63326,6 H 4.3683 C 5.26782,6 6,5.25624 6,4.3422 V 1.6578 C 6,0.74382 5.26782,0 4.3683,0 H 0 L 0.00252,4.3422 C 0.00252,5.25624 0.73374,6 1.63326,6 Z" stroke-width=".06"></path> </g> <g display="none"> <path clip-rule="evenodd" d="m3.0159 5.4998c-0.20042-1.5176-1.0412-2.293-2.4388-2.5024 1.4079-0.18484 2.2189-0.98287 2.4397-2.4973 0.2134 1.4742 1.0131 2.2844 2.406 2.4986-1.4017 0.21258-2.1865 1.0303-2.4069 2.5011z" fill-rule="evenodd" stroke-width=".049221"></path> </g>',
  },
};

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
    transform: `translate(${fmt(x + inset)},${fmt(y + inset)}) scale(${EYE_SCALE})`,
  };
}

function importedEyeMarkup(role, key, x, y, originIndex) {
  const inset = role === "eye-in" ? 2 : 0;

  return `<g transform="translate(${fmt(x + inset)},${fmt(y + inset)}) scale(${EYE_SCALE})">${orientedEyeMarkup(role, key, originIndex)}</g>`;
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

PATTERNS.lines = {
  label: "Lines",
  kind: "merge",
  params: ["lineThickness", "finderThickness"],
  build: (qr, params, skipEyes) => {
    const ink = params.dataColor || params.foreground;
    const palette =
      ink && typeof ink === "object" && ink.stops?.length
        ? ink.blend === "random"
          ? {
              color1: ink.stops[0],
              color2: ink.stops[1 % ink.stops.length],
              color3: ink.stops[2 % ink.stops.length],
              color4: ink.stops[3 % ink.stops.length],
            }
          : { color1: ink, color2: ink, color3: ink, color4: ink }
        : { color1: ink, color2: ink, color3: ink, color4: ink };

    const rowLen = qr.size;
    const offset = (4 - params.lineThickness) / 2;
    const scale = rowLen / (rowLen * 4 - 2 * offset);
    const shift = -(offset * scale);
    const transform = `translate(${fmt(shift)},${fmt(shift)}) scale(${fmt(scale)})`;
    const fillSize = rowLen * 4;

    return neonPaths(qr, { ...params, ...palette, margin: 0 }, skipEyes).map(
      (region) => ({ ...region, transform, fillSize })
    );
  },
  linkedStamp: SHAPES.square,
};

// Adapted from qrframe "Quantum" (MIT).
PATTERNS.particles = {
  label: "Particles",
  kind: "merge",
  params: ["seed"],
  build: (qr, params, skipEyes) => {
    const rand = getSeededRand(params.seed);
    const range = (min, max) =>
      Math.trunc(100 * (rand() * (max - min) + min)) / 100;

    const rowLen = qr.size;
    const claimed = new Array(rowLen * rowLen).fill(false);
    let orbits = "";
    let dots = "";

    const on = (x, y) => {
      const module = qr.matrix[y * rowLen + x];
      return (
        (module & Module.ON) !== 0 && !(skipEyes && module & Module.FINDER)
      );
    };
    const free = (x, y) => on(x, y) && !claimed[y * rowLen + x];
    const claim = (x, y, r) => {
      claimed[y * rowLen + x] = true;
      dots += circlePath(x + 0.5, y + 0.5, r);
    };

    for (let y = 0; y < rowLen; y++) {
      for (let x = 0; x < rowLen; x++) {
        if (skipEyes && qr.matrix[y * rowLen + x] & Module.FINDER) {
          continue;
        }

        if (y < rowLen - 2 && x < rowLen - 2) {
          const a = range(-10, 10);
          const cross =
            free(x, y) &&
            free(x + 2, y) &&
            free(x + 1, y + 1) &&
            free(x, y + 2) &&
            free(x + 2, y + 2);
          const plus =
            free(x + 1, y) &&
            free(x, y + 1) &&
            free(x + 1, y + 1) &&
            free(x + 2, y + 1) &&
            free(x + 1, y + 2);

          if (cross) {
            orbits += `M${x + 0.5},${y + 0.5}a1.4,.35 ${45 + a},0,1 2,2a1.4,.35 ${45 + a},0,1 -2,-2`;
            orbits += `M${x + 2.5},${y + 0.5}a.35,1.4 ${45 + a},0,1 -2,2a.35,1.4 ${45 + a},0,1 2,-2`;
            claim(x, y, 0.2);
            claim(x + 2, y, 0.2);
            claim(x + 1, y + 1, range(0.3, 0.5));
            claim(x, y + 2, 0.2);
            claim(x + 2, y + 2, 0.2);
          }

          if (plus) {
            orbits += `M${x},${y + 1.55}a1,.35 ${a},0,1 3,0a1,.35 ${a},0,1 -3,0`;
            orbits += `M${x + 1.5},${y}a.35,1 ${a},0,1 0,3a.35,1 ${a},0,1 0,-3`;
            claim(x + 1, y, 0.2);
            claim(x, y + 1, 0.2);
            claim(x + 1, y + 1, range(0.3, 0.5));
            claim(x + 2, y + 1, 0.2);
            claim(x + 1, y + 2, 0.2);
          }
        }

        if (free(x, y)) {
          claim(x, y, range(0.3, 0.5));
        }
      }
    }

    const layers = [{ d: dots }];

    if (orbits) {
      layers.push({
        markup: `<path fill="none" stroke-width="0.1" d="${orbits}"/>`,
        stroked: true,
      });
    }

    return layers;
  },
  linkedStamp: PATTERNS["circle-mixed"].stamp,
};

PATTERNS.particles.solidEyes = true;

// Adapted from qrframe "Bubbles"
PATTERNS.bubbles = {
  label: "Bubbles",
  kind: "merge",
  params: ["seed", "randomize"],
  build: (qr, params, skipEyes) => {
    const rand = getSeededRand(params.seed);
    const size = params.randomize
      ? (min, max) => rand() * (max - min) + min
      : (min, max) => (max - min) / 2 + min;

    const rowLen = qr.size;
    const at = (x, y) => qr.matrix[y * rowLen + x];
    const seen = new Array(rowLen * rowLen).fill(false);
    const visited = (x, y) => seen[y * rowLen + x];
    const take = (x, y) => {
      seen[y * rowLen + x] = true;
    };

    const rings = ["", "", ""];
    let dots = "";

    for (let y = 0; y < rowLen; y++) {
      for (let x = 0; x < rowLen; x++) {
        const module = at(x, y);
        if (skipEyes && module & Module.FINDER) {
          continue;
        }
        if (visited(x, y)) {
          continue;
        }

        if (
          y < rowLen - 2 &&
          x < rowLen - 2 &&
          at(x + 1, y) &
            at(x, y + 1) &
            at(x + 2, y + 1) &
            at(x + 1, y + 2) &
            Module.ON &&
          !visited(x + 1, y) &&
          !visited(x + 2, y) &&
          !visited(x + 1, y + 1) &&
          !visited(x + 2, y + 1)
        ) {
          rings[0] += circlePath(x + 1.5, y + 1.5, size(0.8, 1.2));
          take(x + 1, y);
          take(x, y + 1);
          take(x + 2, y + 1);
          take(x + 1, y + 2);
          continue;
        }

        if (!(module & Module.ON)) {
          continue;
        }
        take(x, y);

        if (
          y < rowLen - 1 &&
          x < rowLen - 1 &&
          at(x + 1, y) & at(x, y + 1) & at(x + 1, y + 1) & Module.ON &&
          !visited(x + 1, y) &&
          !visited(x + 1, y + 1)
        ) {
          rings[1] += circlePath(x + 1, y + 1, size(0.4, 0.6));
          take(x + 1, y);
          take(x, y + 1);
          take(x + 1, y + 1);
          continue;
        }

        if (x < rowLen - 1 && at(x + 1, y) & Module.ON && !visited(x + 1, y)) {
          rings[2] += circlePath(x + 1, y + 0.5, size(0.4, 0.6));
          take(x + 1, y);
          continue;
        }
        if (y < rowLen - 1 && at(x, y + 1) & Module.ON && !visited(x, y + 1)) {
          rings[2] += circlePath(x + 0.5, y + 1, size(0.3, 0.5));
          take(x, y + 1);
          continue;
        }

        dots += circlePath(x + 0.5, y + 0.5, size(0.2, 0.4));
      }
    }

    const ink = params.dataColor || params.foreground;
    const palette =
      ink && typeof ink === "object" && ink.blend === "random" && ink.stops
        ? (i) => ink.stops[i % ink.stops.length]
        : () => ink;

    const layers = rings.map((d, i) => ({
      markup:
        d &&
        `<path fill="none" stroke-width="${fmt(0.6 - i * 0.1)}" d="${d}"/>`,
      stroked: true,
      fill: palette(i),
    }));

    layers.push({ d: dots, fill: palette(3) });

    return layers.filter((layer) => layer.d || layer.markup);
  },

  linkedStamp: PATTERNS["circle-mixed"].stamp,
};

PATTERNS.bubbles.solidEyes = true;

// Adapted from qrframe "Line" / QRBTF Line (MIT)
PATTERNS.alien = {
  label: "Alien",
  kind: "merge",
  params: ["seed"],
  build: (qr, params, skipEyes) => {
    const rand = getSeededRand(params.seed);
    const range = (min, max) => rand() * (max - min) + min;

    const rowLen = qr.size;
    const at = (x, y) => qr.matrix[y * rowLen + x];
    const on = (x, y) => {
      const module = at(x, y);
      return (
        (module & Module.ON) !== 0 && !(skipEyes && module & Module.FINDER)
      );
    };

    const threaded = [
      new Array(rowLen * rowLen).fill(false),
      new Array(rowLen * rowLen).fill(false),
    ];

    let dots = "";
    let threads = "";

    for (let y = 0; y < rowLen; y++) {
      for (let x = 0; x < rowLen; x++) {
        if (!on(x, y)) {
          continue;
        }

        dots += circlePath(x + 0.5, y + 0.5, range(0.2, 0.4));

        for (const [i, step] of [1, -1].entries()) {
          if (threaded[i][y * rowLen + x]) {
            continue;
          }

          let nx = x + step;
          let ny = y + 1;
          while (
            nx >= 0 &&
            nx < rowLen &&
            ny < rowLen &&
            on(nx, ny) &&
            !threaded[i][ny * rowLen + nx]
          ) {
            threaded[i][ny * rowLen + nx] = true;
            nx += step;
            ny++;
          }

          if (ny - y > 1) {
            threads += `<line x1="${x + 0.5}" y1="${y + 0.5}" x2="${fmt(nx - step + 0.5)}" y2="${ny - 0.5}" stroke-width="${fmt(range(0.1, 0.3))}"/>`;
          }
        }
      }
    }

    const ink = params.dataColor || params.foreground;
    const stop = (i) =>
      ink && typeof ink === "object" && ink.blend === "random" && ink.stops
        ? ink.stops[i % ink.stops.length]
        : ink;

    return [
      {
        markup: threads && `<g fill="none">${threads}</g>`,
        stroked: true,
        fill: stop(1),
      },
      { d: dots, fill: stop(0) },
    ].filter((layer) => layer.d || layer.markup);
  },
  linkedStamp: PATTERNS["circle-mixed"].stamp,
};

PATTERNS.alien.solidEyes = true;

// Adapted from qrframe "Blocks" / QRBTF DSJ (MIT)
PATTERNS.blocks = {
  label: "Blocks",
  kind: "merge",
  params: ["horizontalThickness", "verticalThickness", "crossThickness"],
  build: (qr, params, skipEyes) => {
    const rowLen = qr.size;
    const at = (x, y) => qr.matrix[y * rowLen + x];

    const ht = params.horizontalThickness;
    const ho = (1 - ht) / 2;
    const vt = params.verticalThickness;
    const vo = (1 - vt) / 2;
    const ct = params.crossThickness;
    const co = ct / Math.sqrt(8);

    const seen = new Array(rowLen * rowLen).fill(false);
    const visited = (x, y) => seen[y * rowLen + x];
    const take = (x, y) => {
      seen[y * rowLen + x] = true;
    };

    let crosses = "";
    let verticals = "";
    let horizontals = "";

    const bar = (x, y, w, h) =>
      `M${fmt(x)},${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}z`;

    for (let y = 0; y < rowLen; y++) {
      for (let x = 0; x < rowLen; x++) {
        const module = at(x, y);
        if (skipEyes && module & Module.FINDER) {
          continue;
        }
        if (!(module & Module.ON) || visited(x, y)) {
          continue;
        }
        take(x, y);

        if (
          y < rowLen - 2 &&
          x < rowLen - 2 &&
          at(x + 2, y) &
            at(x, y + 2) &
            at(x + 1, y + 1) &
            at(x + 2, y + 2) &
            Module.ON &&
          !visited(x + 1, y) &&
          !visited(x + 2, y) &&
          !visited(x, y + 1) &&
          !visited(x + 2, y + 1)
        ) {
          crosses += `<line x1="${fmt(x + co)}" y1="${fmt(y + co)}" x2="${fmt(x + 3 - co)}" y2="${fmt(y + 3 - co)}"/>`;
          crosses += `<line x1="${fmt(x + 3 - co)}" y1="${fmt(y + co)}" x2="${fmt(x + co)}" y2="${fmt(y + 3 - co)}"/>`;
          take(x + 2, y);
          take(x, y + 2);
          take(x + 1, y + 1);
          take(x + 2, y + 2);
          continue;
        }

        if (
          y < rowLen - 1 &&
          x < rowLen - 1 &&
          at(x + 1, y) & at(x, y + 1) & at(x + 1, y + 1) & Module.ON &&
          !visited(x + 1, y) &&
          !visited(x + 1, y + 1) &&
          !visited(x, y + 1)
        ) {
          crosses += `<line x1="${fmt(x + co)}" y1="${fmt(y + co)}" x2="${fmt(x + 2 - co)}" y2="${fmt(y + 2 - co)}"/>`;
          crosses += `<line x1="${fmt(x + 2 - co)}" y1="${fmt(y + co)}" x2="${fmt(x + co)}" y2="${fmt(y + 2 - co)}"/>`;
          take(x + 1, y);
          take(x, y + 1);
          take(x + 1, y + 1);
          continue;
        }

        let ny = y + 1;
        while (ny < rowLen && at(x, ny) & Module.ON && !visited(x, ny)) {
          ny++;
        }
        if (ny - y > 2) {
          verticals += bar(x + vo, y + vo, vt, ny - y - 1 - 2 * vo);
          verticals += bar(x + vo, ny - 1 + vo, vt, 1 - 2 * vo);
          for (let i = y + 1; i < ny; i++) {
            take(x, i);
          }
          continue;
        }

        let nx = x + 1;
        while (nx < rowLen && at(nx, y) & Module.ON && !visited(nx, y)) {
          take(nx, y);
          nx++;
        }
        horizontals += bar(x + ho, y + ho, nx - x - 2 * ho, ht);
      }
    }

    const ink = params.dataColor || params.foreground;
    const stop = (i) =>
      ink && typeof ink === "object" && ink.blend === "random" && ink.stops
        ? ink.stops[i % ink.stops.length]
        : ink;

    return [
      { d: verticals, fill: stop(1) },
      { d: horizontals, fill: stop(0) },
      {
        markup:
          crosses && `<g fill="none" stroke-width="${fmt(ct)}">${crosses}</g>`,
        stroked: true,
        fill: stop(2),
      },
    ].filter((layer) => layer.d || layer.markup);
  },
  linkedStamp: PATTERNS.plus.stamp,
};

PATTERNS.blocks.solidEyes = true;
PATTERNS.blob = {
  label: "Blob",
  kind: "merge",
  params: ["seed", "invert"],
  build: (qr, params, skipEyes) =>
    camoPaths(qr, { ...params, margin: 0, quietZone: 0 }, skipEyes),

  linkedStamp: linkedModuleStamp({
    axes: "both",
    cap: "round",
    isolated: "circle",
  }),
};

PATTERNS.mondrian = {
  label: "Mondrian",
  kind: "merge",
  params: ["cellColor", "lineColor", "lineThickness", "seed"],
  build: (qr, params, skipEyes) => {
    const rowLen = qr.size;
    const gap = (10 - params.lineThickness) / 20;
    const offset = gap / 2;
    const rand = getSeededRand(params.seed);
    const opaqueUnlit =
      !params.logoBackground && (params.backdrop ?? "solid") === "solid";

    const lit = (x, y) => {
      if (x < 0 || y < 0 || x >= qr.size || y >= qr.size) {
        return false;
      }

      const module = qr.matrix[y * qr.size + x];

      if (!(module & Module.ON)) {
        return false;
      }

      return !(skipEyes && module & Module.FINDER);
    };

    const ink = params.dataColor || params.foreground;
    const stops =
      ink && typeof ink === "object" && ink.blend === "random" && ink.stops
        ? ink.stops
        : [ink];

    const seen = new Array(rowLen * rowLen).fill(false);
    const darks = stops.map(() => "");
    let grid = "";
    let light = "";

    const hole = params.fillHole;
    const skipUnlit = params.fillUnlit === false;
    const skipLit = params.fillLit === false;

    if (hole) {
      for (let y = hole.y; y < hole.y + hole.size; y++) {
        for (let x = hole.x; x < hole.x + hole.size; x++) {
          seen[y * rowLen + x] = true;
        }
      }
    }

    for (let row = 0; row < rowLen; row++) {
      for (let col = 0; col < rowLen; col++) {
        if (seen[row * rowLen + col]) {
          continue;
        }

        const x = col;
        const y = row;
        const on = lit(x, y);
        seen[row * rowLen + col] = true;

        if ((!on && skipUnlit) || (on && skipLit)) {
          continue;
        }

        let width = 1;
        let height = 1;

        while (
          col + width < rowLen &&
          lit(x + width, y) === on &&
          !seen[row * rowLen + col + width]
        ) {
          seen[row * rowLen + col + width] = true;
          width++;
        }

        outer: while (row + height < rowLen) {
          for (let i = 0; i < width; i++) {
            if (
              lit(x + i, y + height) !== on ||
              seen[(row + height) * rowLen + col + i]
            ) {
              break outer;
            }
          }

          for (let i = 0; i < width; i++) {
            seen[(row + height) * rowLen + col + i] = true;
          }
          height++;
        }

        const hSide = width - gap;
        const vSide = height - gap;
        const block =
          `M${fmt(x + offset)},${fmt(y + offset)}` +
          `h${fmt(hSide)}v${fmt(vSide)}h${fmt(-hSide)}z`;

        if (on || opaqueUnlit) {
          grid += `M${fmt(x)},${fmt(y)}h${fmt(width)}v${fmt(height)}h${fmt(-width)}z`;
        }

        if (on) {
          darks[Math.floor(rand() * darks.length)] += block;
        } else if (opaqueUnlit) {
          light += block;
        }
      }
    }

    return [
      { d: grid, fill: params.lineColor || params.background },
      { d: light, fill: params.cellColor || params.background },
      ...darks.map((d, i) => ({ d, fill: stops[i] })),
    ].filter((layer) => layer.d);
  },

  linkedStamp: SHAPES.square,
};

PATTERNS.tile = {
  label: "Tile",
  kind: "merge",
  params: ["cellColor", "groutColor"],
  build: (qr, params, skipEyes) => {
    const rowLen = qr.size;

    const gap = 0.125;
    const offset = gap / 2;
    const opaqueUnlit =
      !params.logoBackground && (params.backdrop ?? "solid") === "solid";

    const hole = params.fillHole;

    let grout = "";
    let dark = "";
    let light = "";

    for (let y = 0; y < rowLen; y++) {
      for (let x = 0; x < rowLen; x++) {
        if (
          hole &&
          x >= hole.x &&
          x < hole.x + hole.size &&
          y >= hole.y &&
          y < hole.y + hole.size
        ) {
          continue;
        }

        const cell = qr.matrix[y * rowLen + x];
        const finder = cell & Module.FINDER;

        const on = cell & Module.ON && !(skipEyes && finder);

        if (
          (!on && params.fillUnlit === false) ||
          (on && params.fillLit === false)
        ) {
          continue;
        }

        if (!on && !opaqueUnlit) {
          continue;
        }

        grout += `M${fmt(x)},${fmt(y)}h1v1h-1z`;

        if (on && finder) {
          dark += `M${fmt(x)},${fmt(y)}h1v1h-1z`;
          continue;
        }

        const tiles = on ? 1 : 2;
        const tile = (1 - tiles * gap) / tiles;

        for (let dy = 0; dy < tiles; dy++) {
          const ny = y + offset + dy * (tile + gap);
          for (let dx = 0; dx < tiles; dx++) {
            const nx = x + offset + dx * (tile + gap);
            const square =
              `M${fmt(nx)},${fmt(ny)}` +
              `h${fmt(tile)}v${fmt(tile)}h${fmt(-tile)}z`;

            if (on) {
              dark += square;
            } else {
              light += square;
            }
          }
        }
      }
    }

    return [
      { d: grout, fill: params.groutColor || params.background },
      { d: light, fill: params.cellColor || params.background },
      { d: dark },
    ].filter((layer) => layer.d);
  },

  linkedStamp: SHAPES.square,
};

MARGINS.plain = { label: "Plain", build: () => "" };
MARGINS.extend = {
  label: "Extend pattern",
  build: (qr, params) => {
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
  },
};

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

const CLEARANCE = (params) => params.clearance ?? 2;

MARGINS.scatter = {
  label: "Scatter",
  pad: (params) => Math.max(0, CLEARANCE(params) + 1 - params.margin),
  build: (qr, params, pattern) => {
    const rand = getSeededRand(params.seed);

    const edge = params.margin + (params.frameFillPad ?? 0);
    const lo = Math.ceil(-edge);
    const hi = Math.floor(qr.size + edge);
    const span = hi - lo;

    const clear = CLEARANCE(params);
    const centre = qr.size / 2;
    const maxDist = Math.hypot(edge + centre, edge + centre);

    const eyes = EYE_ORIGINS(qr.size);
    const besideEye = (x, y) =>
      eyes.some(
        ([ex, ey]) => x >= ex - 1 && x <= ex + 7 && y >= ey - 1 && y <= ey + 7
      );

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

        if (besideEye(x, y)) {
          continue;
        }

        if (
          params.frameContains &&
          !(
            params.frameContains(x, y) &&
            params.frameContains(x + 1, y) &&
            params.frameContains(x, y + 1) &&
            params.frameContains(x + 1, y + 1)
          )
        ) {
          continue;
        }

        const dist = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
        let ratio = 1;

        if (params.dotSize === "Center") {
          ratio = 1.2 - dist / maxDist;
        } else if (params.dotSize === "Edge") {
          ratio = 0.4 + dist / maxDist;
        } else if (params.dotSize === "Random") {
          ratio = rand() * 0.5 + 0.6;
        }

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
  },
};

MARGINS.flood = {
  label: "Flood",
  build: (qr, params, pattern) => {
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
  },
};

MARGINS.mosaic = {
  label: "Mosaic",
  pad: (params) =>
    Math.max(0, (params.outerSquare ?? 0) + 1 - (params.margin ?? 0)),
  build: (qr, params, pattern) => {
    const edge = params.margin + (params.frameFillPad ?? 0);
    const lo = Math.ceil(-edge);
    const hi = Math.floor(qr.size + edge);
    const span = hi - lo;

    const inner = params.innerSquare ?? 0;
    const outer = params.outerSquare ?? 0;
    const end = qr.size - 1;

    const ring = (x, y, at) =>
      at > 0 &&
      ((y === -at && x >= -at && x <= end + at) ||
        ((x === -at || x === end + at) && y >= 1 - at && y <= end + at - 1) ||
        (y === end + at && x >= -at && x <= end + at));

    const cells = new Uint8Array(span * span);

    for (let y = lo; y < hi; y++) {
      for (let x = lo; x < hi; x++) {
        if (
          x >= -inner &&
          x < qr.size + inner &&
          y >= -inner &&
          y < qr.size + inner &&
          !ring(x, y, inner)
        ) {
          continue;
        }

        let on = ring(x, y, outer) || ring(x, y, inner);

        if (
          !on &&
          x > -outer &&
          x < end + outer &&
          y > -outer &&
          y < end + outer
        ) {
          on = ((x + y) & 1) !== 0;
        } else if (!on) {
          const px = x - lo;
          const py = y - lo;
          const line = px % 4 === 0 || px === span - 1;
          const down = py % 4 === 0 || py === span - 1;
          on =
            line || down
              ? true
              : (px % 8 < 4 && py % 8 < 4) || (px % 8 > 4 && py % 8 > 4);
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
  },
};

EFFECTS.none = {
  label: "None",
  wrap: (layers, params, qr) => composeSvg(layers, params, qr),
};

EFFECTS.glow = {
  label: "Glow",
  params: ["glowAmount"],
  wrap: (layers, params, qr) =>
    composeSvg(layers, params, qr, {
      defs: [
        `<filter id="qsGlow"><feGaussianBlur stdDeviation="${fmt(params.glowAmount ?? 0.5)}"/><feComposite in2="SourceGraphic" operator="over"/></filter>`,
      ],
      layerAttrs: () => `filter="url(#qsGlow)"`,
    }),
};

// Adapted from qrframe "Glass" (MIT)
function glassShards(size, params, stroke) {
  const rowLen = Math.ceil(size);
  const rand = getSeededRand(params.seed);
  const unit = 4;
  const offset = params.shapeGap / 2;
  const thin = unit - params.shapeGap;
  const max = rowLen - 1;

  const group = new Array(rowLen * rowLen).fill(0);
  const visited = new Array(rowLen * rowLen).fill(false);

  const queue = [];
  while (queue.length < params.shapes) {
    const x = Math.floor(rand() * rowLen);
    const y = Math.floor(rand() * rowLen);
    if (queue.some(([sx, sy]) => sx === x && sy === y)) {
      continue;
    }
    queue.push([x, y]);
    group[y * rowLen + x] = queue.length;
  }
  while (queue.length) {
    const [x, y] = queue.shift();
    const id = group[y * rowLen + x];
    for (const [nx, ny] of [
      [x - 1, y],
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx > max || ny > max) {
        continue;
      }
      if (!group[ny * rowLen + nx]) {
        queue.push([nx, ny]);
        group[ny * rowLen + nx] = id;
      }
    }
  }

  let markup = "";
  let baseX;
  let baseY;
  const owns = (x, y, id) => group[y * rowLen + x] === id;

  function go(x, y, dx, dy, id) {
    visited[y * rowLen + x] = true;
    let concave = false;

    let nx = x + dx;
    let ny = y + dy;
    while (nx >= 0 && nx <= max && ny >= 0 && ny <= max) {
      const next = owns(nx, ny, id);
      const cx = nx + dy;
      const cy = ny - dx;
      const diag =
        cx >= 0 && cx <= max && cy >= 0 && cy <= max && owns(cx, cy, id);
      if (!next || diag) {
        concave = next && diag;
        break;
      }
      visited[ny * rowLen + nx] = true;
      nx += dx;
      ny += dy;
    }

    if (nx - dx === baseX && ny - dy === baseY && dy === -1) {
      markup += "z";
      return;
    }

    if (concave) {
      markup += dx
        ? `h${(nx - x) * unit}v${-dx * 2 * offset}`
        : `v${(ny - y) * unit}h${dy * 2 * offset}`;
      go(nx + dy, ny - dx, dy, -dx, id);
    } else {
      markup += dx
        ? `h${(nx - x - dx) * unit + dx * thin}`
        : `v${(ny - y - dy) * unit + dy * thin}`;
      go(nx - dx, ny - dy, -dy, dx, id);
    }
  }

  const fill = () =>
    `#${Array.from({ length: 3 }, () =>
      Math.floor(rand() * 255)
        .toString(16)
        .padStart(2, "0")
    ).join("")}`;

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (visited[y * rowLen + x]) {
        continue;
      }

      const id = group[y * rowLen + x];
      if (
        (y > 0 &&
          group[(y - 1) * rowLen + x] === id &&
          visited[(y - 1) * rowLen + x]) ||
        (x > 0 &&
          group[y * rowLen + x - 1] === id &&
          visited[y * rowLen + x - 1])
      ) {
        visited[y * rowLen + x] = true;
        continue;
      }

      markup += `<path stroke="${stroke}" stroke-width="${fmt(params.strokeWidth)}" fill="${fill()}" fill-opacity="${fmt(params.shapeOpacity)}" d="M${x * unit + offset},${y * unit + offset}`;
      baseX = x;
      baseY = y;
      go(x, y, 1, 0, id);
      markup += `"/>`;
    }
  }

  return markup;
}

const SKETCH_UNIT = 10;

function transformScale(attrs) {
  const value = /transform="([^"]*)"/.exec(attrs)?.[1];
  if (!value) {
    return 1;
  }

  const matrix = /matrix\(([^)]*)\)/.exec(value);
  if (matrix) {
    const [a, b, c, d] = matrix[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    return Math.sqrt(Math.abs(a * d - b * c)) || 1;
  }

  const scale = /scale\(([^)]*)\)/.exec(value);
  if (scale) {
    const [x, y] = scale[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    return Math.sqrt(Math.abs(x * (y ?? x))) || 1;
  }

  return 1;
}

function polygonPath(points) {
  const nums = points
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  let d = "";
  for (let i = 0; i + 1 < nums.length; i += 2) {
    d += `${i ? "L" : "M"}${nums[i]},${nums[i + 1]}`;
  }
  return d && `${d}z`;
}

const ARTWORK_TAG = /<(\/?)([a-z]+)([^>]*?)(\/?)>/gi;

function sketchArtwork(markup, sketchPath) {
  const scales = [];
  let scale = 1;
  let skipClose = null;
  let out = "";
  let last = 0;
  let tag;

  ARTWORK_TAG.lastIndex = 0;
  while ((tag = ARTWORK_TAG.exec(markup)) !== null) {
    const [whole, closing, name, attrs, selfClosing] = tag;
    out += markup.slice(last, tag.index);
    last = tag.index + whole.length;

    if (name === "g") {
      if (closing) {
        scale /= scales.pop() ?? 1;
      } else {
        const factor = transformScale(attrs);
        scales.push(factor);
        scale *= factor;
      }
      out += whole;
      continue;
    }

    if (closing) {
      if (skipClose === name) {
        skipClose = null;
      } else {
        out += whole;
      }
      continue;
    }

    const d =
      name === "path"
        ? /\bd="([^"]*)"/.exec(attrs)?.[1]
        : name === "polygon"
          ? polygonPath(/\bpoints="([^"]*)"/.exec(attrs)?.[1] ?? "")
          : null;

    if (!d || /fill="none"/.test(attrs)) {
      out += whole;
      continue;
    }

    const own = /transform="([^"]*)"/.exec(attrs)?.[1];
    const unit = SKETCH_UNIT * scale * transformScale(attrs) * EYE_SCALE;
    const shrink = `scale(${fmt(1 / unit)})`;

    out += `<g transform="${own ? `${own} ${shrink}` : shrink}">${sketchPath(d, unit)}</g>`;
    skipClose = selfClosing ? null : name;
  }

  return out + markup.slice(last);
}

EFFECTS.sketch = {
  label: "Drawing",
  params: [
    "roughness",
    "bowing",
    "fillStyle",
    "fillWeight",
    "fillGap",
    "strokeWidth",
    "seed",
  ],
  wrap: (layers, params, qr) => {
    if (typeof rough === "undefined") {
      throw new Error(
        "The drawing effect requires roughjs (global `rough`) to be loaded"
      );
    }

    const gen = rough.generator({
      options: {
        roughness: params.roughness,
        bowing: params.bowing,
        fillStyle: String(params.fillStyle ?? "hachure").toLowerCase(),
        fillWeight: params.fillWeight,
        hachureGap: params.fillGap,
        strokeWidth: params.strokeWidth,
        fill: params.fillWeight === 0 ? undefined : "#000",
        stroke: params.strokeWidth === 0 ? "none" : "#000",
        seed: params.seed,
      },
    });

    const sketchPath = (d, unit) => {
      let markup = "";
      for (const part of gen.toPaths(gen.path(scalePath(d, unit)))) {
        if (!part.d) {
          continue;
        }
        markup +=
          part.fill && part.fill !== "none"
            ? `<path stroke="none" d="${part.d}"/>`
            : `<path fill="none" stroke-width="${part.strokeWidth}" d="${part.d}"/>`;
      }
      return markup;
    };

    const sketch = (layer) => {
      if (layer.markup) {
        return {
          ...layer,
          markup: sketchArtwork(layer.markup, sketchPath),
          stroked: true,
        };
      }
      if (!layer.d) {
        return layer;
      }

      const shrink = `scale(${fmt(1 / SKETCH_UNIT)})`;

      return {
        ...layer,
        d: undefined,
        markup: sketchPath(layer.d, SKETCH_UNIT),
        stroked: true,
        transform: layer.transform ? `${layer.transform} ${shrink}` : shrink,
      };
    };

    return composeSvg(layers.map(sketch), params, qr);
  },
};

// Adapted from qrframe "Layers" (MIT)
EFFECTS.layers = {
  label: "Layers",
  params: ["offsetX", "offsetY", "blendMode"],
  wrap: (layers, params, qr) => {
    const ink = params.foreground;
    const stops =
      ink && typeof ink === "object" && ink.stops?.length ? ink.stops : [ink];
    const mid = (stops.length - 1) / 2;

    const copies = stops.flatMap((fill, i) => {
      const shift = mid
        ? `translate(${fmt((params.offsetX * (mid - i)) / mid)},${fmt(
            (params.offsetY * (mid - i)) / mid
          )})`
        : null;

      return layers.map((layer) => ({
        ...layer,
        fill,
        transform:
          [shift, layer.transform].filter(Boolean).join(" ") || undefined,
      }));
    });

    return composeSvg(copies, params, qr, {
      beforeLayers: `<g style="mix-blend-mode:${params.blendMode}">`,
      afterLayers: `</g>`,
    });
  },
};

EFFECTS.glass = {
  label: "Glass",
  params: [
    "shapes",
    "strokeWidth",
    "shapeGap",
    "shapeOpacity",
    "qrLayer",
    "seed",
  ],
  wrap: (layers, params, qr) => {
    const margin = params.margin + (params.framePad ?? 0);
    const rowLen = qr.size + 2 * margin;

    const defs = [];
    const stroke = paint(params.dataColor || params.foreground, defs);
    const shards = `<g transform="translate(${fmt(-margin)},${fmt(-margin)}) scale(0.25)">${glassShards(rowLen, params, stroke)}</g>`;

    return composeSvg(layers, params, qr, {
      defs,
      ...(params.qrLayer === "Below"
        ? { afterLayers: shards }
        : { beforeLayers: shards }),
    });
  },
};

const finderBoxes = (qr) =>
  [
    [0, 0],
    [qr.size - 7, 0],
    [0, qr.size - 7],
  ]
    .map(([x, y]) => `M${x},${y}h7v7h-7z`)
    .join("");

const flaggedBoxes = (qr, flag, lit) => {
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
};

const BACKGROUND_WASH_OPACITY = 0.1;
const BACKGROUND_DATA_SCALE = 0.4;
const BACKGROUND_EYE_WASH_OPACITY = 0.6;
const BACKGROUND_EYE_MARGIN = 1;

function lightModules(qr, params, skipEyes, pattern) {
  if (pattern.kind !== "stamp") {
    return "";
  }

  const unlit = {
    ...qr,
    matrix: qr.matrix.map((cell) =>
      cell & Module.LOGO ? cell : cell ^ Module.ON
    ),
  };

  return stampModules(unlit, params, skipEyes, pattern.stamp);
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
  const surroundPad = unframed ? (marginTreatment.pad?.(params) ?? 0) : 0;
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

// ---------------------------------------------------------------------------
// Registry + entry point
// ---------------------------------------------------------------------------

const DEFAULT_STYLE = "basic";

const STYLES = {
  basic: {
    label: "Basic",
    render: (qr, params) =>
      renderStyled(qr, {
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
      }),
  },
  dots: {
    label: "Dots",
    render: (qr, params) =>
      renderStyled(qr, {
        pattern: "circle",
        effect: "none",
        marginStyle: "plain",
        eyeFrame: "extra-rounded",
        eyeIn: "circle",
        params: { ...params, dataScale: params.dotScale },
      }),
  },
  camo: {
    label: "Camo",
    render: (qr, params) =>
      renderStyled(qr, {
        pattern: "blob",
        effect: "none",
        marginStyle: "scatter",
        eyeFrame: "default",
        eyeIn: "default",
        params: { ...params, clearance: params.quietZone ?? 1, density: 0.5 },
      }),
  },
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
const knownEye = (key, generated, imported) =>
  key in generated || key in imported ? key : "default";

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
