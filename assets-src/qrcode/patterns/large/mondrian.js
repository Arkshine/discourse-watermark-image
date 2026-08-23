/* eslint-disable no-bitwise */ // QR module flags are bit fields
import { getSeededRand, Module } from "../../matrix.js";
import { formatNum, SHAPES } from "../../shapes.js";
import { colorStops } from "./color-stops.js";

function buildMondrianPattern(qr, params, skipEyes) {
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

  const stops = colorStops(params.dataColor || params.foreground);

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
        `M${formatNum(x + offset)},${formatNum(y + offset)}` +
        `h${formatNum(hSide)}v${formatNum(vSide)}h${formatNum(-hSide)}z`;

      if (on || opaqueUnlit) {
        grid += `M${formatNum(x)},${formatNum(y)}h${formatNum(width)}v${formatNum(height)}h${formatNum(-width)}z`;
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
}

export default {
  label: "Mondrian",
  kind: "merge",
  params: ["cellColor", "lineColor", "lineThickness", "seed"],
  build: buildMondrianPattern,
  linkedStamp: SHAPES.square,
};
