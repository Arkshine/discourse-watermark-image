/* eslint-disable no-undef */
/* eslint-disable no-console */

let promisePhoton;
let promiseQrCode;
let qrCodeAssets;

async function handleMessage(event) {
  const action = event.data.action;

  if (action === "load") {
    const { url, wasmUrl, qrcode } = event.data;
    importScripts(url);
    promisePhoton = __wbg_init({ module_or_path: wasmUrl });
    qrCodeAssets = qrcode;
  } else if (action === "apply") {
    await promisePhoton;
    applyWatermark(event);
  } else if (action === "renderQr") {
    await renderQrOnly(event);
  }
}

async function renderQrOnly(event) {
  const { seq, params } = event.data;

  try {
    await loadQrCode();

    const data = await renderQrCode(params.settings, params.size);

    postMessage({ incomingSeq: seq, data }, [data.buffer]);
  } catch (error) {
    postMessage({ incomingSeq: seq, error: error.toString() });
  }
}

onmessage = handleMessage;

function loadQrCode() {
  promiseQrCode ||= (async () => {
    importScripts(qrCodeAssets.render);
    importScripts(qrCodeAssets.bindings);

    if (qrCodeAssets.rough) {
      importScripts(qrCodeAssets.rough);
    }

    return QrCodeGen.init({ module_or_path: qrCodeAssets.wasm });
  })();

  return promiseQrCode;
}

const NOMINAL_QR_SIZE = 2048;
const QR_SUPERSAMPLE = 1;
const SIZE_SLACK = 0.05;

function availableSpace(uploadWidth, uploadHeight, settings) {
  const [vertical, horizontal = "center"] = String(
    settings.position || "center"
  ).split("-");

  const tiled = settings.pattern && settings.pattern !== "none";

  return {
    width:
      tiled || horizontal === "center"
        ? uploadWidth
        : uploadWidth * (1 - 2 * Math.abs(settings.margin_x || 0)),
    height:
      tiled || vertical === "center"
        ? uploadHeight
        : uploadHeight * (1 - 2 * Math.abs(settings.margin_y || 0)),
  };
}

function fitWithin(width, height, uploadWidth, uploadHeight, settings) {
  const space = availableSpace(uploadWidth, uploadHeight, settings);
  const room = {
    width: Math.min(uploadWidth * (settings.max_size / 100), space.width),
    height: Math.min(uploadHeight * (settings.max_size / 100), space.height),
  };
  const scale = Math.min(1, room.width / width, room.height / height);

  return { width: width * scale, height: height * scale };
}

function targetSize(uploadWidth, uploadHeight, natural, settings) {
  const aspectRatio = natural.width / natural.height;

  let width, height;

  if (settings.size_mode === "absolute") {
    const room = fitWithin(
      natural.width,
      natural.height,
      uploadWidth,
      uploadHeight,
      settings
    );

    width = room.width * settings.absolute_scale;
    height = room.height * settings.absolute_scale;
  } else {
    width = uploadWidth * (settings.relative_width / 100);
    height = width / aspectRatio;
  }

  const fitted = fitWithin(width, height, uploadWidth, uploadHeight, settings);

  return {
    width: Math.max(1, Math.floor(fitted.width)),
    height: Math.max(1, Math.floor(fitted.height)),
  };
}

function containWithinMargin(offset, watermarkSize, uploadSize, margin) {
  const furthest = uploadSize - watermarkSize - margin;

  if (furthest < margin) {
    return (uploadSize - watermarkSize) / 2;
  }

  return Math.min(Math.max(offset, margin), furthest);
}

