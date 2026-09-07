import { solidColor } from "../render/postprocess.js";
import { LABEL_SHAPES } from "./frame-label-data.js";

const LABEL_FONT_RATIO = 0.55;
const LABEL_PADDING_RATIO = 0.12;
const RIBBON_STROKE_WIDTH = 0.4;

const LABEL_FRAMES = new Set(Object.keys(LABEL_SHAPES));

const loadedFrameFonts = new Set();

function pickFrameFontVariant(variants) {
  return (
    variants.find(
      (v) => String(v.weight) === "400" && v.url.endsWith(".woff2")
    ) ??
    variants.find((v) => String(v.weight) === "400") ??
    variants[0]
  );
}

async function resolveFrameFontFamily(settings, params) {
  if (settings.qrcode_frame_font_family) {
    return settings.qrcode_frame_font_family;
  }

  let config;
  try {
    config = JSON.parse(params.frameFont ?? "{}");
  } catch {
    config = {};
  }

  const variant = pickFrameFontVariant(config.variants ?? []);

  if (!variant) {
    return "sans-serif";
  }

  const family = `watermark-frame-font-${config.key}`;

  if (!loadedFrameFonts.has(family)) {
    try {
      const face = new FontFace(family, `url("${variant.url}")`);
      await face.load();
      self.fonts.add(face);
      loadedFrameFonts.add(family);
    } catch {
      return "sans-serif";
    }
  }

  return family;
}

function planLabelLayout(frameKey, qrWidth) {
  const shapeDef = LABEL_SHAPES[frameKey];
  const top = shapeDef.position === "top";
  const [holeX0, holeY0, holeX1, holeY1] = shapeDef.hole;
  const scale = qrWidth / (holeX1 - holeX0);
  const [textBandTop, textBandBottom] =
    shapeDef.textBand ?? (top ? [0, holeY0] : [holeY1, shapeDef.extentHeight]);

  return {
    canvasWidth: Math.round(24 * scale),
    canvasHeight: Math.round(shapeDef.extentHeight * scale),
    qrX: Math.round(holeX0 * scale),
    qrY: Math.round(holeY0 * scale),
    bandCenterY: Math.round(((textBandTop + textBandBottom) / 2) * scale),
    fontSize: Math.round(
      (textBandBottom - textBandTop) * scale * LABEL_FONT_RATIO
    ),
    shapeDef,
    scale,
    defaultTextColor: "background",
  };
}

async function buildLabelSilhouetteMask(
  layout,
  captionPath,
  qrWidth,
  qrHeight
) {
  const canvas = new OffscreenCanvas(layout.canvasWidth, layout.canvasHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000000";
  ctx.setTransform(layout.scale, 0, 0, layout.scale, 0, 0);
  ctx.fill(captionPath);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillRect(layout.qrX, layout.qrY, qrWidth, qrHeight);

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

async function applyFrameLabel(png, settings, params, frameKey) {
  const text = (params.frameText ?? "").trim();

  if (!text || !LABEL_FRAMES.has(frameKey)) {
    return { png, mask: null };
  }

  const qrBitmap = await createImageBitmap(
    new Blob([png], { type: "image/png" })
  );
  const layout = planLabelLayout(frameKey, qrBitmap.width);

  const canvas = new OffscreenCanvas(layout.canvasWidth, layout.canvasHeight);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = solidColor(params.frameColor ?? params.foreground, "#000000");
  ctx.setTransform(layout.scale, 0, 0, layout.scale, 0, 0);
  const captionPath = new Path2D(layout.shapeDef.path);
  ctx.fill(captionPath);

  if (layout.shapeDef.stroke) {
    ctx.lineWidth = RIBBON_STROKE_WIDTH;
    ctx.strokeStyle = solidColor(params.foreground, "#000000");
    ctx.stroke(captionPath);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const mask = await buildLabelSilhouetteMask(
    layout,
    captionPath,
    qrBitmap.width,
    qrBitmap.height
  );

  ctx.drawImage(qrBitmap, layout.qrX, layout.qrY);

  const family = await resolveFrameFontFamily(settings, params);
  ctx.font = `${layout.fontSize}px ${family}`;
  ctx.fillStyle = solidColor(
    params.frameTextColor ?? params[layout.defaultTextColor],
    "#000000"
  );
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const padding = canvas.width * LABEL_PADDING_RATIO;
  const maxWidth = canvas.width - padding * 2;
  let label = text;

  while (label.length > 1 && ctx.measureText(label).width > maxWidth) {
    label = label.slice(0, -1);
  }

  if (label !== text) {
    label = `${label.slice(0, -1)}…`;
  }

  ctx.fillText(label, canvas.width / 2, layout.bandCenterY);

  const blob = await canvas.convertToBlob({ type: "image/png" });

  return { png: new Uint8Array(await blob.arrayBuffer()), mask };
}

export { applyFrameLabel };
