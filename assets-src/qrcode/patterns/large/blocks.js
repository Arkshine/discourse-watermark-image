/* eslint-disable no-bitwise */ // QR module flags are bit fields
import { Module } from "../../matrix.js";
import { formatNum } from "../../shapes.js";
import { STAMP_PATTERNS } from "../small-patterns.js";
import { colorStops } from "./color-stops.js";

// Adapted from qrframe "Blocks" / QRBTF DSJ (MIT)
function buildBlocksPattern(qr, params, skipEyes) {
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
    `M${formatNum(x)},${formatNum(y)}h${formatNum(w)}v${formatNum(h)}h${formatNum(-w)}z`;

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
        crosses += `<line x1="${formatNum(x + co)}" y1="${formatNum(y + co)}" x2="${formatNum(x + 3 - co)}" y2="${formatNum(y + 3 - co)}"/>`;
        crosses += `<line x1="${formatNum(x + 3 - co)}" y1="${formatNum(y + co)}" x2="${formatNum(x + co)}" y2="${formatNum(y + 3 - co)}"/>`;
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
        crosses += `<line x1="${formatNum(x + co)}" y1="${formatNum(y + co)}" x2="${formatNum(x + 2 - co)}" y2="${formatNum(y + 2 - co)}"/>`;
        crosses += `<line x1="${formatNum(x + 2 - co)}" y1="${formatNum(y + co)}" x2="${formatNum(x + co)}" y2="${formatNum(y + 2 - co)}"/>`;
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

  const stops = colorStops(params.dataColor || params.foreground);
  const stop = (i) => stops[i % stops.length];

  return [
    { d: verticals, fill: stop(1) },
    { d: horizontals, fill: stop(0) },
    {
      markup:
        crosses &&
        `<g fill="none" stroke-width="${formatNum(ct)}">${crosses}</g>`,
      stroked: true,
      fill: stop(2),
    },
  ].filter((layer) => layer.d || layer.markup);
}

export default {
  label: "Blocks",
  kind: "merge",
  params: ["horizontalThickness", "verticalThickness", "crossThickness"],
  build: buildBlocksPattern,
  linkedStamp: STAMP_PATTERNS.plus.stamp,
  solidEyes: true,
};
