import { MARGINS } from "../margins.js";
import { formatNum } from "../shapes.js";
import { ICON_FRAMES_D } from "./frame-icons-data.js";

const FRAME_CLEARANCE = 0.02;
const HEX_COS60 = Math.cos(Math.PI / 3);
const HEX_SIN60 = Math.sin(Math.PI / 3);
const ICON_UNIT = 24;

function iconPlacement(qr, params, edge) {
  const radius = qr.size / 2 + edge - FRAME_CLEARANCE;

  return {
    scale: (2 * radius) / ICON_UNIT,
    x: qr.size / 2 - radius,
    y: qr.size / 2 - radius,
  };
}

function circleFrameRadius(qr, params) {
  return ((qr.size + 2 * params.margin) * Math.SQRT2) / 2;
}

function circleFramePad(qr, params) {
  return (
    circleFrameRadius(qr, params) +
    0.5 +
    FRAME_CLEARANCE -
    (qr.size / 2 + params.margin)
  );
}

function annulus(cx, cy, outer, inner) {
  const ring = (radius, cw) => {
    const r = formatNum(radius);

    return (
      `M${formatNum(cx - r)},${formatNum(cy)}` +
      `a${r},${r} 0 1,${cw ? 1 : 0} ${formatNum(2 * r)},0` +
      `a${r},${r} 0 1,${cw ? 1 : 0} ${formatNum(-2 * r)},0z`
    );
  };

  return ring(outer, true) + ring(inner, false);
}

function disc(cx, cy, radius) {
  const r = formatNum(radius);

  return (
    `M${formatNum(cx - r)},${formatNum(cy)}` +
    `a${r},${r} 0 1,1 ${formatNum(2 * r)},0` +
    `a${r},${r} 0 1,1 ${formatNum(-2 * r)},0z`
  );
}

function hexPoints(cx, cy, radius) {
  const points = [];

  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(
      `${formatNum(cx + radius * Math.cos(angle))},${formatNum(cy + radius * Math.sin(angle))}`
    );
  }

  return points;
}

function roundedCornersEnclosure(qr, outer) {
  const edge = outer - qr.size / 2;
  const arm = (qr.size + 2 * edge) / 4;
  const r = Math.min(2, arm / 2);

  return { lo: -edge, hi: qr.size + edge, r };
}

function roundedCornersBackdrop(qr, params, outer) {
  const { lo, hi, r } = roundedCornersEnclosure(qr, outer);

  return (
    `M${formatNum(lo + r)},${formatNum(lo)}` +
    `H${formatNum(hi - r)}A${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(hi)},${formatNum(lo + r)}` +
    `V${formatNum(hi - r)}A${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(hi - r)},${formatNum(hi)}` +
    `H${formatNum(lo + r)}A${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(lo)},${formatNum(hi - r)}` +
    `V${formatNum(lo + r)}A${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(lo + r)},${formatNum(lo)}z`
  );
}

function roundedCornersFillContains(qr, params, outer) {
  const { lo, hi, r } = roundedCornersEnclosure(qr, outer);

  return (x, y) => {
    const cx = Math.min(Math.max(x, lo + r), hi - r);
    const cy = Math.min(Math.max(y, lo + r), hi - r);

    return Math.hypot(x - cx, y - cy) <= r;
  };
}

function roundedCornersBuild(qr, params, edge) {
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
        `M${formatNum(x + sx * arm)},${formatNum(y)}` +
        `L${formatNum(x + sx * r)},${formatNum(y)}` +
        `A${formatNum(r)},${formatNum(r)} 0 0 ${sweep} ${formatNum(x)},${formatNum(y + sy * r)}` +
        `L${formatNum(x)},${formatNum(y + sy * arm)}` +
        `L${formatNum(x + sx * thick)},${formatNum(y + sy * arm)}` +
        `L${formatNum(x + sx * thick)},${formatNum(y + sy * (r + thick))}` +
        `A${formatNum(r)},${formatNum(r)} 0 0 ${1 - sweep} ${formatNum(x + sx * (r + thick))},${formatNum(y + sy * thick)}` +
        `L${formatNum(x + sx * arm)},${formatNum(y + sy * thick)}z`;
    }
  }

  return d;
}

function roundedBorderBackdrop(qr, params, outer) {
  const lo = qr.size / 2 - outer + FRAME_CLEARANCE;
  const side = (outer - FRAME_CLEARANCE) * 2;
  const r = Math.min(3, side / 6);

  return (
    `M${formatNum(lo + r)},${formatNum(lo)}h${formatNum(side - 2 * r)}` +
    `a${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(r)},${formatNum(r)}v${formatNum(side - 2 * r)}` +
    `a${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(-r)},${formatNum(r)}h${formatNum(-(side - 2 * r))}` +
    `a${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(-r)},${formatNum(-r)}v${formatNum(-(side - 2 * r))}` +
    `a${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(r)},${formatNum(-r)}z`
  );
}

