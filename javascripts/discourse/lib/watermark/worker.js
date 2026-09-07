const workerWatermarkUrl = settings.theme_uploads_local.worker_watermark;
const workerPhotonUrl = settings.theme_uploads_local.worker_photon;
const workerPhotonWasmUrl = settings.theme_uploads.worker_photon_wasm;

const qrCodeUrl = settings.theme_uploads_local.qrcode;
const qrCodeGenUrl = settings.theme_uploads_local.qrcodegen;
const qrCodeGenWasmUrl = settings.theme_uploads.qrcodegen_wasm;
const roughjsUrl = settings.theme_uploads_local.roughjs;

const WORKER_TIMEOUT_MS = 60000;

class WorkerManager {
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
        const { incomingSeq, data, error, meta } = event.data;
        const resolver = this.resolvers[incomingSeq];

        if (!resolver) {
          return;
        }

        delete this.resolvers[incomingSeq];

        if (error) {
          resolver.reject(new Error(error));
        } else {
          resolver.resolve({ data, meta });
        }
      };

      this.workers[type].onerror = (event) => {
        const message = event.message || `Watermark '${type}' worker crashed`;

        for (const [seq, resolver] of Object.entries(this.resolvers)) {
          if (resolver.type === type) {
            delete this.resolvers[seq];
            resolver.reject(new Error(message));
          }
        }
      };
    }

    return this.workers[type];
  }

  async sendMessage(type, message, transferables = []) {
    const seq = this.messageSeq++;
    const worker = await this.initWorker(type, this.getWorkerConfig(type));

    worker.postMessage({ ...message, seq }, transferables);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.resolvers[seq]) {
          delete this.resolvers[seq];
          reject(new Error(`Watermark '${type}' worker timed out`));
        }
      }, WORKER_TIMEOUT_MS);

      this.resolvers[seq] = {
        type,
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      };
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
            qrcode: {
              render: qrCodeUrl,
              bindings: qrCodeGenUrl,
              wasm: qrCodeGenWasmUrl,
              rough: roughjsUrl,
            },
          });
        },
      },
    };

    return configs[type];
  }
}

export const workerManager = new WorkerManager();

export async function renderQrThumbnail(settings, size) {
  const { data } = await workerManager.sendMessage("watermark", {
    action: "renderQr",
    params: { settings, size },
  });

  return data;
}
