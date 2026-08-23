/* eslint-disable no-bitwise */ // QR module flags are bit fields

import { Module } from "../matrix.js";
import { formatNum } from "../shapes.js";

const SIGNATURE_UNIT = 6;
const SIGNATURE_PATTERNS = {
  oriental: {
    "----": '<circle cx="3" cy="3" r="3"/>',
    "---L":
      '<path d="M0,0v6l1.3-0.4c1.1-0.4,2.4-0.4,3.5,0L6,6C6,2.7,3.3,0,0,0z"/>',
    "--D-":
      '<path d="M6,6H0v0c0-3.3,2.7-6,6-6h0L5.6,1.3c-0.4,1.1-0.4,2.4,0,3.5L6,6z"/>',
    "--DL": '<path d="M6,6H0V0l3,0c1.7,0,3,1.3,3,3V6z"/>',
    "-R--":
      '<path d="M4.7,0.4c-1.1,0.4-2.4,0.4-3.5,0L0,0c0,3.3,2.7,6,6,6V0L4.7,0.4z"/>',
    "-R-L": '<rect width="6" height="6"/>',
    "-RD-": '<path d="M6,6H0V3c0-1.7,1.3-3,3-3l3,0V6z"/>',
    "-RDL": '<rect width="6" height="6"/>',
    "U---":
      '<path d="M0,0l0.4,1.3c0.4,1.1,0.4,2.4,0,3.5L0,6c3.3,0,6-2.7,6-6H0z"/>',
    "U--L": '<path d="M3,6H0V0l6,0v3C6,4.7,4.7,6,3,6z"/>',
    "U-D-": '<rect width="6" height="6"/>',
    "U-DL": '<rect width="6" height="6"/>',
    "UR--": '<path d="M6,6H3C1.3,6,0,4.7,0,3V0l6,0V6z"/>',
    "UR-L": '<rect width="6" height="6"/>',
    "URD-": '<rect width="6" height="6"/>',
    URDL: '<rect width="6" height="6"/>',
  },
  ellipse: {
    "----":
      '<path d="M5.4,2.8C4.5,1.1,2.6-0.1,1.2,0c-1.3,0.1-1.6,1.6-0.7,3.2c1,1.7,2.8,2.9,4.2,2.8C6.1,5.9,6.4,4.4,5.4,2.8z"/>',
    "---L":
      '<path d="M6,0.8L6,0.8C6,2.2,1.4,6,0,6l0,0V0h5.2C5.6,0,6,0.4,6,0.8z"/>',
    "--D-":
      '<path d="M0.8,0L0.8,0C2.2,0,6,4.6,6,6l0,0H0V0.8C0,0.4,0.4,0,0.8,0z"/>',
    "--DL": '<path d="M0,6V0h4c1.1,0,2,0.9,2,2v4H0z"/>',
    "-R--":
      '<path d="M0,5.2L0,5.2C0,3.8,4.6,0,6,0l0,0v6H0.8C0.4,6,0,5.6,0,5.2z"/>',
    "-R-L": '<rect width="6" height="6"/>',
    "-RD-": '<path d="M6,6H0V2c0-1.1,0.9-2,2-2h4V6z"/>',
    "-RDL": '<rect width="6" height="6"/>',
    "U---":
      '<path d="M5.2,6L5.2,6C3.8,6,0,1.4,0,0l0,0h6v5.2C6,5.6,5.6,6,5.2,6z"/>',
    "U--L": '<path d="M0,0h6v4c0,1.1-0.9,2-2,2H0V0z"/>',
    "U-D-": '<rect width="6" height="6"/>',
    "U-DL": '<rect width="6" height="6"/>',
    "UR--": '<path d="M6,0v6H2C0.9,6,0,5.1,0,4V0H6z"/>',
    "UR-L": '<rect width="6" height="6"/>',
    "URD-": '<rect width="6" height="6"/>',
    URDL: '<rect width="6" height="6"/>',
  },
  origami: {
    "----":
      '<g transform="scale(0.06)"><polygon points="99.999,49.999 99.998,49.999 49.999,0 0,49.999 -0.001,49.999 -0.001,50 0,50 49.999,99.999 99.998,50 99.999,50 99.998,50"/></g>',
    "---L":
      '<g transform="scale(0.06)"><polygon points="0,100 100,50 100,50 0,0"/></g>',
    "--D-":
      '<g transform="scale(0.06)"><polygon points="100,100 50,0 50,0 0,100"/></g>',
    "-R--":
      '<g transform="scale(0.06)"><polygon points="100,100 0,50 0,50 100,0"/></g>',
    "U---":
      '<g transform="scale(0.06)"><polygon points="0,-0.001 50,99.999 50,99.999 100,-0.001"/></g>',
    "--DL":
      '<g transform="scale(0.06)"><path d="M100,34.375c0-9.505-3.354-17.611-10.059-24.316S75.131,0,65.625,0H0v100h100V34.375z"/></g>',
    "-RD-":
      '<g transform="scale(0.06)"><path d="M100,34.375V0H34.375C24.87,0,16.764,3.353,10.059,10.059S0,24.87,0,34.375V100h100V34.375z"/></g>',
    "U--L":
      '<g transform="scale(0.06)"><path d="M100,0H0v100h65.625c9.506,0,17.611-3.354,24.316-10.059S100,75.131,100,65.625V0z"/></g>',
    "UR--":
      '<g transform="scale(0.06)"><path d="M100,0H0v65.625c0,9.506,3.353,17.611,10.059,24.316S24.87,100,34.375,100H100V0z"/></g>',
  },
};

function signaturePaths(qr, params, skipEyes, shapes) {
  const rowLen = qr.size;
  const scale = params.dataScale ?? 1;
  const inset = (1 - scale) / 2;
  const unit = scale / SIGNATURE_UNIT;
  let markup = "";

  const lit = (x, y) => {
    if (x < 0 || y < 0 || x >= rowLen || y >= rowLen) {
      return false;
    }

    const module = qr.matrix[y * rowLen + x];

    if (!(module & Module.ON)) {
      return false;
    }

    return !(skipEyes && module & Module.FINDER);
  };

  for (let y = 0; y < rowLen; y++) {
    for (let x = 0; x < rowLen; x++) {
      if (!lit(x, y)) {
        continue;
      }

      const signature =
        (lit(x, y - 1) ? "U" : "-") +
        (lit(x + 1, y) ? "R" : "-") +
        (lit(x, y + 1) ? "D" : "-") +
        (lit(x - 1, y) ? "L" : "-");

      markup +=
        `<g transform="translate(${formatNum(x + inset)},${formatNum(y + inset)}) scale(${formatNum(unit)})">` +
        (shapes[signature] ?? '<rect width="6" height="6"/>') +
        `</g>`;
    }
  }

  return markup;
}

function signatureNeighborStamp(shapes) {
  return (x, y, w, neighbors = {}) => {
    const { up, right, down, left } = neighbors;
    const signature =
      (up ? "U" : "-") +
      (right ? "R" : "-") +
      (down ? "D" : "-") +
      (left ? "L" : "-");
    const unit = w / SIGNATURE_UNIT;

    return (
      `<g transform="translate(${formatNum(x)},${formatNum(y)}) scale(${formatNum(unit)})">` +
      (shapes[signature] ?? '<rect width="6" height="6"/>') +
      `</g>`
    );
  };
}

export { SIGNATURE_PATTERNS, signatureNeighborStamp, signaturePaths };
