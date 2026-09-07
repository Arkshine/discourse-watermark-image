const CSS_FONT_VARS = {
  site: "--font-family",
  heading: "--heading-font-family",
  monospace: "--d-font-family--monospace",
};

const RENDER_FONT_SIZE = 256;
const CANVAS_PADDING_RATIO = 0.2;

const loadedCustomFonts = new Set();

function siteFontFamily() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(CSS_FONT_VARS.site)
      .trim() || "sans-serif"
  );
}

function parseFontConfig(font) {
  try {
    return JSON.parse(font) ?? { key: "site" };
  } catch {
    return { key: "site" };
  }
}

export function resolveStaticFontFamily(font) {
  const config = parseFontConfig(font);
  const cssVar = CSS_FONT_VARS[config.key];

  if (!cssVar) {
    return null;
  }

  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(cssVar)
      .trim() || "sans-serif"
  );
}

function pickVariant(variants, weight) {
  return (
    variants.find(
      (v) => String(v.weight) === weight && v.url.endsWith(".woff2")
    ) ??
    variants.find((v) => String(v.weight) === weight) ??
    variants[0]
  );
}

async function resolveFontFamily(font, weight) {
  const config = parseFontConfig(font);
  const cssVar = CSS_FONT_VARS[config.key];

  if (cssVar) {
    const stack = getComputedStyle(document.documentElement)
      .getPropertyValue(cssVar)
      .trim();
    return stack || "sans-serif";
  }

  const variant = pickVariant(config.variants ?? [], weight);

  if (!variant) {
    return siteFontFamily();
  }

  const family = `watermark-font-${config.key}`;
  const loadKey = `${family}-${weight}`;

  if (!loadedCustomFonts.has(loadKey)) {
    try {
      const face = new FontFace(family, `url("${variant.url}")`, { weight });
      await face.load();
      document.fonts.add(face);
      loadedCustomFonts.add(loadKey);
    } catch {
      return siteFontFamily();
    }
  }

  return family;
}

const RTL_CHARS = /[\u0591-\u07FF\u200F\uFB1D-\uFDFD\uFE70-\uFEFC]/;

function detectDirection(text) {
  return RTL_CHARS.test(text) ? "rtl" : "ltr";
}

function applyCase(text, textCase) {
  if (textCase === "uppercase") {
    return text.toUpperCase();
  }

  if (textCase === "lowercase") {
    return text.toLowerCase();
  }

  return text;
}

function buildFillStyle(context, color, width, height) {
  if (!color || typeof color === "string") {
    return color || "#000000";
  }

  const stops = color.stops ?? [];

  if (stops.length === 0) {
    return "#000000";
  }

  if (stops.length === 1) {
    return stops[0];
  }

  const cx = width / 2;
  const cy = height / 2;
  let gradient;

  if (color.type === "radial") {
    gradient = context.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      Math.max(width, height) / 2
    );
  } else {
    const angle = ((color.angle ?? 0) * Math.PI) / 180;
    const len =
      (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * height) /
      2;
    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len;
    gradient = context.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  }

  stops.forEach((stop, index) => {
    gradient.addColorStop(index / (stops.length - 1), stop);
  });

  return gradient;
}

export async function renderTextWatermark({
  text,
  font,
  fontWeight,
  italic,
  textCase,
  letterSpacing,
  align,
  color,
  strokeColor,
  strokeWidth,
  shadowColor,
  shadowBlur,
  backgroundEnabled,
  backgroundColor,
}) {
  const weight = fontWeight === "bold" ? "700" : "400";
  const family = await resolveFontFamily(font, weight);
  const size = RENDER_FONT_SIZE;
  const cssFont = `${italic ? "italic " : ""}${weight} ${size}px ${family}`;
  const strokeWidthPx = size * ((strokeWidth || 0) / 100);
  const shadowBlurPx = size * ((shadowBlur || 0) / 100);
  const letterSpacingPx = size * ((letterSpacing || 0) / 100);
  const direction = detectDirection(text);

  await document.fonts.load(cssFont, text);
  await document.fonts.ready;

  const lines = applyCase(text, textCase).split("\n");
  const measuringContext = document.createElement("canvas").getContext("2d");
  measuringContext.font = cssFont;
  measuringContext.direction = direction;
  measuringContext.letterSpacing = `${letterSpacingPx}px`;

  const lineWidths = lines.map(
    (line) => measuringContext.measureText(line).width
  );
  // Measured from a fixed reference string, not each line, so line height
  // stays consistent
  const refMetrics = measuringContext.measureText("Mgjpqy");
  const ascent = refMetrics.actualBoundingBoxAscent || size * 0.8;
  const descent = refMetrics.actualBoundingBoxDescent || size * 0.2;
  const lineHeight = ascent + descent;

  const width = Math.max(...lineWidths);
  const padding =
    size * CANVAS_PADDING_RATIO + strokeWidthPx / 2 + shadowBlurPx;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width + padding * 2);
  canvas.height = Math.ceil(lineHeight * lines.length + padding * 2);

  const context = canvas.getContext("2d");
  context.font = cssFont;
  context.direction = direction;
  context.textAlign = "left"; // direction-independent anchor
  context.letterSpacing = `${letterSpacingPx}px`;
  context.textBaseline = "alphabetic";
  context.lineJoin = "round";

  if (backgroundEnabled) {
    context.shadowBlur = 0;
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const fillStyle = buildFillStyle(context, color, canvas.width, canvas.height);

  lines.forEach((line, index) => {
    const slack = width - lineWidths[index];
    const offset =
      align === "center" ? slack / 2 : align === "right" ? slack : 0;
    const x = padding + offset;
    const y = padding + ascent + lineHeight * index;

    if (strokeWidthPx > 0) {
      context.shadowBlur = 0;
      context.lineWidth = strokeWidthPx;
      context.strokeStyle = strokeColor;
      context.strokeText(line, x, y);
    }

    context.shadowColor = shadowColor;
    context.shadowBlur = shadowBlurPx;
    context.fillStyle = fillStyle;
    context.fillText(line, x, y);
  });

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );

  return blob.arrayBuffer();
}
