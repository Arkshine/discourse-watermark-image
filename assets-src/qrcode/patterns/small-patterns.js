import {
  CURVE_STAMPS,
  POLYGON_STAMPS,
  polygonStamp,
  shapePath,
  SHAPES,
} from "../shapes.js";
import { linkedModuleStamp, runPaths } from "./run-stamps.js";
import {
  SIGNATURE_PATTERNS,
  signatureNeighborStamp,
  signaturePaths,
} from "./signature-stamps.js";

const RUN_PATTERNS = {
  "special-circle": { axes: "both", cap: "round", isolated: "circle" },
  "special-circle-orizz": {
    axes: "horizontal",
    cap: "round",
    isolated: "circle",
    thickness: 5 / 6,
  },
  "special-circle-vert": {
    axes: "vertical",
    cap: "round",
    isolated: "circle",
    thickness: 5 / 6,
  },
  "square-circle": { axes: "both", cap: "square", isolated: "circle" },
  "special-diamond": { axes: "both", cap: "pointed", isolated: "diamond" },
  ribbon: { axes: "both", cap: "notched", isolated: "square" },
};

const SOLID_EYE_STAMP_KEYS = [
  "star",
  "danger",
  "x",
  "sparkle",
  "circle-small",
  "heart",
  "special-circle-orizz",
  "special-circle-vert",
  "shake",
  "circle-mixed",
];

function dotStamps(cells) {
  return cells.map(([x, y]) => shapePath("circle", x, y, 1, true)).join("");
}

function shakenStamps(cells) {
  return cells.map(([x, y]) => STAMP_PATTERNS.shake.stamp(x, y, 1)).join("");
}

function eyeFramesBlocks(x, y) {
  return (
    `M${x + 2},${y}h3v1h-3z` +
    `M${x},${y + 2}h1v3h-1z` +
    `M${x + 6},${y + 2}h1v3h-1z` +
    `M${x + 2},${y + 6}h3v1h-3z`
  );
}

function eyeFrameRingCells(x, y) {
  const cells = [];

  for (let i = 0; i < 7; i++) {
    cells.push([x + i, y], [x + i, y + 6]);

    if (i > 0 && i < 6) {
      cells.push([x, y + i], [x + 6, y + i]);
    }
  }

  return cells;
}

function eyeFramesDots(x, y) {
  return dotStamps(eyeFrameRingCells(x, y));
}

function eyeFramesShaken(x, y) {
  return shakenStamps(eyeFrameRingCells(x, y));
}

function eyeInsDots(x, y) {
  const cells = [];

  for (let dy = 2; dy < 5; dy++) {
    for (let dx = 2; dx < 5; dx++) {
      cells.push([x + dx, y + dy]);
    }
  }

  return dotStamps(cells);
}

const STAMP_PATTERNS = {};
const EYE_FRAMES = {};
const EYE_INS = {};

for (const kind of Object.keys(SHAPES)) {
  STAMP_PATTERNS[kind] = {
    label: kind,
    kind: "stamp",
    stamp: (x, y, w) => shapePath(kind, x, y, w, true),
  };

  EYE_FRAMES[kind] = (x, y) =>
    shapePath(kind, x, y, 7, true) + shapePath(kind, x + 1, y + 1, 5, false);

  EYE_INS[kind] = (x, y) => shapePath(kind, x + 2, y + 2, 3, true);
}

for (const [key, points] of Object.entries(POLYGON_STAMPS)) {
  STAMP_PATTERNS[key] = {
    label: key,
    kind: "stamp",
    stamp: (x, y, w) => polygonStamp(points, x, y, w),
  };
}

for (const [key, stamp] of Object.entries(CURVE_STAMPS)) {
  STAMP_PATTERNS[key] = { label: key, kind: "stamp", stamp };
}

for (const [key, spec] of Object.entries(RUN_PATTERNS)) {
  STAMP_PATTERNS[key] = {
    label: key,
    kind: "merge",
    build: (qr, params, skipEyes) => runPaths(qr, params, skipEyes, spec),
    linkedStamp: linkedModuleStamp(spec),
  };
}

for (const [key, shapes] of Object.entries(SIGNATURE_PATTERNS)) {
  STAMP_PATTERNS[key] = {
    label: key,
    kind: "merge",
    build: (qr, params, skipEyes) => [
      { markup: signaturePaths(qr, params, skipEyes, shapes) },
    ],
    linkedStamp: signatureNeighborStamp(shapes),
    linkedMarkup: true,
  };
}

for (const key of SOLID_EYE_STAMP_KEYS) {
  STAMP_PATTERNS[key].solidEyes = true;
}

STAMP_PATTERNS.diamond.solidEyes = true;

Object.assign(EYE_FRAMES, {
  blocks: eyeFramesBlocks,
  dots: eyeFramesDots,
  shaken: eyeFramesShaken,
  default: null,
});

Object.assign(EYE_INS, { dots: eyeInsDots, default: null });

export { EYE_FRAMES, EYE_INS, STAMP_PATTERNS };
