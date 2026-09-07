/* eslint-disable no-bitwise */ // QR module flags are bit fields
import { getSeededRand, Module } from "../../matrix.js";
import { circlePath, formatNum } from "../../shapes.js";
import { STAMP_PATTERNS } from "../small-patterns.js";
import { colorStops } from "./color-stops.js";

// Adapted from qrframe "Line" / QRBTF Line (MIT)
function buildAlienPattern(qr, params, skipEyes) {
  const rand = getSeededRand(params.seed);
  const range = (min, max) => rand() * (max - min) + min;

  const rowLen = qr.size;
  const at = (x, y) => qr.matrix[y * rowLen + x];
  const on = (x, y) => {
    const module = at(x, y);
    return (module & Module.ON) !== 0 && !(skipEyes && module & Module.FINDER);
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
          threads += `<line x1="${x + 0.5}" y1="${y + 0.5}" x2="${formatNum(nx - step + 0.5)}" y2="${ny - 0.5}" stroke-width="${formatNum(range(0.1, 0.3))}"/>`;
        }
      }
    }
  }

  const stops = colorStops(params.dataColor || params.foreground);
  const stop = (i) => stops[i % stops.length];

  return [
    {
      markup: threads && `<g fill="none">${threads}</g>`,
      stroked: true,
      fill: stop(1),
    },
    { d: dots, fill: stop(0) },
  ].filter((layer) => layer.d || layer.markup);
}

export default {
  label: "Alien",
  kind: "merge",
  params: ["seed"],
  build: buildAlienPattern,
  linkedStamp: STAMP_PATTERNS["circle-mixed"].stamp,
  solidEyes: true,
};
