import { setupTest } from "ember-qunit";
import { module, test } from "qunit";
import { createFile } from "discourse/tests/helpers/qunit-helpers";
import UppyMediaWatermark from "../../discourse/lib/uppy-media-watermark-plugin";

class FakeUppy {
  constructor() {
    this.emitted = [];
    this.file = createFile("test.png");
  }

  getFile() {
    return this.file;
  }

  setFileState(fileId, state) {
    this.fileState = state;
  }

  emit(event, file, data) {
    this.emitted.push({ event, file, data });
  }
}

function buildPlugin(opts) {
  const uppy = new FakeUppy();
  const plugin = new UppyMediaWatermark(uppy, opts);
  return { plugin, uppy };
}

module("Unit | Lib | uppy-media-watermark-plugin", function (hooks) {
  setupTest(hooks);

  test("allows the upload through when watermarking rejects", async function (assert) {
    const { plugin, uppy } = buildPlugin({
      watermarkFn: () => Promise.reject(new Error("boom")),
      allowUploadOnError: true,
    });

    await plugin._watermarkFile("file-1");

    assert.deepEqual(
      uppy.emitted.map((e) => e.event),
      ["preprocess-progress", "preprocess-complete"],
      "skips the file instead of erroring"
    );
    assert.true(
      uppy.emitted.at(-1).data,
      "preprocess-complete is emitted as skipped"
    );
  });

  test("blocks the upload when watermarking rejects", async function (assert) {
    const { plugin, uppy } = buildPlugin({
      watermarkFn: () => Promise.reject(new Error("boom")),
      allowUploadOnError: false,
      errorMessage: "Watermarking failed",
    });

    await plugin._watermarkFile("file-1");

    assert.deepEqual(
      uppy.emitted.map((e) => e.event),
      ["preprocess-progress", "upload-error"]
    );
    assert.deepEqual(uppy.emitted.at(-1).data.errors, ["Watermarking failed"]);
  });

  test("falls back to the rejection's error message", async function (assert) {
    const { plugin, uppy } = buildPlugin({
      watermarkFn: () => Promise.reject(new Error("boom")),
      allowUploadOnError: false,
    });

    await plugin._watermarkFile("file-1");

    assert.deepEqual(uppy.emitted.at(-1).data.errors, ["boom"]);
  });

  test("replaces the file when watermarking succeeds", async function (assert) {
    const watermarkedFile = { size: 123 };
    const { plugin, uppy } = buildPlugin({
      watermarkFn: () => Promise.resolve(watermarkedFile),
    });

    await plugin._watermarkFile("file-1");

    assert.deepEqual(
      uppy.emitted.map((e) => e.event),
      ["preprocess-progress", "preprocess-complete"]
    );
    assert.false(uppy.emitted.at(-1).data, "not marked as skipped");
    assert.strictEqual(uppy.fileState.data, watermarkedFile);
    assert.strictEqual(uppy.fileState.size, 123);
  });

  test("skips the file when watermarking returns null", async function (assert) {
    const { plugin, uppy } = buildPlugin({
      watermarkFn: () => Promise.resolve(null),
    });

    await plugin._watermarkFile("file-1");

    assert.true(uppy.emitted.at(-1).data, "marked as skipped");
    assert.strictEqual(uppy.fileState, undefined);
  });
});
