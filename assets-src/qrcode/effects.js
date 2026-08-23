/* eslint-disable no-undef */ // roughjs global `rough`
import { EYE_SCALE } from "./eyes/eye-art.js";
import { getSeededRand } from "./matrix.js";
import { composeSvg } from "./patterns/svg-compose.js";
import { formatNum, resolvePaint, scalePath } from "./shapes.js";

const SKETCH_UNIT = 10;
const ARTWORK_TAG = /<(\/?)([a-z]+)([^>]*?)(\/?)>/gi;

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

      markup += `<path stroke="${stroke}" stroke-width="${formatNum(params.strokeWidth)}" fill="${fill()}" fill-opacity="${formatNum(params.shapeOpacity)}" d="M${x * unit + offset},${y * unit + offset}`;
      baseX = x;
      baseY = y;
      go(x, y, 1, 0, id);
      markup += `"/>`;
    }
  }

  return markup;
}

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
    const shrink = `scale(${formatNum(1 / unit)})`;

    out += `<g transform="${own ? `${own} ${shrink}` : shrink}">${sketchPath(d, unit)}</g>`;
    skipClose = selfClosing ? null : name;
  }

  return out + markup.slice(last);
}

function sketchWrap(layers, params, qr) {
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

    const shrink = `scale(${formatNum(1 / SKETCH_UNIT)})`;

    return {
      ...layer,
      d: undefined,
      markup: sketchPath(layer.d, SKETCH_UNIT),
      stroked: true,
      transform: layer.transform ? `${layer.transform} ${shrink}` : shrink,
    };
  };

  return composeSvg(layers.map(sketch), params, qr);
}

// Adapted from qrframe "Layers" (MIT)
function layersWrap(layers, params, qr) {
  const ink = params.foreground;
  const stops =
    ink && typeof ink === "object" && ink.stops?.length ? ink.stops : [ink];
  const mid = (stops.length - 1) / 2;

  const copies = stops.flatMap((fill, i) => {
    const shift = mid
      ? `translate(${formatNum((params.offsetX * (mid - i)) / mid)},${formatNum(
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
}

function glassWrap(layers, params, qr) {
  const margin = params.margin + (params.framePad ?? 0);
  const rowLen = qr.size + 2 * margin;

  const defs = [];
  const stroke = resolvePaint(params.dataColor || params.foreground, defs);
  const shards = `<g transform="translate(${formatNum(-margin)},${formatNum(-margin)}) scale(0.25)">${glassShards(rowLen, params, stroke)}</g>`;

  return composeSvg(layers, params, qr, {
    defs,
    ...(params.qrLayer === "Below"
      ? { afterLayers: shards }
      : { beforeLayers: shards }),
  });
}

function noneWrap(layers, params, qr) {
  return composeSvg(layers, params, qr);
}

function glowWrap(layers, params, qr) {
  return composeSvg(layers, params, qr, {
    defs: [
      `<filter id="qsGlow"><feGaussianBlur stdDeviation="${formatNum(params.glowAmount ?? 0.5)}"/><feComposite in2="SourceGraphic" operator="over"/></filter>`,
    ],
    layerAttrs: () => `filter="url(#qsGlow)"`,
  });
}

const EFFECTS = {
  none: { label: "None", wrap: noneWrap },
  glow: { label: "Glow", params: ["glowAmount"], wrap: glowWrap },

  sketch: {
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
    wrap: sketchWrap,
  },

  layers: {
    label: "Layers",
    params: ["offsetX", "offsetY", "blendMode"],
    wrap: layersWrap,
  },

  glass: {
    label: "Glass",
    params: [
      "shapes",
      "strokeWidth",
      "shapeGap",
      "shapeOpacity",
      "qrLayer",
      "seed",
    ],
    wrap: glassWrap,
  },
};

export { EFFECTS, sketchArtwork, transformScale };
