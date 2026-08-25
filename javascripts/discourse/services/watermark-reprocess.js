import { getOwner } from "@ember/owner";
import Service, { service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import { IMAGE_MARKDOWN_REGEX } from "discourse/lib/uploads";
import { imageDataToFile } from "../lib/media-watermark-utils";
import Watermark from "../lib/watermark";
import {
  buildTopicData,
  profileSignature,
  resolveProfile,
} from "../lib/watermark/profile";

export default class WatermarkReprocess extends Service {
  @service appEvents;
  @service currentUser;
  @service composer;

  byFileName = new Map();
  byShortUrl = new Map();
  inFlight = new Set();

  constructor() {
    super(...arguments);
    this.appEvents.on("composer:upload-success", this, this.finalizeUpload);
    this.appEvents.on("composer:category-changed", this, this.recheck);
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.appEvents.off("composer:upload-success", this, this.finalizeUpload);
    this.appEvents.off("composer:category-changed", this, this.recheck);
  }

  trackUpload(entry) {
    this.byFileName.set(entry.fileName, entry);
  }

  finalizeUpload(fileName, upload) {
    const entry = this.byFileName.get(fileName);

    if (!entry) {
      return;
    }

    this.byFileName.delete(fileName);
    this.byShortUrl.set(upload.short_url, entry);
  }

  recheck(composerModel) {
    if (
      !composerModel ||
      composerModel.isDestroyed ||
      composerModel.isDestroying ||
      composerModel !== this.composer.model
    ) {
      return;
    }

    for (const [shortUrl, entry] of [...this.byShortUrl]) {
      if (!(composerModel.reply || "").includes(shortUrl)) {
        this.byShortUrl.delete(shortUrl);
        continue;
      }

      if (this.inFlight.has(shortUrl)) {
        continue;
      }

      const resolved = resolveProfile(composerModel, this.currentUser);
      const signature = profileSignature(resolved);

      if (signature === entry.signature) {
        continue;
      }

      this.inFlight.add(shortUrl);
      this.setProcessing(composerModel, true);
      this.reprocessOne(composerModel, shortUrl, entry, resolved).finally(
        () => {
          this.inFlight.delete(shortUrl);
          if (this.inFlight.size === 0) {
            this.setProcessing(composerModel, false);
          }
        }
      );
    }
  }

  setProcessing(composerModel, active) {
    if (composerModel !== this.composer.model) {
      return;
    }

    this.composer.setProperties({
      isProcessingUpload: active,
      isCancellable: false,
    });
  }

  async reprocessOne(composerModel, oldShortUrl, entry, resolved) {
    let file;

    if (resolved.apply) {
      const watermark = new Watermark(getOwner(this), entry.originalFile, {
        topic: buildTopicData(composerModel),
        overwriteOptions: resolved.overwriteOptions,
      });

      const { data: imageData } = await watermark.process();

      if (!imageData) {
        return;
      }

      file = await imageDataToFile(imageData, {
        fileName: entry.fileName,
        fileType: entry.fileType,
      });
    } else {
      file = entry.originalFile;
    }

    const upload = await this.uploadFile(file);

    if (!upload) {
      return;
    }

    this.byShortUrl.delete(oldShortUrl);
    this.byShortUrl.set(upload.short_url, {
      ...entry,
      signature: profileSignature(resolved),
    });

    const handledRef = { value: false };
    this.appEvents.trigger("discourse-watermark:swap-image", {
      oldShortUrl,
      newUpload: upload,
      handledRef,
    });

    if (!handledRef.value) {
      this.swapInReply(composerModel, oldShortUrl, upload.short_url);
    }
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("upload_type", "composer");

    try {
      return await ajax("/uploads.json", {
        type: "POST",
        data: formData,
        processData: false,
        contentType: false,
      });
    } catch (err) {
      popupAjaxError(err);
      return null;
    }
  }

  swapInReply(composerModel, oldShortUrl, newShortUrl) {
    const matches = [
      ...(composerModel.reply || "").matchAll(IMAGE_MARKDOWN_REGEX),
    ];
    const index = matches.findIndex((m) => m[5]?.startsWith(oldShortUrl));

    if (index === -1) {
      return;
    }

    const fullMatch = matches[index][0];
    const replacement = fullMatch.replace(
      IMAGE_MARKDOWN_REGEX,
      (_match, alt, dims, percent, extra, src) =>
        `![${alt}|${dims}${percent ?? ""}${extra}](${newShortUrl}${src.slice(oldShortUrl.length)})`
    );

    this.appEvents.trigger("composer:replace-text", fullMatch, replacement, {
      regex: IMAGE_MARKDOWN_REGEX,
      index,
    });
  }
}
