/* eslint-disable no-bitwise */ // QR module flags are bit fields

import { Module } from "../matrix.js";
import { formatNum, shapePath } from "../shapes.js";

const RUN_CAPS = {
  round: (x, y, len, thick, horizontal) => {
    const r = thick / 2;

    return horizontal
      ? `M${formatNum(x + r)},${formatNum(y)}H${formatNum(x + len - r)}` +
          `A${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(x + len - r)},${formatNum(y + thick)}` +
          `H${formatNum(x + r)}A${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(x + r)},${formatNum(y)}z`
      : `M${formatNum(x)},${formatNum(y + r)}` +
          `A${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(x + thick)},${formatNum(y + r)}` +
          `V${formatNum(y + len - r)}` +
          `A${formatNum(r)},${formatNum(r)} 0 0 1 ${formatNum(x)},${formatNum(y + len - r)}z`;
  },

  square: (x, y, len, thick, horizontal) => {
    const w = horizontal ? len : thick;
    const h = horizontal ? thick : len;

    return `M${formatNum(x)},${formatNum(y)}h${formatNum(w)}v${formatNum(h)}h${formatNum(-w)}z`;
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
    const arc = `A${formatNum(r)},${formatNum(r)} 0 0 1 `;

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
    const arc = `A${formatNum(rx)},${formatNum(ry)} 45 0 1 `;

    return (
      `M${formatNum(cx - rx * k)},${formatNum(cy - rx * k)}` +
      arc +
      `${formatNum(cx + rx * k)},${formatNum(cy + rx * k)}` +
      arc +
      `${formatNum(cx - rx * k)},${formatNum(cy - rx * k)}z`
    );
  },
};

function runPoint(x, y, a, b, thick, horizontal) {
  return horizontal
    ? `${formatNum(x + a)},${formatNum(y + b)}`
    : `${formatNum(x + thick - b)},${formatNum(y + a)}`;
}

function capPolygon(points, x, y, thick, horizontal) {
  return (
    "M" +
    points.map(([a, b]) => runPoint(x, y, a, b, thick, horizontal)).join("L") +
    "z"
  );
}

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
    d += `${i === 0 ? "M" : "L"}${formatNum(ex)},${formatNum(ey)}`;

    if (corner.cut) {
      const [ox, oy] = corner.exit;
      d += round
        ? `A${formatNum(half)},${formatNum(half)} 0 0 1 ${formatNum(ox)},${formatNum(oy)}`
        : `L${formatNum(ox)},${formatNum(oy)}`;
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

export { linkedModuleStamp, runPaths };
