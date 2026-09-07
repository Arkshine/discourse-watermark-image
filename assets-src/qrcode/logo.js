/* eslint-disable no-undef */
import { reserveRange } from "./matrix.js";
import { clipToFrame } from "./render/postprocess.js";
import { resolvePaint } from "./shapes.js";

const LOGO_DEFAULTS = {
  enabled: false,
  source: "icon",
  size: 20,
  padding: 0,
  background: false,
  transparentBackground: true,
  showDataBehind: false,
};

function parseLogoConfig(raw) {
  if (!raw) {
    return { ...LOGO_DEFAULTS };
  }

  try {
    return { ...LOGO_DEFAULTS, ...(JSON.parse(raw) ?? {}) };
  } catch {
    return { ...LOGO_DEFAULTS };
  }
}

function iconToSVG(icon, color, size) {
  const [minX, minY, width, height] = (icon.viewBox || "0 0 512 512")
    .split(/[\s,]+/)
    .map(Number);
  const side = Math.max(width, height);
  const x = minX - (side - width) / 2;
  const y = minY - (side - height) / 2;

  const defs = [];
  const fill = resolvePaint(color, defs);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}" ` +
    `width="${size}" height="${size}">` +
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    `<g fill="${fill}">${icon.content}</g></svg>`
  );
}

async function loadLogoBitmap(cfg, settings, size, foreground) {
  if (cfg.source === "icon") {
    const icon = settings.qrcode_logo_icon;
    if (!icon?.content) {
      return null;
    }

    const bytes = QrCodeGen.WasmQrCode.svg_to_png(
      iconToSVG(icon, cfg.color || foreground, size),
      size
    );

    return createImageBitmap(new Blob([bytes], { type: "image/png" }));
  }

  if (!settings.qrcode_logo_image_url) {
    return null;
  }

  const response = await fetch(settings.qrcode_logo_image_url);
  if (!response.ok) {
    throw new Error(`Watermark logo image failed to load (${response.status})`);
  }

  return createImageBitmap(await response.blob());
}

async function applyLogo(
  png,
  settings,
  { background, foreground, qrInsetRatio, qrSize, clipPath, canvasSize, margin }
) {
  const cfg = parseLogoConfig(settings.qrcode_logo_config);
  if (!cfg.enabled) {
    return png;
  }

  const qrBitmap = await createImageBitmap(
    new Blob([png], { type: "image/png" })
  );
  const isBackground = cfg.background;
  const modulePx = (qrBitmap.width * qrInsetRatio) / qrSize;
  const reserve = isBackground ? null : reserveRange(qrSize, cfg.size);
  const box = isBackground
    ? qrBitmap.width
    : Math.round((reserve.x1 - reserve.x0) * modulePx);
  const logo = await loadLogoBitmap(cfg, settings, box, foreground);

  if (!logo) {
    return png;
  }

  const canvas = new OffscreenCanvas(qrBitmap.width, qrBitmap.height);
  const ctx = canvas.getContext("2d");

  if (isBackground) {
    clipToFrame(ctx, qrBitmap.width, clipPath, canvasSize, margin);

    const fitBox = Math.round(box * qrInsetRatio);
    const scale = Math.min(fitBox / logo.width, fitBox / logo.height);
    const width = Math.round(logo.width * scale);
    const height = Math.round(logo.height * scale);
    const x = Math.round((qrBitmap.width - width) / 2);
    const y = Math.round((qrBitmap.height - height) / 2);

    if (!cfg.transparentBackground) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, qrBitmap.width, qrBitmap.height);
    }

    ctx.drawImage(logo, x, y, width, height);
    ctx.drawImage(qrBitmap, 0, 0);
  } else {
    const pad = cfg.showDataBehind
      ? 0
      : Math.round((box * (cfg.padding ?? 0)) / 100);
    const innerBox = box - pad * 2;
    const scale = Math.min(innerBox / logo.width, innerBox / logo.height);
    const width = Math.round(logo.width * scale);
    const height = Math.round(logo.height * scale);
    const gridOriginX = Math.round((qrBitmap.width - qrSize * modulePx) / 2);
    const gridOriginY = Math.round((qrBitmap.height - qrSize * modulePx) / 2);
    const boxX = Math.round(gridOriginX + reserve.x0 * modulePx);
    const boxY = Math.round(gridOriginY + reserve.y0 * modulePx);
    const x = Math.round(boxX + (box - width) / 2);
    const y = Math.round(boxY + (box - height) / 2);

    ctx.drawImage(qrBitmap, 0, 0);
    ctx.drawImage(logo, x, y, width, height);
  }

  const blob = await canvas.convertToBlob({ type: "image/png" });

  return new Uint8Array(await blob.arrayBuffer());
}

export { applyLogo, parseLogoConfig };
