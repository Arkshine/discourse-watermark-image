/* eslint-disable no-bitwise */

import { Module } from "../matrix.js";

function buildOnPredicate(newMatrix, rowLen, params, skipEyes) {
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

  return (x, y) =>
    rawOn(x, y) &&
    !inHole(x, y) &&
    !(skipEyes && newMatrix[y * rowLen + x] & Module.FINDER);
}

function createBoundaryFloodFill(rowLen, xMax, yMax, on) {
  const visited = new Uint16Array(rowLen * rowLen);
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

  function run() {
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

  return { visited, stack, run };
}

export { buildOnPredicate, createBoundaryFloodFill };
