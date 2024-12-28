/* eslint-disable no-undef */
/* eslint-disable no-console */

let promisePhoton;

async function handleMessage(event) {
  const action = event.data.action;

  if (action === "load") {
    const { photonUrl, photonWasmUrl } = event.data;
    importScripts(photonUrl);
    promisePhoton = __wbg_init({ module_or_path: photonWasmUrl });
  } else if (action === "apply") {
    await promisePhoton;
    applyWatermark(event);
  }
}

onmessage = handleMessage;

function getCoordinates(
  uploadWith,
  uploadHeight,
  watermarkWidth,
  watermarkheight,
  settings
) {
  const margin_x = settings.margin_x * uploadWith;
  const margin_y = settings.margin_y * uploadWith;
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

  return positions[position];
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

  // Calculate minimum spacing between watermarks based on image size
  const minSpacingDistance =
    (spacing / 100) * Math.min(uploadWidth, uploadHeight);

  // Get translation offsets from margins (as percentage of image dimensions)
  const translateX = (settings.margin_x || 0) * uploadWidth;
  const translateY = (settings.margin_y || 0) * uploadHeight;

  // Calculate boundaries considering allowPartial
  const minX = allowPartial ? -watermarkWidth : 0;
  const minY = allowPartial ? -watermarkHeight : 0;
  const maxX = allowPartial ? uploadWidth : uploadWidth - watermarkWidth;
  const maxY = allowPartial ? uploadHeight : uploadHeight - watermarkHeight;

  const positions = [];
  let attempts = 0;
  const maxAttempts = count * 50; // Prevent infinite loops

  while (positions.length < count && attempts < maxAttempts) {
    attempts++;

    // Generate random position within boundaries
    const baseX = minX + Math.random() * (maxX - minX);
    const baseY = minY + Math.random() * (maxY - minY);

    // Apply translation
    const x = baseX + translateX;
    const y = baseY + translateY;

    // Check if this position maintains minimum spacing from all existing watermarks
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

async function applyWatermark(event) {
  const { seq, params } = event.data;
  const { upload: uploadParams, watermark: watermarkParams } = params;

  let uploadImage;
  let watermarkImage;

  try {
    uploadImage = PhotonImage.new_from_byteslice(
      new Uint8Array(uploadParams.buffer)
    );
    watermarkImage = PhotonImage.new_from_byteslice(
      new Uint8Array(watermarkParams.buffer)
    );
  } catch (error) {
    console.warn("Unsupported format.", error);

    postMessage({
      incomingSeq: seq,
      uploadImageData: null,
    });

    return;
  }

  const uploadWidth = uploadImage.get_width();
  const uploadHeight = uploadImage.get_height();

  let watermarkWidth = watermarkImage.get_width();
  let watermarkHeight = watermarkImage.get_height();

  if (watermarkParams.scale !== 1) {
    const baseline = watermarkParams.scale * (uploadWidth / 1000);

    watermarkWidth = Math.round(watermarkWidth * baseline);
    watermarkHeight = Math.round(watermarkHeight * baseline);

    watermarkImage = resize(
      watermarkImage,
      watermarkWidth,
      watermarkHeight,
      SamplingFilter.CatmullRom
    );
  }

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

  uploadImage.free();
  watermarkImage.free();

  postMessage({
    incomingSeq: seq,
    uploadImageData: result,
    uploadDimensions: { width: uploadWidth, height: uploadHeight },
  });
}