function getCoordinates(
  uploadWith,
  uploadHeight,
  watermarkWidth,
  watermarkheight,
  settings
) {
  const margin_x = settings.margin_x * uploadWith;
  const margin_y = settings.margin_y * uploadHeight;
  const position = settings.position;

  const positions = {
    "top-left": { x: margin_x, y: margin_y },
    "top-center": {
      x: (uploadWith - watermarkWidth) / 2,
      y: margin_y,
    },
    "top-right": {
      x: uploadWith - watermarkWidth - margin_x,
      y: margin_y,
    },
    "center-left": {
      x: margin_x,
      y: (uploadHeight - watermarkheight) / 2,
    },
    center: {
      x: (uploadWith - watermarkWidth) / 2,
      y: (uploadHeight - watermarkheight) / 2,
    },
    "center-right": {
      x: uploadWith - watermarkWidth - margin_x,
      y: (uploadHeight - watermarkheight) / 2,
    },
    "bottom-left": {
      x: margin_x,
      y: uploadHeight - watermarkheight - margin_y,
    },
    "bottom-center": {
      x: (uploadWith - watermarkWidth) / 2,
      y: uploadHeight - watermarkheight - margin_y,
    },
    "bottom-right": {
      x: uploadWith - watermarkWidth - margin_x,
      y: uploadHeight - watermarkheight - margin_y,
    },
  };

  const { x, y } = positions[position];

  return {
    x: containWithinMargin(x, watermarkWidth, uploadWith, margin_x),
    y: containWithinMargin(y, watermarkheight, uploadHeight, margin_y),
  };
}

function createTransparentImage(width, height) {
  const transparentBuffer = new Uint8Array(width * height * 4);

  for (let i = 0; i < transparentBuffer.length; i += 4) {
    transparentBuffer[i] = 0; // R
    transparentBuffer[i + 1] = 0; // G
    transparentBuffer[i + 2] = 0; // B
    transparentBuffer[i + 3] = 0; // A fully transparent
  }

  return new PhotonImage(transparentBuffer, width, height);
}

function generateGridPattern(
  uploadWidth,
  uploadHeight,
  watermarkWidth,
  watermarkHeight,
  settings
) {
  const maxWatermarks = settings.pattern_max_count || Infinity;
  const spacing = settings.pattern_spacing || 0;
  const allowPartial = settings.pattern_allow_partial || false;

  const spacingDistance = (spacing / 100) * Math.min(uploadWidth, uploadHeight);
  const translateX = (settings.margin_x || 0) * uploadWidth;
  const translateY = (settings.margin_y || 0) * uploadHeight;

  const cellWidth = watermarkWidth + spacingDistance;
  const cellHeight = watermarkHeight + spacingDistance;

  let maxPossibleColumns, maxPossibleRows;

  if (allowPartial) {
    maxPossibleColumns = Math.ceil(uploadWidth / cellWidth) + 2;
    maxPossibleRows = Math.ceil(uploadHeight / cellHeight) + 2;
  } else {
    maxPossibleColumns = Math.floor(uploadWidth / cellWidth);
    maxPossibleRows = Math.floor(uploadHeight / cellHeight);
  }

  let columns, rows;

  if (maxWatermarks && maxWatermarks < maxPossibleColumns * maxPossibleRows) {
    let bestColumns = 1;
    let bestRows = maxWatermarks;
    let bestRatio = Math.abs(bestColumns / bestRows - 1);

    for (let testColumns = 1; testColumns <= maxWatermarks; testColumns++) {
      const testRows = Math.ceil(maxWatermarks / testColumns);
      if (testColumns > maxPossibleColumns || testRows > maxPossibleRows) {
        continue;
      }

      const ratio = Math.abs(testColumns / testRows - 1);
      if (ratio < bestRatio && testColumns * testRows >= maxWatermarks) {
        bestColumns = testColumns;
        bestRows = testRows;
        bestRatio = ratio;
      }
    }

    columns = bestColumns;
    rows = bestRows;
  } else {
    columns = maxPossibleColumns;
    rows = maxPossibleRows;
  }

  const totalGridWidth =
    columns * watermarkWidth + (columns - 1) * spacingDistance;
  const totalGridHeight = rows * watermarkHeight + (rows - 1) * spacingDistance;

  const centerX = uploadWidth / 2;
  const centerY = uploadHeight / 2;
  const offsetX = -(totalGridWidth / 2);
  const offsetY = -(totalGridHeight / 2);

  const positions = [];
  let count = 0;

  for (let row = 0; row < rows && count < maxWatermarks; row++) {
    for (let col = 0; col < columns && count < maxWatermarks; col++) {
      const x = centerX + offsetX + col * cellWidth + translateX;
      const y = centerY + offsetY + row * cellHeight + translateY;

      if (
        !allowPartial &&
        (x < 0 ||
          y < 0 ||
          x + watermarkWidth > uploadWidth ||
          y + watermarkHeight > uploadHeight)
      ) {
        continue;
      }

      if (allowPartial) {
        const isCompletelyOutside =
          x + watermarkWidth < 0 ||
          y + watermarkHeight < 0 ||
          x > uploadWidth ||
          y > uploadHeight;
        if (isCompletelyOutside) {
          continue;
        }
      }

      positions.push({ x, y });
      count++;
    }
  }

  return positions;
}