function roundedBorderRoundedSide(x0, y0, x1, y1, radius, cw) {
  const a = `A${formatNum(radius)},${formatNum(radius)} 0 0 ${cw ? 1 : 0} `;
  return cw
    ? `M${formatNum(x0 + radius)},${formatNum(y0)}H${formatNum(x1 - radius)}${a}${formatNum(x1)},${formatNum(y0 + radius)}` +
        `V${formatNum(y1 - radius)}${a}${formatNum(x1 - radius)},${formatNum(y1)}` +
        `H${formatNum(x0 + radius)}${a}${formatNum(x0)},${formatNum(y1 - radius)}` +
        `V${formatNum(y0 + radius)}${a}${formatNum(x0 + radius)},${formatNum(y0)}z`
    : `M${formatNum(x0 + radius)},${formatNum(y0)}${a}${formatNum(x0)},${formatNum(y0 + radius)}` +
        `V${formatNum(y1 - radius)}${a}${formatNum(x0 + radius)},${formatNum(y1)}` +
        `H${formatNum(x1 - radius)}${a}${formatNum(x1)},${formatNum(y1 - radius)}` +
        `V${formatNum(y0 + radius)}${a}${formatNum(x1 - radius)},${formatNum(y0)}z`;
}

function roundedBorderBuild(qr, params, edge) {
  const thick = params.frameThickness ?? 0.5;
  const outer = qr.size + 2 * edge;
  const r = Math.min(3, outer / 6);
  const lo = -edge;
  const hi = qr.size + edge;
  const ri = r - thick > 0 ? r - thick : 0;

  return (
    roundedBorderRoundedSide(lo, lo, hi, hi, r, true) +
    roundedBorderRoundedSide(
      lo + thick,
      lo + thick,
      hi - thick,
      hi - thick,
      ri,
      false
    )
  );
}

const none = { pad: () => 0, build: () => "" };

const FRAMES = {
  none,
  "band-bottom": none,
  "band-top": none,
  "band-bottom-square": none,
  "band-top-square": none,
  "ribbon-bottom": none,
  "ribbon-top": none,
  "bubble-bottom": none,
  "bubble-top": none,

  border: {
    pad: () => 1,
    build: (qr, params, edge) => {
      const thick = params.frameThickness ?? 0.5;
      const outer = qr.size + 2 * edge;

      return (
        `M${formatNum(-edge)},${formatNum(-edge)}h${formatNum(outer)}v${formatNum(outer)}h${formatNum(-outer)}z` +
        `M${formatNum(-edge + thick)},${formatNum(-edge + thick)}` +
        `v${formatNum(outer - 2 * thick)}h${formatNum(outer - 2 * thick)}` +
        `v${formatNum(-(outer - 2 * thick))}z`
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
            `M${formatNum(x)},${formatNum(y)}` +
            `L${formatNum(x + sx * arm)},${formatNum(y)}` +
            `L${formatNum(x + sx * arm)},${formatNum(y + sy * thick)}` +
            `L${formatNum(x + sx * thick)},${formatNum(y + sy * thick)}` +
            `L${formatNum(x + sx * thick)},${formatNum(y + sy * arm)}` +
            `L${formatNum(x)},${formatNum(y + sy * arm)}z`;
        }
      }

      return d;
    },
  },
};

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
        `${formatNum(cx + rad * Math.cos(angle))},${formatNum(cy + rad * Math.sin(angle))}`;

      d +=
        `M${at(r, a0)}A${formatNum(r)},${formatNum(r)} 0 0 1 ${at(r, a1)}` +
        `L${at(inner, a1)}A${formatNum(inner)},${formatNum(inner)} 0 0 0 ${at(inner, a0)}z`;
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

const circleFrameFills = {
  "circle-double": { shape: "disc", rings: 3 },
  hexagon: { shape: "hex", rings: 1 },
};

for (const [key, d] of Object.entries(ICON_FRAMES_D)) {
  FRAMES[key] = {
    pad: circleFramePad,
    build: (qr, params, edge) => {
      const { scale, x, y } = iconPlacement(qr, params, edge);

      return {
        d,
        transform: `translate(${formatNum(x)},${formatNum(y)}) scale(${formatNum(scale)})`,
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

Object.assign(FRAMES, {
  "rounded-corners": {
    pad: () => 1,
    backdrop: roundedCornersBackdrop,
    fillShape: roundedCornersBackdrop,
    fillContains: roundedCornersFillContains,
    build: roundedCornersBuild,
  },
  "border-inset": {
    pad: () => 0,
    build: (qr, params) => MARGINS.extend.build(qr, params),
  },
  "rounded-border": {
    pad: () => 1,
    backdrop: roundedBorderBackdrop,
    build: roundedBorderBuild,
  },
});

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

export { FRAMES, frameClipPath };
