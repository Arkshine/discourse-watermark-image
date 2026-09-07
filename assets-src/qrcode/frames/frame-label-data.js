const LABEL_SHAPES = {
  "band-bottom": {
    path: "M22.7,0H1.3C0.6,0,0,0.6,0,1.3v25.4C0,27.4,0.6,28,1.3,28h21.4c0.7,0,1.3-0.6,1.3-1.3V1.3C24,0.6,23.4,0,22.7,0z M23,22c0,0.6-0.4,1-1,1H2c-0.6,0-1-0.4-1-1V2c0-0.6,0.4-1,1-1h20c0.6,0,1,0.4,1,1V22z",
    extentHeight: 28,
    hole: [1, 1, 23, 23],
    position: "bottom",
  },
  "band-top": {
    path: "M1.3,28L22.6,28c0.7,0,1.3-0.6,1.3-1.3L24,1.4c0-0.7-0.6-1.3-1.3-1.3L1.4,0C0.7,0,0.1,0.6,0,1.3L0,26.6C-0.1,27.4,0.5,28,1.3,28z M1,6c0-0.6,0.5-1,1-1L22,5c0.6,0,1,0.5,1,1L23,26c0,0.6-0.5,1-1,1L2,27c-0.6,0-1-0.5-1-1L1,6z",
    extentHeight: 28,
    hole: [1, 5, 23, 27],
    position: "top",
  },
  "band-bottom-square": {
    path: "M24,28H0V0h24V28z M23,0.94H1v22h22V0.94z",
    extentHeight: 28,
    hole: [1, 0.94, 23, 22.94],
    position: "bottom",
  },
  "band-top-square": {
    path: "M0,0h24v28H0V0z M1,27.06h22v-22H1V27.06z",
    extentHeight: 28,
    hole: [1, 5.06, 23, 27.06],
    position: "top",
  },
  "ribbon-bottom": {
    path: "M24,21h-1.7V1.7H1.7V21H0l1,2l-1,2h1v2h22v-2h1l-1-2L24,21z M2,2h20v19v1H2v-1V2z",
    extentHeight: 27,
    hole: [2, 2, 22, 22],
    position: "bottom",
    stroke: true,
  },
  "ribbon-top": {
    path: "M0,6h1.7v19.3h20.7V6H24l-1-2l1-2h-1V0H1v2H0l1,2L0,6z M22,25H2V6V5h20v1V25z",
    extentHeight: 25.3,
    hole: [2, 5, 22, 25],
    position: "top",
    stroke: true,
  },
  "bubble-bottom": {
    path: "M22.7,0H1.3C0.6,0,0,0.6,0,1.3v21.4c0,0.7,0.6,1.3,1.3,1.3h21.4c0.7,0,1.3-0.6,1.3-1.3V1.3C24,0.6,23.4,0,22.7,0z M23,22c0,0.6-0.4,1-1,1H2c-0.6,0-1-0.4-1-1V2c0-0.6,0.4-1,1-1h20c0.6,0,1,0.4,1,1V22z M1,30H23C23.6,30,24,29.6,24,29v-3c0,-0.6,-0.4,-1,-1,-1h-9.5l-1.5,-1.5L10.5,25H1c-0.6,0,-1,0.4,-1,1V29C0,29.6,0.4,30,1,30z",
    extentHeight: 30,
    hole: [1, 1, 23, 23],
    position: "bottom",
    textBand: [25, 30],
  },
  "bubble-top": {
    path: "M22.7,6H1.3C0.6,6,0,6.6,0,7.3v21.4c0,0.7,0.6,1.3,1.3,1.3h21.4c0.7,0,1.3-0.6,1.3-1.3V7.3C24,6.6,23.4,6,22.7,6z M23,28c0,0.6-0.4,1-1,1H2c-0.6,0-1-0.4-1-1V8c0-0.6,0.4-1,1-1h20c0.6,0,1,0.4,1,1V28z M23,0H1C0.4,0,0,0.4,0,1v3c0,0.6,0.4,1,1,1h9.5l1.5,1.5L13.5,5H23c0.6,0,1-0.4,1-1V1C24,0.4,23.6,0,23,0z",
    extentHeight: 30,
    hole: [1, 7, 23, 29],
    position: "top",
    textBand: [0, 5],
  },
};

export { LABEL_SHAPES };
