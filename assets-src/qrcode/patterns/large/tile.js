/* eslint-disable no-bitwise */ // QR module flags are bit fields
import { Module } from "../../matrix.js";
import { formatNum, SHAPES } from "../../shapes.js";

function buildTilePattern(qr, params, skipEyes) {
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

      grout += `M${formatNum(x)},${formatNum(y)}h1v1h-1z`;

      if (on && finder) {
        dark += `M${formatNum(x)},${formatNum(y)}h1v1h-1z`;
        continue;
      }

      const tiles = on ? 1 : 2;
      const tile = (1 - tiles * gap) / tiles;

      for (let dy = 0; dy < tiles; dy++) {
        const ny = y + offset + dy * (tile + gap);
        for (let dx = 0; dx < tiles; dx++) {
          const nx = x + offset + dx * (tile + gap);
          const square =
            `M${formatNum(nx)},${formatNum(ny)}` +
            `h${formatNum(tile)}v${formatNum(tile)}h${formatNum(-tile)}z`;

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
}

export default {
  label: "Tile",
  kind: "merge",
  params: ["cellColor", "groutColor"],
  build: buildTilePattern,
  linkedStamp: SHAPES.square,
};
