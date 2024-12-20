import { Promise } from "rsvp";
import { UploadPreProcessorPlugin } from "discourse/lib/uppy-plugin-base";
import { bind } from "discourse-common/utils/decorators";

export default class UppyMediaWatermark extends UploadPreProcessorPlugin {
  static pluginId = "uppy-media-watermark";

  constructor(uppy, opts) {
    super(uppy, opts);
    this.watermarkFn = opts.watermarkFn;

    // mobile devices have limited processing power, so we only enable
    // running media optimization in parallel when we are sure the user
    // is not on a mobile device. otherwise we just process the images
    // serially.
    this.runParallel = opts.runParallel || false;
  }

  @bind
  _watermarkFile(fileId) {
    let file = this._getFile(fileId);

    this._emitProgress(file);

    return this.watermarkFn(file, { stopWorkerOnError: !this.runParallel })
      .then((watermarkedFile) => {
        let skipped = false;
        if (!watermarkedFile) {
          this._consoleWarn(
            "Nothing happened, possible error or other restriction, or the file format is not a valid one for compression."
          );
          skipped = true;
        } else {
          this._setFileState(fileId, {
            data: watermarkedFile,
            size: watermarkedFile.size,
          });
        }
        this._emitComplete(file, skipped);
      })
      .catch((err) => {
        this._consoleWarn(err);
        this._emitComplete(file);
      });
  }

  @bind
  _watermarkParallel(fileIds) {
    return Promise.all(fileIds.map(this._watermarkFile));
  }

  @bind
  async _watermarkSerial(fileIds) {
    let optimizeTasks = fileIds.map(
      (fileId) => () => this._watermarkFile(fileId)
    );

    for (const task of optimizeTasks) {
      await task();
    }
  }

  install() {
    if (this.runParallel) {
      this._install(this._watermarkParallel);
    } else {
      this._install(this._watermarkSerial);
    }
  }

  uninstall() {
    if (this.runParallel) {
      this._uninstall(this._watermarkParallel);
    } else {
      this._uninstall(this._watermarkSerial);
    }
  }
}
