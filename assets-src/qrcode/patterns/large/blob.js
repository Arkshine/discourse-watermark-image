import { camoPaths } from "../../render/render-camo.js";
import { linkedModuleStamp } from "../run-stamps.js";

export default {
  label: "Blob",
  kind: "merge",
  params: ["seed", "invert"],
  build: (qr, params, skipEyes) =>
    camoPaths(qr, { ...params, margin: 0, quietZone: 0 }, skipEyes),

  linkedStamp: linkedModuleStamp({
    axes: "both",
    cap: "round",
    isolated: "circle",
  }),
};
