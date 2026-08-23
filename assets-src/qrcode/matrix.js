/* eslint-disable no-bitwise */
const Module = Object.freeze({
  ON: 1 << 0,
  DATA: 1 << 1,
  FINDER: 1 << 2,
  ALIGNMENT: 1 << 3,
  MODIFIER: 1 << 7,
  TIMING: 1 << 4,
  FORMAT: 1 << 5,
  VERSION: 1 << 6,
  LOGO: 1 << 8,
});

function getSeededRand(a) {
  return function () {
    a |= 0;
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return ((t = t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Adapter: WasmQrCode-like -> qrframe-like { version, matrix }
// ---------------------------------------------------------------------------

function alignmentPositions(version, size) {
  if (version === 1) {
    return [];
  }
  const numAlign = Math.floor(version / 7) + 2;
  const step =
    Math.floor((version * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [];
  for (let i = 0; i < numAlign - 1; i++) {
    result.push(size - 7 - i * step);
  }
  result.push(6);
  result.reverse();
  return result;
}

function buildStyledMatrix(qrLike, reserve = null) {
  const size =
    typeof qrLike.get_size === "function" ? qrLike.get_size() : qrLike.size;
  const getModule =
    typeof qrLike.get_module === "function"
      ? (x, y) => qrLike.get_module(x, y)
      : (x, y) => qrLike.getModule(x, y);

  const version = (size - 17) / 4;
  const matrix = new Uint16Array(size * size);
  const flag = (x, y, f) => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      matrix[y * size + x] |= f;
    }
  };

  for (const [fx, fy] of [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ]) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        flag(fx + dx, fy + dy, Module.FINDER);
      }
    }
  }

  for (let i = 8; i < size - 8; i++) {
    flag(6, i, Module.TIMING);
    flag(i, 6, Module.TIMING);
  }

  const pos = alignmentPositions(version, size);
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      // Skip pairs that fall in the finder corners.
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === pos.length - 1) ||
        (i === pos.length - 1 && j === 0)
      ) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          flag(pos[i] + dx, pos[j] + dy, Module.ALIGNMENT);
        }
      }
      flag(pos[i], pos[j], Module.MODIFIER);
    }
  }

  for (let i = 0; i <= 8; i++) {
    if (matrix[8 * size + i] === 0) {
      flag(i, 8, Module.FORMAT);
    }
    if (matrix[i * size + 8] === 0) {
      flag(8, i, Module.FORMAT);
    }
  }
  for (let i = 0; i < 8; i++) {
    flag(size - 1 - i, 8, Module.FORMAT);
    flag(8, size - 8 + i, Module.FORMAT);
  }

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      flag(size - 11 + (i % 3), Math.floor(i / 3), Module.VERSION);
      flag(Math.floor(i / 3), size - 11 + (i % 3), Module.VERSION);
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (matrix[i] === 0) {
        matrix[i] |= Module.DATA;
      }
      if (getModule(x, y)) {
        matrix[i] |= Module.ON;
      }
    }
  }

  if (reserve) {
    for (let y = reserve.y0; y < reserve.y1; y++) {
      for (let x = reserve.x0; x < reserve.x1; x++) {
        const i = y * size + x;
        matrix[i] = (matrix[i] & ~Module.ON) | Module.LOGO;
      }
    }
  }

  return { version, size, matrix };
}

function reserveRange(qrSize, sizePercent) {
  let boxModules = Math.max(1, Math.round((qrSize * sizePercent) / 100));

  if ((qrSize - boxModules) % 2 !== 0) {
    boxModules += 1;
  }

  const offset = (qrSize - boxModules) / 2;

  return {
    x0: offset,
    y0: offset,
    x1: offset + boxModules,
    y1: offset + boxModules,
  };
}

// Flips every ON module to unlit, leaving logo-reserved cells untouched.
function unlitMatrix(qr) {
  return {
    ...qr,
    matrix: qr.matrix.map((cell) =>
      cell & Module.LOGO ? cell : cell ^ Module.ON
    ),
  };
}

export { Module, buildStyledMatrix, getSeededRand, reserveRange, unlitMatrix };
