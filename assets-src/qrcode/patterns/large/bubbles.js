/* eslint-disable no-bitwise */ // QR module flags are bit fields
import { getSeededRand, Module } from "../../matrix.js";
import { circlePath, formatNum } from "../../shapes.js";
import { STAMP_PATTERNS } from "../small-patterns.js";
import { colorStops } from "./color-stops.js";

// Adapted from qrframe "Bubbles"
function buildBubblesPattern(qr, params, skipEyes) {
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

  const stops = colorStops(params.dataColor || params.foreground);
  const palette = (i) => stops[i % stops.length];

  const layers = rings.map((d, i) => ({
    markup:
      d &&
      `<path fill="none" stroke-width="${formatNum(0.6 - i * 0.1)}" d="${d}"/>`,
    stroked: true,
    fill: palette(i),
  }));

  layers.push({ d: dots, fill: palette(3) });

  return layers.filter((layer) => layer.d || layer.markup);
}

export default {
  label: "Bubbles",
  kind: "merge",
  params: ["seed", "randomize"],
  build: buildBubblesPattern,
  linkedStamp: STAMP_PATTERNS["circle-mixed"].stamp,
  solidEyes: true,
};
