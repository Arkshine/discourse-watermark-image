import alien from "./large/alien.js";
import blob from "./large/blob.js";
import blocks from "./large/blocks.js";
import bubbles from "./large/bubbles.js";
import lines from "./large/lines.js";
import mondrian from "./large/mondrian.js";
import particles from "./large/particles.js";
import tile from "./large/tile.js";
import { STAMP_PATTERNS } from "./small-patterns.js";

export const PATTERNS = {
  ...STAMP_PATTERNS,
  lines,
  particles,
  bubbles,
  alien,
  blocks,
  blob,
  mondrian,
  tile,
};
