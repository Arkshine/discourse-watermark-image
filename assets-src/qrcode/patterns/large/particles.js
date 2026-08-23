/* eslint-disable no-bitwise */ // QR module flags are bit fields
import { getSeededRand, Module } from "../../matrix.js";
import { circlePath } from "../../shapes.js";
import { STAMP_PATTERNS } from "../small-patterns.js";

// Adapted from qrframe "Quantum" (MIT).
function buildParticlesPattern(qr, params, skipEyes) {
  const rand = getSeededRand(params.seed);
  const range = (min, max) =>
    Math.trunc(100 * (rand() * (max - min) + min)) / 100;

  const rowLen = qr.size;
  const claimed = new Array(rowLen * rowLen).fill(false);
  let orbits = "";
  let dots = "";

  const on = (x, y) => {
    const module = qr.matrix[y * rowLen + x];
    return (module & Module.ON) !== 0 && !(skipEyes && module & Module.FINDER);
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
}

export default {
  label: "Particles",
  kind: "merge",
  params: ["seed"],
  build: buildParticlesPattern,
  linkedStamp: STAMP_PATTERNS["circle-mixed"].stamp,
  solidEyes: true,
};
