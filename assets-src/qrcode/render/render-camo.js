import { getSeededRand, Module } from "../matrix.js";
import { buildOnPredicate, createBoundaryFloodFill } from "./boundary-trace.js";

// Style: camo (adapted from qrframe "Camo", MIT)
function camoPaths(qr, params, skipEyes, originShift = 0) {
  const rand = getSeededRand(params.seed);
  const margin = params.margin;
  const quietZone = params.quietZone;

  const qrRowLen = qr.size;
  const rowLen = qrRowLen + 2 * margin;

  const newMatrix = Array(rowLen * rowLen).fill(0);

  for (let y = 0; y < margin - quietZone; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  for (let y = margin - quietZone; y < margin + qrRowLen + quietZone; y++) {
    for (let x = 0; x < margin - quietZone; x++) {
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
    for (let x = margin + qrRowLen + quietZone; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  for (let y = margin + qrRowLen + quietZone; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (rand() > 0.5) {
        newMatrix[y * rowLen + x] = Module.ON;
      }
    }
  }
  if (quietZone === 0 && margin > 0) {
    for (let x = margin; x < margin + 7; x++) {
      newMatrix[(margin - 1) * rowLen + x] = 0;
      newMatrix[(margin - 1) * rowLen + x + qrRowLen - 7] = 0;
    }
    for (let y = margin; y < margin + 7; y++) {
      newMatrix[y * rowLen + margin - 1] = 0;
      newMatrix[y * rowLen + rowLen - margin] = 0;
    }
    for (let y = margin + qrRowLen - 7; y < margin + qrRowLen; y++) {
      newMatrix[y * rowLen + margin - 1] = 0;
    }
    for (let x = margin; x < margin + 7; x++) {
      newMatrix[(rowLen - margin) * rowLen + x] = 0;
    }
  }

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

  function go(x, y, dx, dy, path, cw) {
    visited[y * rowLen + x] = path;
    let concave = false;

    let nx = x + dx;
    let ny = y + dy;
    while (nx >= 0 && nx <= xMax && ny >= 0 && ny <= yMax) {
      const next = on(nx, ny);
      const cx = nx + dy;
      const cy = ny - dx;
      const diag = cx >= 0 && cx <= xMax && cy >= 0 && cy <= yMax && on(cx, cy);
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

    if (dx !== 0) {
      const dist = nx - x - dx * 2 * 0.5;
      if (dist) {
        paths[path] += `h${dist}`;
      }
    } else {
      const dist = ny - y - dy * 2 * 0.5;
      if (dist) {
        paths[path] += `v${dist}`;
      }
    }

    if (concave) {
      paths[path] += `a.5.5 0,0,0 ${(dx + dy) * 0.5},${(dy - dx) * 0.5}`;
      go(nx + dy, ny - dx, dy, -dx, path, cw);
    } else {
      paths[path] += `a.5.5 0,0,1 ${(dx - dy) * 0.5},${(dy + dx) * 0.5}`;
      go(nx - dx, ny - dy, -dy, dx, path, cw);
    }
  }

  dfsOff();

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (visited[y * rowLen + x]) {
        continue;
      }

      if (!on(x, y)) {
        const path = visited[y * rowLen + x - 1];
        paths[path] +=
          `M${x + 0.5 + originShift},${y + originShift}a.5.5 0,0,0 -.5.5`;

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

      paths.push(
        `M${x + originShift},${y + 0.5 + originShift}a.5.5 0,0,1 .5-.5`
      );
      baseY = y;
      baseX = x;
      go(x, y, 1, 0, paths.length - 1, true);
    }
  }

  return paths.slice(1).join("");
}

export { camoPaths };