function generateDiagonalPattern(
  uploadWidth,
  uploadHeight,
  watermarkWidth,
  watermarkHeight,
  settings
) {
  const allowPartial = settings.pattern_allow_partial || false;
  const maxWatermarks = settings.pattern_max_count || Infinity;
  const spacing = settings.pattern_spacing || 0;
  const angle = settings.rotate || 45;

  const spacingDistance = (spacing / 100) * Math.min(uploadWidth, uploadHeight);
  const translateX = (settings.margin_x || 0) * uploadWidth;
  const translateY = (settings.margin_y || 0) * uploadHeight;

  const positions = [];
  const radians = (angle * Math.PI) / 180;

  const diagonalStep =
    Math.max(watermarkWidth, watermarkHeight) + spacingDistance;
  const perpStep = diagonalStep;

  const perpX = -Math.sin(radians);
  const perpY = Math.cos(radians);
  const diagX = Math.cos(radians);
  const diagY = Math.sin(radians);

  const imageDiagonal = Math.sqrt(
    Math.pow(uploadWidth, 2) + Math.pow(uploadHeight, 2)
  );
  const numParallelLines = Math.ceil(imageDiagonal / perpStep);
  const centerX = uploadWidth / 2;
  const centerY = uploadHeight / 2;

  let count = 0;
  for (
    let i = -numParallelLines;
    i <= numParallelLines && count < maxWatermarks;
    i++
  ) {
    let lineStartX = centerX + i * perpStep * perpX;
    let lineStartY = centerY + i * perpStep * perpY;

    lineStartX -= (diagX * imageDiagonal) / 2;
    lineStartY -= (diagY * imageDiagonal) / 2;

    let x = lineStartX;
    let y = lineStartY;
    let steps = 0;
    const maxSteps = Math.ceil((imageDiagonal * 3) / diagonalStep);

    while (count < maxWatermarks && steps < maxSteps) {
      steps++;

      const finalX = x + translateX;
      const finalY = y + translateY;

      const isWithinX = allowPartial
        ? finalX > -watermarkWidth && finalX < uploadWidth
        : finalX >= 0 && finalX <= uploadWidth - watermarkWidth;

      const isWithinY = allowPartial
        ? finalY > -watermarkHeight && finalY < uploadHeight
        : finalY >= 0 && finalY <= uploadHeight - watermarkHeight;

      x += diagX * diagonalStep;
      y += diagY * diagonalStep;

      const distanceFromCenterX = Math.abs(x - translateX - centerX);
      const distanceFromCenterY = Math.abs(y - translateY - centerY);
      const safetyMargin = Math.max(watermarkWidth, watermarkHeight) * 2;

      if (
        distanceFromCenterX > imageDiagonal + safetyMargin ||
        distanceFromCenterY > imageDiagonal + safetyMargin ||
        distanceFromCenterX * distanceFromCenterX +
          distanceFromCenterY * distanceFromCenterY >
          Math.pow(imageDiagonal + safetyMargin, 2)
      ) {
        break;
      }

      if (!isWithinX || !isWithinY) {
        continue;
      }

      positions.push({ x: finalX, y: finalY });
      count++;
    }
  }

  return positions;
}

