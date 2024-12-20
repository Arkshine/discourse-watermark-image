import { helperContext } from "discourse-common/lib/helpers";

// Similar function as in core app/lib/media-optimization-utils.js
// Chrome and Firefox use a native method to do Image -> Bitmap Array (it happens of the main thread!)
// Safari < 15 uses the `<img async>` element due to https://bugs.webkit.org/show_bug.cgi?id=182424
// Safari > 15 still uses `<img async>` due to their buggy createImageBitmap not handling EXIF rotation

/**
 * Converts a file to a drawable image using asynchronous methods.
 * If the browser supports the `createImageBitmap` method and is not an Apple device, it uses that method.
 * Otherwise, it creates an image element and loads the file asynchronously.
 *
 * @param {File} file - The file to convert to a drawable image.
 * @returns {Promise<HTMLImageElement>} - A promise that resolves to the drawable image.
 */
async function fileToDrawable(file) {
  const caps = helperContext().capabilities;

  if ("createImageBitmap" in self && !caps.isApple) {
    return await createImageBitmap(file);
  } else {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.src = url;

    const loaded = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(Error("Image loading error"));
    });

    if (img.decode) {
      // Nice off-thread way supported in Safari/Chrome.
      // Safari throws on decode if the source is SVG.
      // https://bugs.webkit.org/show_bug.cgi?id=188347
      await img.decode().catch(() => null);
    }

    // Always await loaded, as we may have bailed due to the Safari bug above.
    await loaded;
    return img;
  }
}

/**
 * Creates a canvas without context.
 *
 * @param {HTMLImageElement} drawable - The drawable image to use for the canvas size.
 * @param {Object} options - Optional options for the canvas.
 */
function canvasWithoutContext(drawable, options = {}) {
  let canvas;

  const offscreenCanvasSupported = typeof OffscreenCanvas !== "undefined";
  let { width, height } = drawable;

  const { scale, rotate } = options;

  if ((scale && rotate) || (!scale && rotate)) {
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    const diagonal = Math.ceil(
      Math.sqrt(scaledWidth * scaledWidth + scaledHeight * scaledHeight)
    );

    width = height = diagonal;
  } else if (scale) {
    width *= scale;
    height *= scale;
  }

  if (offscreenCanvasSupported) {
    canvas = new OffscreenCanvas(width, height);
  } else {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
  }

  return canvas;
}

/**
 * Converts a canvas element to a blob of the specified file type.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} canvas - The canvas element to convert to a blob.
 * @param {string} fileType - The file type of the resulting blob.
 * @returns {Promise<Blob>} - A promise that resolves to the blob of the canvas.
 * @throws {Error} - If the canvas does not support blob conversion.
 */
async function convertCanvasToBlob(canvas, fileType) {
  if (canvas instanceof OffscreenCanvas) {
    // OffscreenCanvas path
    return await canvas.convertToBlob({ type: fileType, quality: 1.0 });
  } else if (typeof canvas.toBlob === "function") {
    // HTMLCanvasElement path
    return await new Promise((resolve) =>
      canvas.toBlob(resolve, fileType, 1.0)
    );
  } else {
    throw new Error("Canvas does not support Blob conversion");
  }
}

/**
 * Converts an image URL to a File object.*
 *
 * @param {string} url - The URL of the image to convert to a File.
 */
async function imageURLToFile(url, options = {}) {
  const response = await fetch(url);
  const blob = await response.blob();
  const filename = url.substring(url.lastIndexOf("/") + 1);
  const file = new File([blob], filename, {
    type: blob.type,
    url: response.url,
  });

  if (options.returnOriginalUrl) {
    return { file, url: response.url };
  }

  return file;
}

/**
 * Converts an ImageData object to File.
 *
 * @param {string} url - The URL of the image to convert to a canvas.
 * @param {Object} options - Optional options for the canvas.
 */
async function imageDataToFile(imageData, { fileName, fileType }) {
  const canvas = canvasWithoutContext(imageData);
  canvas.getContext("2d").putImageData(imageData, 0, 0);

  const blob = await convertCanvasToBlob(canvas, fileType);
  const file = new File([blob], fileName, {
    type: fileType,
    lastModified: Date.now(),
  });

  return file;
}

export {
  fileToDrawable,
  canvasWithoutContext,
  convertCanvasToBlob,
  imageURLToFile,
  imageDataToFile,
};
