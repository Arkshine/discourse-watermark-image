import { setOwner } from "@ember/owner";
import { service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { resolveColor } from "discourse/lib/color-transformations";
import { getAbsoluteURL } from "discourse/lib/get-url";
import { convertIconClass } from "discourse/lib/icon-library";
import { imageURLToFile } from "./media-watermark-utils";
import {
  paramsFor,
  parseAxisConfig,
  resolveAxisParams,
  stringifyAxisConfig,
} from "./qr-settings/axes";
import { parseLogoConfig, stringifyLogoConfig } from "./qr-settings/logo";
import { workerManager } from "./watermark/worker";

export const WATERMARK_ALLOWED_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "bmp",
  "ico",
  "tiff",
  "webp",
]);

export const WATERMARK_ALLOWED_EXTS_STRING = Array.from(WATERMARK_ALLOWED_EXTS)
  .map((ext) => `.${ext}`)
  .join(",");

export function isImageAllowed(path) {
  const ext = path.split(".").pop().toLowerCase();
  return WATERMARK_ALLOWED_EXTS.has(ext);
}

export function absoluteUploadURL(value) {
  return value.startsWith("http") ? value : getAbsoluteURL(value);
}

export async function resolveIconSVG(name) {
  const id = convertIconClass(name);
  let symbol = document.querySelector(`#svg-sprites symbol#${id}`);

  if (!symbol) {
    try {
      const markup = await ajax(`/svg-sprite/search/${id}`);
      symbol = new DOMParser()
        .parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
          "image/svg+xml"
        )
        .querySelector("symbol");
    } catch {
      return null;
    }
  }

  if (!symbol) {
    return null;
  }

  return {
    viewBox: symbol.getAttribute("viewBox") || "0 0 512 512",
    content: symbol.innerHTML,
  };
}

const watermarkFileCache = new Map();

async function getWatermarkFile(url) {
  if (!watermarkFileCache.has(url)) {
    watermarkFileCache.set(url, await imageURLToFile(url));
  }

  return watermarkFileCache.get(url);
}

export default class Watermark {
  static getExtensionsRegex(allowedExts) {
    const commonExtensions = allowedExts.filter((ext) =>
      WATERMARK_ALLOWED_EXTS.has(ext)
    );
    return {
      pattern: new RegExp(`image/(${commonExtensions.join("|")})`),
      extensions: commonExtensions,
    };
  }

  @service currentUser;
  @service siteSettings;

  constructor(owner, file, params = {}) {
    setOwner(this, owner);

    this.file = file;
    this.overwriteOptions = params?.overwriteOptions || {};
    this.topicData = params?.topic;
  }

  async process() {
    const params = await this.workerData();
    const transferables = [params.upload.buffer];

    if (params.watermark.buffer) {
      transferables.push(params.watermark.buffer);
    }

    return workerManager.sendMessage(
      "watermark",
      { action: "apply", params },
      transferables
    );
  }

  async workerData() {
    const uploadBuffer = await this.file.arrayBuffer();

    const watermarkSettings = this.settings;
    let watermarkBuffer = null;

    if (!watermarkSettings.qrcode_enabled) {
      const watermarkFile = await getWatermarkFile(
        absoluteUploadURL(watermarkSettings.image)
      );
      watermarkBuffer = await watermarkFile.arrayBuffer();
    }

    watermarkSettings.buffer = watermarkBuffer;
    const logo = parseLogoConfig(watermarkSettings.qrcode_logo_config);

    if (logo.enabled && logo.source === "icon" && logo.icon) {
      watermarkSettings.qrcode_logo_icon = await resolveIconSVG(logo.icon);
    }

    return {
      upload: {
        buffer: uploadBuffer,
      },
      watermark: watermarkSettings,
    };
  }

  get settings() {
    const mergedSettings = {
      ...settings,
      ...this.overwriteOptions,
    };

    const newSettings = Object.fromEntries(
      Object.entries(mergedSettings)
        .filter(([key]) => key.startsWith("watermark_"))
        .map(([key, value]) => [key.replace("watermark_", ""), value])
    );

    newSettings.margin_x = newSettings.margin_x / 100;
    newSettings.margin_y = newSettings.margin_y / 100;
    newSettings.opacity = newSettings.opacity / 100;

    if (newSettings.qrcode_text) {
      newSettings.qrcode_text = newSettings.qrcode_text
        .replace("{homepage}", getAbsoluteURL(""))
        .replace("{username}", this.currentUser.username)
        .replace("{sitename}", this.siteSettings.title);

      const topicUrl = getAbsoluteURL(this.topicData?.url || "");

      newSettings.qrcode_text = newSettings.qrcode_text.replace(
        "{topic_url}",
        topicUrl
      );
    }

    if (newSettings.qrcode_halftone_image) {
      newSettings.qrcode_halftone_image_url = absoluteUploadURL(
        newSettings.qrcode_halftone_image
      );
    }

    if (newSettings.qrcode_logo_image) {
      newSettings.qrcode_logo_image_url = absoluteUploadURL(
        newSettings.qrcode_logo_image
      );
    }

    const processQRColor = (color, defaultColor) => {
      if (color && typeof color === "object") {
        return {
          ...color,
          stops: (color.stops ?? []).map((stop) =>
            processQRColor(stop, "#000000")
          ),
        };
      }

      return (color && resolveColor(color)) || defaultColor;
    };

    newSettings.qrcode_color = processQRColor(
      newSettings.qrcode_color,
      "#000000"
    );

    newSettings.qrcode_background_color = processQRColor(
      newSettings.qrcode_background_color,
      "#ffffff"
    );

    const cfg = parseAxisConfig(newSettings.qrcode_style_config);
    const resolved = resolveAxisParams(cfg, newSettings);

    for (const [key, spec] of Object.entries(paramsFor(cfg))) {
      if (resolved[key] === undefined) {
        continue;
      }

      if (spec.type === "color") {
        resolved[key] = processQRColor(
          resolved[key],
          key === "background" ? "#ffffff" : "#000000"
        );
      } else if (spec.type === "number") {
        const value = Number(resolved[key]);
        resolved[key] = Number.isFinite(value) ? value : (spec.default ?? 0);
      }
    }

    newSettings.qrcode_backdrop = resolved.backdrop ?? "solid";
    newSettings.qrcode_backdrop_shape = cfg.frame?.startsWith("circle")
      ? "circle"
      : cfg.frame === "hexagon"
        ? "hexagon"
        : cfg.frame === "rounded-border" || cfg.frame === "rounded-corners"
          ? "rounded"
          : "rect";
    newSettings.qrcode_backdrop_strength = resolved.backdropStrength ?? 0.5;
    newSettings.qrcode_backdrop_color =
      typeof resolved.background === "string"
        ? resolved.background
        : (resolved.background?.stops?.[0] ?? "#ffffff");

    newSettings.qrcode_style_config = stringifyAxisConfig({
      ...cfg,
      params: resolved,
    });

    const logo = parseLogoConfig(newSettings.qrcode_logo_config);
    if (logo.color) {
      logo.color = processQRColor(logo.color, logo.color);
      newSettings.qrcode_logo_config = stringifyLogoConfig(logo);
    }

    newSettings.qrcode_error_correction = ["L", "M", "Q", "H"].indexOf(
      newSettings.qrcode_error_correction.charAt(0)
    );

    return newSettings;
  }
}