function generateRandomPattern(
  uploadWidth,
  uploadHeight,
  watermarkWidth,
  watermarkHeight,
  settings
) {
  const count = settings.pattern_max_count || 5;
  const allowPartial = settings.pattern_allow_partial || false;
  const spacing = settings.pattern_spacing || 0;

  const minSpacingDistance =
    (spacing / 100) * Math.min(uploadWidth, uploadHeight);

  const translateX = (settings.margin_x || 0) * uploadWidth;
  const translateY = (settings.margin_y || 0) * uploadHeight;

  const minX = allowPartial ? -watermarkWidth : 0;
  const minY = allowPartial ? -watermarkHeight : 0;
  const maxX = allowPartial ? uploadWidth : uploadWidth - watermarkWidth;
  const maxY = allowPartial ? uploadHeight : uploadHeight - watermarkHeight;

  const positions = [];
  let attempts = 0;
  const maxAttempts = count * 50;

  while (positions.length < count && attempts < maxAttempts) {
    attempts++;

    const baseX = minX + Math.random() * (maxX - minX);
    const baseY = minY + Math.random() * (maxY - minY);

    const x = baseX + translateX;
    const y = baseY + translateY;

    const maintainsSpacing = positions.every((pos) => {
      const distance = Math.sqrt(
        Math.pow(pos.x - x, 2) + Math.pow(pos.y - y, 2)
      );
      return distance >= watermarkWidth + minSpacingDistance;
    });

    if (maintainsSpacing) {
      positions.push({ x, y });
    }
  }

  return positions;
}

async function createBitmapCompat(imageData) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(imageData);
    } catch (error) {
      console.warn("Failed to create native bitmap:", error);
    }
  }

  return Promise.resolve({
    width: imageData.width,
    height: imageData.height,
    _imageData: imageData,
    close: function () {
      this._imageData = null;
    },
  });
}

async function createOffscreenCanvasCompat(width, height) {
  if (typeof OffscreenCanvas === "function") {
    try {
      return new OffscreenCanvas(width, height);
    } catch (error) {
      console.warn("Failed to create native offscreen canvas:", error);
    }
  }

  return {
    width,
    height,
    getContext() {
      return {
        globalAlpha: 1,
        _imageData: new ImageData(width, height),
        drawImage(bitmap) {
          const newData =
            this.globalAlpha !== 1
              ? new Uint8ClampedArray(bitmap._imageData.data).map((v, i) =>
                  (i + 1) % 4 ? v : v * this.globalAlpha
                )
              : bitmap._imageData.data;

          this._imageData = new ImageData(newData, bitmap.width, bitmap.height);
        },
        getImageData() {
          return this._imageData;
        },
      };
    },
  };
}

const MASK_FEATHER = 1.5;
const MASK_HEX_COS60 = Math.cos(Math.PI / 3);
const MASK_HEX_SIN60 = Math.sin(Math.PI / 3);

function maskRegion(region, shape) {
  if (shape !== "circle" && shape !== "rounded" && shape !== "hexagon") {
    return;
  }

  const imageData = region.get_image_data();
  const { width, height, data } = imageData;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const radius = Math.min(halfWidth, halfHeight);
  const corner = Math.min(width, height) * 0.12;
  const apothem = radius * MASK_HEX_SIN60;

  const distance = (dx, dy) => {
    if (shape === "circle") {
      return Math.sqrt(dx * dx + dy * dy) - radius;
    }

    if (shape === "hexagon") {
      return (
        Math.max(
          Math.abs(dx),
          Math.abs(dx * MASK_HEX_COS60 + dy * MASK_HEX_SIN60),
          Math.abs(dx * MASK_HEX_COS60 - dy * MASK_HEX_SIN60)
        ) - apothem
      );
    }

    const ox = Math.abs(dx) - (halfWidth - corner);
    const oy = Math.abs(dy) - (halfHeight - corner);
    const outside = Math.sqrt(Math.max(ox, 0) ** 2 + Math.max(oy, 0) ** 2);

    return outside + Math.min(Math.max(ox, oy), 0) - corner;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const d = distance(x + 0.5 - halfWidth, y + 0.5 - halfHeight);
      const coverage = Math.min(Math.max(0.5 - d / MASK_FEATHER, 0), 1);

      if (coverage < 1) {
        const i = (y * width + x) * 4 + 3;
        data[i] = Math.round(data[i] * coverage);
      }
    }
  }

  region.set_imgdata(imageData);
}

