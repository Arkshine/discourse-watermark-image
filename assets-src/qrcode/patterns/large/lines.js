import { neonPaths } from "../../render/render-neon.js";
import { formatNum, SHAPES } from "../../shapes.js";
import { colorStops } from "./color-stops.js";

function buildLinesPattern(qr, params, skipEyes) {
  const stops = colorStops(params.dataColor || params.foreground);
  const palette = {
    color1: stops[0 % stops.length],
    color2: stops[1 % stops.length],
    color3: stops[2 % stops.length],
    color4: stops[3 % stops.length],
  };

  const rowLen = qr.size;
  const offset = (4 - params.lineThickness) / 2;
  const scale = rowLen / (rowLen * 4 - 2 * offset);
  const shift = -(offset * scale);
  const transform = `translate(${formatNum(shift)},${formatNum(shift)}) scale(${formatNum(scale)})`;
  const fillSize = rowLen * 4;

  return neonPaths(qr, { ...params, ...palette, margin: 0 }, skipEyes).map(
    (region) => ({ ...region, transform, fillSize })
  );
}

export default {
  label: "Lines",
  kind: "merge",
  params: ["lineThickness", "finderThickness"],
  build: buildLinesPattern,
  linkedStamp: SHAPES.square,
};
