import { setOwner } from "@ember/owner";
import { service } from "@ember/service";
import { getAbsoluteURL } from "discourse-common/lib/get-url";
import { imageURLToFile } from "./media-watermark-utils";

const workerWatermarkUrl = settings.theme_uploads_local.worker_watermark;
const workerPhotonUrl = settings.theme_uploads_local.worker_photon;
const workerPhotonWasmUrl = settings.theme_uploads.worker_photon_wasm;

const workerQRCodeUrl = settings.theme_uploads_local.worker_qrcode;
const workerQRCodeGenUrl = settings.theme_uploads_local.worker_qrcodegen;
const workerQRCodeGenWasmUrl = settings.theme_uploads.worker_qrcodegen_wasm;

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

class WorkerManager {
  @service siteSettings;

  constructor() {
    this.workers = {};
    this.messageSeq = 0;
    this.resolvers = {};
  }

  async initWorker(type, config) {
    if (!this.workers[type]) {
      this.workers[type] = new Worker(config.url);

      if (config.init) {
        await config.init(this.workers[type]);
      }

      this.workers[type].onmessage = (event) => {
        const { incomingSeq, data } = event.data;

        if (this.resolvers[incomingSeq]) {
          this.resolvers[incomingSeq](data);
          delete this.resolvers[incomingSeq];
        }
      };
    }

    return this.workers[type];
  }

  async sendMessage(type, message, transferables = []) {
    const seq = this.messageSeq++;
    const worker = await this.initWorker(type, this.getWorkerConfig(type));

    worker.postMessage({ ...message, seq }, transferables);

    return new Promise((resolve) => {
      this.resolvers[seq] = resolve;
    });
  }

  getWorkerConfig(type) {
    const configs = {
      watermark: {
        url: workerWatermarkUrl,
        init: async (worker) => {
          worker.postMessage({
            action: "load",
            url: workerPhotonUrl,
            wasmUrl: workerPhotonWasmUrl,
          });
        },
      },
      qrcode: {
        url: workerQRCodeUrl,
        init: async (worker) => {
          worker.postMessage({
            action: "load",
            url: workerQRCodeGenUrl,
            wasmUrl: workerQRCodeGenWasmUrl,
          });
        },
      },
    };

    return configs[type];
  }
}

const workerManager = new WorkerManager();

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
    this.topicData = params?.topic || {};
  }

  async process() {
    let qrCodeData = null;

    if (this.settings.qrcode_enabled) {
      qrCodeData = await this.generateQRCode();

      if (qrCodeData?.error) {
        return null;
      }
    }

    return this.applyWatermark(qrCodeData);
  }

  async generateQRCode() {
    return workerManager.sendMessage("qrcode", {
      action: "generate",
      ...this.settings,
    });
  }

  async applyWatermark(qrCodeData) {
    console.log("applyWatermark", qrCodeData);
    const params = await this.workerData(qrCodeData);
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

  async workerData(qrCodeData = null) {
    const uploadBuffer = await this.file.arrayBuffer();

    let watermarkData = {};

    if (qrCodeData) {
      watermarkData = {
        buffer: qrCodeData.buffer,
      };
    } else {
      const watermarkFile = await imageURLToFile(this.abolsuteWatermarkURL);
      watermarkData = {
        buffer: await watermarkFile.arrayBuffer(),
      };
    }

    const data = {
      upload: {
        buffer: uploadBuffer,
      },
      watermark: {
        ...watermarkData,
        ...this.settings,
        isQRCode: !!qrCodeData,
      },
    };

    return data;
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

    newSettings.qrcode_text = newSettings.qrcode_text
      .replace("{homepage}", getAbsoluteURL(""))
      .replace("{username}", this.currentUser.username)
      .replace("{sitename}", this.siteSettings.title);

    if (this.topicData) {
      const topicUrl = getAbsoluteURL(this.topicData?.url) || "";

      newSettings.qrcode_text = newSettings.qrcode_text.replace(
        "{topic_url}",
        topicUrl
      );
    }

    const processQRColor = (color, defaultColor) => {
      if (color.startsWith("var(--") || color.startsWith("--")) {
        color = getComputedStyle(document.documentElement).getPropertyValue(
          color.replace(/var\((--.*?)\)/g, "$1")
        );

        return color || defaultColor;
      }

      if (/^#[0-9A-F]{6}$/i.test(color)) {
        return color;
      }

      return defaultColor;
    };

    newSettings.qrcode_color = processQRColor(
      newSettings.qrcode_color,
      "#000000"
    );

    newSettings.qrcode_background_color = processQRColor(
      newSettings.qrcode_background_color,
      "#ffffff"
    );

    newSettings.qrcode_error_correction = ["L", "M", "Q", "H"].indexOf(
      newSettings.qrcode_error_correction.charAt(0)
    );

    return newSettings;
  }

  get abolsuteWatermarkURL() {
    return this.settings.image.startsWith("http")
      ? this.settings.image
      : getAbsoluteURL(this.settings.image);
  }
}