function hexToRgb(hex) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex ?? "");

  if (!match) {
    return null;
  }

  return new Rgb(
    parseInt(match[1], 16),
    parseInt(match[2], 16),
    parseInt(match[3], 16)
  );
}

async function applyWatermark(event) {
  const { seq, params } = event.data;
  const { upload: uploadParams, watermark: watermarkParams } = params;

  let uploadImage;

  try {
    uploadImage = PhotonImage.new_from_byteslice(
      new Uint8Array(uploadParams.buffer)
    );
  } catch (error) {
    console.warn("Unsupported format.", error);

    postMessage({
      incomingSeq: seq,
      error: error.toString(),
    });

    return;
  }

  const uploadWidth = uploadImage.get_width();
  const uploadHeight = uploadImage.get_height();

  if (
    watermarkParams.skip_small_images &&
    watermarkParams.min_image_dimensions
  ) {
    const [minWidth, minHeight] = watermarkParams.min_image_dimensions
      .split("x")
      .map(Number);

    if (uploadWidth < minWidth || (minHeight && uploadHeight < minHeight)) {
      postMessage({
        incomingSeq: seq,
        data: null,
        reason: "dimensions_too_small",
      });

      return;
    }
  }

  let watermarkImage;
  let watermarkWidth;
  let watermarkHeight;
  let qrModules = null;

  try {
    if (watermarkParams.qrcode_enabled) {
      await loadQrCode();

      const budget = targetSize(
        uploadWidth,
        uploadHeight,
        { width: NOMINAL_QR_SIZE, height: NOMINAL_QR_SIZE },
        watermarkParams
      ).width;

      watermarkParams.qrcode_size_slack =
        uploadWidth * SIZE_SLACK * QR_SUPERSAMPLE;

      const qrBytes = await renderQrCode(
        watermarkParams,
        budget * QR_SUPERSAMPLE
      );

      watermarkImage = PhotonImage.new_from_byteslice(qrBytes);
      qrModules = lastQrModules;

      if (QR_SUPERSAMPLE > 1) {
        watermarkImage = resize(
          watermarkImage,
          Math.round(watermarkImage.get_width() / QR_SUPERSAMPLE),
          Math.round(watermarkImage.get_height() / QR_SUPERSAMPLE),
          SamplingFilter.Lanczos3
        );
      }
    } else {
      watermarkImage = PhotonImage.new_from_byteslice(
        new Uint8Array(watermarkParams.buffer)
      );

      const target = targetSize(
        uploadWidth,
        uploadHeight,
        {
          width: watermarkImage.get_width(),
          height: watermarkImage.get_height(),
        },
        watermarkParams
      );

      if (
        target.width !== watermarkImage.get_width() ||
        target.height !== watermarkImage.get_height()
      ) {
        watermarkImage = resize(
          watermarkImage,
          target.width,
          target.height,
          SamplingFilter.Lanczos3
        );
      }
    }
  } catch (error) {
    console.warn("Could not build the watermark.", error);

    postMessage({
      incomingSeq: seq,
      error: error.toString(),
    });

    return;
  }

  watermarkWidth = watermarkImage.get_width();
  watermarkHeight = watermarkImage.get_height();

  let defaultPosition = getCoordinates(
    uploadWidth,
    uploadHeight,
    watermarkWidth,
    watermarkHeight,
    watermarkParams
  );

  let positions;
  switch (watermarkParams.pattern) {
    case "grid":
      positions = generateGridPattern(
        uploadWidth,
        uploadHeight,
        watermarkWidth,
        watermarkHeight,
        watermarkParams
      );
      break;
    case "diagonal":
      positions = generateDiagonalPattern(
        uploadWidth,
        uploadHeight,
        watermarkWidth,
        watermarkHeight,
        watermarkParams
      );
      break;
    case "random":
      positions = generateRandomPattern(
        uploadWidth,
        uploadHeight,
        watermarkWidth,
        watermarkHeight,
        watermarkParams
      );
      break;
    default:
      positions = [defaultPosition];
  }

  if (watermarkParams.rotate !== 0) {
    watermarkImage = rotate(watermarkImage, watermarkParams.rotate);

    positions = positions.map((position) => {
      const centerX = position.x + watermarkWidth / 2;
      const centerY = position.y + watermarkHeight / 2;
      return {
        x: centerX - watermarkImage.get_width() / 2,
        y: centerY - watermarkImage.get_height() / 2,
      };
    });
  }

  if (watermarkParams.opacity !== 1) {
    const bitmap = await createBitmapCompat(watermarkImage.get_image_data());
    const canvas = await createOffscreenCanvasCompat(
      bitmap.width,
      bitmap.height
    );
    const context = canvas.getContext("2d");

    context.globalAlpha = watermarkParams.opacity;
    context.drawImage(bitmap, 0, 0);

    watermarkImage.set_imgdata(get_image_data(canvas, context));
    bitmap.close();
  }

  if (
    watermarkParams.qrcode_enabled &&
    watermarkParams.qrcode_backdrop === "blur"
  ) {
    const w = watermarkImage.get_width();
    const h = watermarkImage.get_height();
    const radius = Math.max(2, Math.round(Math.min(w, h) / 18));

    for (const position of positions) {
      const x1 = Math.max(0, Math.round(position.x));
      const y1 = Math.max(0, Math.round(position.y));
      const x2 = Math.min(uploadWidth, x1 + w);
      const y2 = Math.min(uploadHeight, y1 + h);

      if (x2 <= x1 || y2 <= y1) {
        continue;
      }

      const region = crop(uploadImage, x1, y1, x2, y2);
      gaussian_blur(region, radius);

      const strength = watermarkParams.qrcode_backdrop_strength ?? 0;

      if (strength > 0) {
        const rgb = hexToRgb(watermarkParams.qrcode_backdrop_color);

        if (rgb) {
          mix_with_colour(region, rgb, strength);
        }
      }

      maskRegion(region, watermarkParams.qrcode_backdrop_shape);
      watermark(uploadImage, region, BigInt(x1), BigInt(y1));
      region.free();
    }
  }

  if (watermarkParams.blend_mode !== "normal") {
    let transparentImage = createTransparentImage(uploadWidth, uploadHeight);

    for (const position of positions) {
      watermark(
        transparentImage,
        watermarkImage,
        BigInt(Math.round(position.x)),
        BigInt(Math.round(position.y))
      );
    }

    blend(uploadImage, transparentImage, watermarkParams.blend_mode);
    transparentImage.free();
  } else {
    for (const position of positions) {
      watermark(
        uploadImage,
        watermarkImage,
        BigInt(Math.round(position.x)),
        BigInt(Math.round(position.y))
      );
    }
  }

  const result = uploadImage.get_image_data();
  const meta = {
    uploadWidth,
    uploadHeight,
    watermarkWidth: watermarkImage.get_width(),
    watermarkHeight: watermarkImage.get_height(),
    tiles: positions.length,
    modules: qrModules,
  };

  uploadImage.free();
  watermarkImage.free();

  postMessage({ incomingSeq: seq, data: result, meta });
}
