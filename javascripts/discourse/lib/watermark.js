import { getAbsoluteURL } from "discourse-common/lib/get-url";
import { imageURLToFile } from "./media-watermark-utils";

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
      params.upload.buffer,
      params.watermark.buffer,
    ]);

    return new Promise((resolve) => {
      resolvers[seq] = resolve;
    });
  }

  async workerData() {
    const uploadBuffer = await this.file.arrayBuffer();
    const watermarkFile = await imageURLToFile(this.abolsuteWatermarkURL);
    const watermarkBuffer = await watermarkFile.arrayBuffer();

    return {
      upload: {
        buffer: uploadBuffer,
      },
      watermark: {
        buffer: watermarkBuffer,
        ...this.settings,
      },
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

    return newSettings;
  }

  get abolsuteWatermarkURL() {
    return this.settings.image.startsWith("http")
      ? this.settings.image
      : getAbsoluteURL(this.settings.image);
  }
}
