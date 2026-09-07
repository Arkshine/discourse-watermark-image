import { getOwner } from "@ember/owner";
import { trackedMap, trackedSet } from "@ember/reactive/collections";
import Service, { service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import { IMAGE_MARKDOWN_REGEX } from "discourse/lib/uploads";
import { imageDataToFile } from "../lib/media-watermark-utils";
import Watermark from "../lib/watermark";
import {
  buildTopicData,
  matchingProfileNames,
  profileSignature,
  resolveProfile,
} from "../lib/watermark/profile";

export default class WatermarkReprocess extends Service {
  @service appEvents;
  @service currentUser;
  @service composer;

  byFileName = trackedMap();
  byShortUrl = trackedMap();
  inFlight = trackedSet();

  constructor() {
    super(...arguments);
    this.appEvents.on("composer:upload-success", this, this.finalizeUpload);
    this.appEvents.on("composer:category-changed", this, this.recheck);
    this.appEvents.on(
      "discourse-watermark:toggle-request",
      this,
      this.handleToggleRequest
    );
    this.appEvents.on(
      "discourse-watermark:pick-request",
      this,
      this.handlePickRequest
    );
    this.appEvents.on(
      "discourse-watermark:apply-all-request",
      this,
      this.handleApplyAllRequest
    );
    this.appEvents.on(
      "discourse-watermark:rte-mounted",
      this,
      this.handleRteMounted
    );
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.appEvents.off("composer:upload-success", this, this.finalizeUpload);
    this.appEvents.off("composer:category-changed", this, this.recheck);
    this.appEvents.off(
      "discourse-watermark:toggle-request",
      this,
      this.handleToggleRequest
    );
    this.appEvents.off(
      "discourse-watermark:pick-request",
      this,
      this.handlePickRequest
    );
    this.appEvents.off(
      "discourse-watermark:apply-all-request",
      this,
      this.handleApplyAllRequest
    );
    this.appEvents.off(
      "discourse-watermark:rte-mounted",
      this,
      this.handleRteMounted
    );
  }

  handleRteMounted() {
    this.broadcastImages();
  }

  handleToggleRequest(shortUrl, ordinal = 0) {
    this.toggleManual(this.composer.model, shortUrl, ordinal);
  }

  handlePickRequest(shortUrl, ordinal = 0, profileName = null) {
    this.pickProfile(this.composer.model, shortUrl, profileName, ordinal);
  }

  handleApplyAllRequest(shortUrl) {
    this.applyToAll(this.composer.model, shortUrl);
  }

  broadcastImages() {
    const composerModel = this.composer.model;

    if (composerModel) {
      this.appEvents.trigger(
        "discourse-watermark:images-changed",
        this.imagesFor(composerModel)
      );
    }
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
    this.broadcastImages();
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

    const resolved = resolveProfile(composerModel, this.currentUser);
    const signature = profileSignature(resolved);
    const options = matchingProfileNames(composerModel, this.currentUser);
    let pruned = false;

    for (const [shortUrl, entry] of [...this.byShortUrl]) {
      if (!(composerModel.reply || "").includes(shortUrl)) {
        this.byShortUrl.delete(shortUrl);
        pruned = true;
        continue;
      }

      if (this.inFlight.has(shortUrl)) {
        continue;
      }

      // Pinned profile no longer matches: remove the watermark.
      if (entry.profileName && !options.includes(entry.profileName)) {
        const reset = { ...entry, manual: false, profileName: null };
        this.byShortUrl.set(shortUrl, reset);
        this.startReprocess(composerModel, shortUrl, reset, {
          ...resolved,
          apply: false,
        });
        continue;
      }

      if (entry.manual != null) {
        continue;
      }

      if (signature === entry.signature) {
        continue;
      }

      this.startReprocess(composerModel, shortUrl, entry, resolved);
    }

    if (pruned) {
      this.broadcastImages();
    }
  }

  imagesFor(composerModel) {
    if (!composerModel || composerModel !== this.composer.model) {
      return [];
    }

    const resolved = resolveProfile(composerModel, this.currentUser);
    const options = matchingProfileNames(composerModel, this.currentUser);

    const trackedImages = [...this.byShortUrl].map(([shortUrl, entry]) => ({
      shortUrl,
      fileName: entry.fileName,
      applied: entry.manual ?? resolved.apply,
      profileName: entry.profileName ?? null,
      options,
      processing: this.inFlight.has(shortUrl),
      available: true,
    }));

    const trackedUrls = new Set(trackedImages.map((image) => image.shortUrl));
    const restored = this.untrackedShortUrls(composerModel)
      .filter((shortUrl) => !trackedUrls.has(shortUrl))
      .map((shortUrl) => ({
        shortUrl,
        fileName: null,
        applied: null,
        profileName: null,
        options,
        processing: false,
        available: false,
      }));

    return [...trackedImages, ...restored];
  }

  parseImageMatches(composerModel) {
    return [...(composerModel.reply || "").matchAll(IMAGE_MARKDOWN_REGEX)];
  }

  untrackedShortUrls(composerModel) {
    return this.parseImageMatches(composerModel)
      .map((match) => match[5])
      .filter(Boolean);
  }

  occurrenceCount(matches, shortUrl) {
    return matches.filter((match) => match[5] === shortUrl).length;
  }

  matchIndexForOccurrence(matches, shortUrl, ordinal) {
    let seen = 0;

    for (let i = 0; i < matches.length; i++) {
      if (matches[i][5] === shortUrl) {
        if (seen === ordinal) {
          return i;
        }
        seen++;
      }
    }

    return -1;
  }

  toggleManual(composerModel, shortUrl, ordinal = 0) {
    if (!composerModel || composerModel !== this.composer.model) {
      return;
    }

    const entry = this.byShortUrl.get(shortUrl);

    if (!entry || this.inFlight.has(shortUrl)) {
      return;
    }

    const resolved = resolveProfile(composerModel, this.currentUser);
    const manual = !(entry.manual ?? resolved.apply);
    const updated = { ...entry, manual };
    this.byShortUrl.set(shortUrl, updated);
    this.broadcastImages();

    this.startReprocess(
      composerModel,
      shortUrl,
      updated,
      { ...resolved, apply: manual },
      entry,
      ordinal
    );
  }

  pickProfile(composerModel, shortUrl, profileName, ordinal = 0) {
    if (!composerModel || composerModel !== this.composer.model) {
      return;
    }

    const entry = this.byShortUrl.get(shortUrl);

    if (!entry || this.inFlight.has(shortUrl)) {
      return;
    }

    this.applyChoice(
      composerModel,
      shortUrl,
      entry,
      profileName != null,
      profileName ?? null,
      ordinal
    );
  }

  applyToAll(composerModel, sourceShortUrl) {
    if (!composerModel || composerModel !== this.composer.model) {
      return;
    }

    const source = this.byShortUrl.get(sourceShortUrl);

    if (!source) {
      return;
    }

    for (const [shortUrl, entry] of [...this.byShortUrl]) {
      if (shortUrl === sourceShortUrl || this.inFlight.has(shortUrl)) {
        continue;
      }

      this.applyChoice(
        composerModel,
        shortUrl,
        entry,
        source.manual ?? null,
        source.profileName ?? null
      );
    }
  }

  applyChoice(
    composerModel,
    shortUrl,
    entry,
    manual,
    profileName,
    ordinal = 0
  ) {
    const resolved = resolveProfile(composerModel, this.currentUser, {
      profileName,
    });
    const target = { ...resolved, apply: manual ?? resolved.apply };
    const updated = { ...entry, manual, profileName };

    this.byShortUrl.set(shortUrl, updated);
    this.broadcastImages();

    if (profileSignature(target) !== entry.signature) {
      this.startReprocess(
        composerModel,
        shortUrl,
        updated,
        target,
        entry,
        ordinal
      );
    }
  }

  startReprocess(
    composerModel,
    shortUrl,
    entry,
    resolved,
    leftoverEntry = entry,
    ordinal = 0
  ) {
    this.inFlight.add(shortUrl);
    this.setProcessing(composerModel, true);
    this.broadcastImages();

    this.reprocessOne(
      composerModel,
      shortUrl,
      entry,
      resolved,
      leftoverEntry,
      ordinal
    ).finally(() => {
      this.inFlight.delete(shortUrl);
      if (this.inFlight.size === 0) {
        this.setProcessing(composerModel, false);
      }
      this.broadcastImages();
    });
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

  async reprocessOne(
    composerModel,
    oldShortUrl,
    entry,
    resolved,
    leftoverEntry,
    ordinal
  ) {
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

    const matches = this.parseImageMatches(composerModel);
    const remainingOccurrences = this.occurrenceCount(matches, oldShortUrl) - 1;

    if (remainingOccurrences > 0) {
      this.byShortUrl.set(oldShortUrl, { ...leftoverEntry });
    } else {
      this.byShortUrl.delete(oldShortUrl);
    }

    this.byShortUrl.set(upload.short_url, {
      ...entry,
      signature: profileSignature(resolved),
    });

    const handledRef = { value: false };
    this.appEvents.trigger("discourse-watermark:swap-image", {
      oldShortUrl,
      newUpload: upload,
      ordinal,
      handledRef,
    });

    if (!handledRef.value) {
      this.swapInReply(matches, oldShortUrl, upload.short_url, ordinal);
    }

    this.broadcastImages();
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

  swapInReply(matches, oldShortUrl, newShortUrl, ordinal) {
    const index = this.matchIndexForOccurrence(matches, oldShortUrl, ordinal);

    if (index === -1) {
      return;
    }

    const fullMatch = matches[index][0];
    const replacement = fullMatch.replace(
      IMAGE_MARKDOWN_REGEX,
      (_match, alt, dims, percent, extra) =>
        `![${alt}|${dims}${percent ?? ""}${extra}](${newShortUrl})`
    );

    this.appEvents.trigger("composer:replace-text", fullMatch, replacement, {
      regex: IMAGE_MARKDOWN_REGEX,
      index,
    });
  }
}
