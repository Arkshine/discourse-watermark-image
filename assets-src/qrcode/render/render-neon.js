/* eslint-disable no-bitwise */

import { getSeededRand, Module } from "../matrix.js";
import { buildOnPredicate, createBoundaryFloodFill } from "./boundary-trace.js";

// Line tracer (adapted from qrframe "Neon", MIT)
function neonPaths(qr, params, skipEyes) {
  const rand = getSeededRand(params.seed);
  const margin = params.margin;
  const colors = [params.color1, params.color2, params.color3, params.color4];

  const qrRowLen = qr.size;
  const rowLen = qrRowLen + 2 * margin;

  const newMatrix = Array(rowLen * rowLen).fill(0);

  for (let y = 0; y < margin - 1; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  for (let y = margin - 1; y < margin + qrRowLen + 1; y++) {
    for (let x = 0; x < margin - 1; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
    if (y >= margin && y < margin + qrRowLen) {
      for (let x = margin; x < rowLen - margin; x++) {
        newMatrix[y * rowLen + x] =
          qr.matrix[(y - margin) * qrRowLen + x - margin];
      }
    }
    for (let x = margin + qrRowLen + 1; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  for (let y = margin + qrRowLen + 1; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  if (params.quietZone === "minimal") {
    for (let x = margin + 8; x < rowLen - margin - 8; x++) {
      if (rand() > 0.5) {
        newMatrix[(margin - 1) * rowLen + x] = Module.ON;
      }
    }
    for (let y = margin + 8; y < rowLen - margin; y++) {
      if (y < rowLen - margin - 8) {
        if (rand() > 0.5) {
          newMatrix[y * rowLen + margin - 1] = Module.ON;
        }
      }
      if (rand() > 0.5) {
        newMatrix[y * rowLen + rowLen - margin] = Module.ON;
      }
    }
    for (let x = margin + 8; x < rowLen - margin + 1; x++) {
      if (rand() > 0.5) {
        newMatrix[(rowLen - margin) * rowLen + x] = Module.ON;
      }
    }
  }

  const unit = 4;
  let thin = params.lineThickness;
  let offset = (unit - thin) / 2;

  const xMax = rowLen - 1;
  const yMax = rowLen - 1;

  let baseX;
  let baseY;

  const on = buildOnPredicate(newMatrix, rowLen, params, skipEyes);
  const {
    visited,
    stack,
    run: dfsOff,
  } = createBoundaryFloodFill(rowLen, xMax, yMax, on);

  const paths = [""];
  const fills = [null];

  function go(x, y, dx, dy, path, cw) {
    for (;;) {
      visited[y * rowLen + x] = path;
      let concave = false;

      let nx = x + dx;
      let ny = y + dy;
      while (nx >= 0 && nx <= xMax && ny >= 0 && ny <= yMax) {
        const next = on(nx, ny);
        const cx = nx + dy;
        const cy = ny - dx;
        const diag =
          cx >= 0 && cx <= xMax && cy >= 0 && cy <= yMax && on(cx, cy);
        if (!next || diag) {
          concave = next && diag;
          break;
        }
        visited[ny * rowLen + nx] = path;
        nx += dx;
        ny += dy;
      }

      if (nx - dx === baseX && ny - dy === baseY) {
        if ((cw && dy === -1) || (!cw && dx === -1)) {
          paths[path] += "z";
          return;
        }
      }

      if (concave) {
        if (dx) {
          paths[path] += `h${(nx - x) * unit}v${-dx * 2 * offset}`;
        } else {
          paths[path] += `v${(ny - y) * unit}h${dy * 2 * offset}`;
        }
        const nextX = nx + dy;
        const nextY = ny - dx;
        const nextDx = dy;
        const nextDy = -dx;
        x = nextX;
        y = nextY;
        dx = nextDx;
        dy = nextDy;
      } else {
        if (dx) {
          paths[path] += `h${(nx - x - dx) * unit + dx * thin}`;
        } else {
          paths[path] += `v${(ny - y - dy) * unit + dy * thin}`;
        }
        const nextX = nx - dx;
        const nextY = ny - dy;
        const nextDx = -dy;
        const nextDy = dx;
        x = nextX;
        y = nextY;
        dx = nextDx;
        dy = nextDy;
      }
    }
  }

  dfsOff();

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (visited[y * rowLen + x]) {
        continue;
      }

      if (newMatrix[y * rowLen + x] & Module.FINDER) {
        thin = params.finderThickness;
        offset = (unit - thin) / 2;
      } else {
        thin = params.lineThickness;
        offset = (unit - thin) / 2;
      }

      if (!on(x, y)) {
        const path = visited[y * rowLen + x - 1];
        paths[path] +=
          `M${x * unit - offset},${y * unit - offset}v${2 * offset}`;
        baseY = y - 1;
        baseX = x;
        go(x - 1, y, 0, 1, path, false);
        stack.push([x, y]);
        dfsOff();
        continue;
      }

      if (y > 0 && on(x, y - 1) && visited[(y - 1) * rowLen + x]) {
        visited[y * rowLen + x] = visited[(y - 1) * rowLen + x];
        continue;
      }
      if (x > 0 && on(x - 1, y) && visited[y * rowLen + x - 1]) {
        visited[y * rowLen + x] = visited[y * rowLen + x - 1];
        continue;
      }

      const color = colors[Math.floor(rand() * colors.length)];
      paths.push(`M${x * unit + offset},${y * unit + offset}`);
      fills.push(color);
      baseY = y;
      baseX = x;
      go(x, y, 1, 0, paths.length - 1, true);
    }
  }

  return paths.slice(1).map((d, i) => ({ d, fill: fills[i + 1] }));
}

export { neonPaths };
