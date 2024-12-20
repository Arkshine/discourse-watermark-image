import { getAbsoluteURL } from "discourse-common/lib/get-url";
import {
  canvasWithoutContext,
  fileToDrawable,
  imageURLToFile,
} from "./media-watermark-utils";

const webWorkerUrl = settings.theme_uploads_local.worker;
const wasmUrl = settings.theme_uploads.wasm;

let webWorker;
let messageSeq = 0;
let resolvers = {};

export default class Watermark {
  constructor(file, options = {}) {
    this.file = file;
    this.overwriteOptions = options;
  }

  async sendToWorker() {
    let seq = messageSeq++;

    if (!webWorker) {
      webWorker = new Worker(webWorkerUrl);
      webWorker.postMessage(["wasmUrl", wasmUrl]);
      webWorker.onmessage = function (event) {
        const { incomingSeq, uploadImageData } = event.data;

        resolvers[incomingSeq](uploadImageData);

        delete resolvers[incomingSeq];
      };
    }

    const params = await this.workerData();

    webWorker.postMessage({ seq, params }, [
      params.upload.canvas,
      params.watermark.canvas,
    ]);

    return new Promise((resolve) => {
      resolvers[seq] = resolve;
    });
  }

  async workerData() {
    const calculateScale = (uploadWith, scale) => {
      return { scale: scale * (uploadWith / 1000) };
    };

    const uploadDrawable = await fileToDrawable(this.file);
    const watermarkDrawable = await fileToDrawable(
      await imageURLToFile(this.abolsuteWatermarkURL)
    );

    const upLoadCanvas = canvasWithoutContext(uploadDrawable);
    const watermarkCanvas = canvasWithoutContext(watermarkDrawable, {
      ...this.transformSettings,
      ...calculateScale(uploadDrawable.width, this.settings.scale),
    });

    const position = this.getCoordinates(
      upLoadCanvas,
      watermarkCanvas.width,
      watermarkCanvas.height,
      this.settings.position
    );

    return {
      upload: { canvas: upLoadCanvas, drawable: uploadDrawable },
      watermark: {
        canvas: watermarkCanvas,
        drawable: watermarkDrawable,
        ...this.transformSettings,
        ...calculateScale(uploadDrawable.width, this.settings.scale),
        position,
      },
    };
  }

  getCoordinates(canvas, watermarkWidth, watermarkHeight, position) {
    const margin = this.settings.margin * canvas.width;

    const positions = {
      "top-left": { x: margin, y: margin },
      "top-center": { x: (canvas.width - watermarkWidth) / 2, y: margin },
      "top-right": {
        x: canvas.width - watermarkWidth - margin,
        y: margin,
      },
      "center-left": {
        x: margin,
        y: (canvas.height - watermarkHeight) / 2,
      },
      center: {
        x: (canvas.width - watermarkWidth) / 2,
        y: (canvas.height - watermarkHeight) / 2,
      },
      "center-right": {
        x: canvas.width - watermarkWidth - margin,
        y: (canvas.height - watermarkHeight) / 2,
      },
      "bottom-left": {
        x: margin,
        y: canvas.height - watermarkHeight - margin,
      },
      "bottom-center": {
        x: (canvas.width - watermarkWidth) / 2,
        y: canvas.height - watermarkHeight - margin,
      },
      "bottom-right": {
        x: canvas.width - watermarkWidth - margin,
        y: canvas.height - watermarkHeight - margin,
      },
    };

    return positions[position];
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

    newSettings.margin = newSettings.margin / 100;
    newSettings.opacity = newSettings.opacity / 100;

    return newSettings;
  }

  get transformSettings() {
    const { scale, rotate, opacity } = this.settings;
    return { scale, rotate, opacity };
  }

  get abolsuteWatermarkURL() {
    return this.settings.image.startsWith("http")
      ? this.settings.image
      : getAbsoluteURL(this.settings.image);
  }
}
