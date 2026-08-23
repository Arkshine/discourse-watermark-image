/* eslint-disable no-bitwise */

function solidColor(value, fallback) {
  return typeof value === "string" ? value : (value?.stops?.[0] ?? fallback);
}

// Halftone - ported from zhengkyl/qrframe (Halftone.js, MIT)
function ditherImage(ctx, canvasSize, imgOffset, imgSize, fg, bg) {
  const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
  const data = imageData.data;

  for (let y = imgOffset; y < imgOffset + imgSize; y++) {
    for (let x = imgOffset; x < imgOffset + imgSize; x++) {
      const i = (y * canvasSize + x) * 4;

      if (data[i + 3] === 0) {
        continue;
      }

      const oldPixel =
        (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;

      let newPixel;
      if (oldPixel < 128) {
        newPixel = 0;
        ctx.fillStyle = fg;
      } else {
        newPixel = 255;
        ctx.fillStyle = bg;
      }

      ctx.fillRect(x, y, 1, 1);

      data[i] = data[i + 1] = data[i + 2] = newPixel;
      const error = oldPixel - newPixel;

      if (x < canvasSize - 1) {
        data[i + 4] += (error * 7) / 16;
      }
      if (y < canvasSize - 1) {
        if (x > 0) {
          data[i + canvasSize * 4 - 4] += (error * 3) / 16;
        }
        data[i + canvasSize * 4] += (error * 5) / 16;
        if (x < canvasSize - 1) {
          data[i + canvasSize * 4 + 4] += (error * 1) / 16;
        }
      }
    }
  }
}

function clipToFrame(ctx, size, clipPath, canvasSize, margin) {
  if (!clipPath) {
    return;
  }

  const scale = size / canvasSize;
  const marginPx = margin * scale;

  ctx.setTransform(scale, 0, 0, scale, marginPx, marginPx);
  ctx.beginPath();
  ctx.clip(new Path2D(clipPath));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

async function halftoneBackdrop(
  png,
  params,
  imageUrl,
  clipPath,
  canvasSize,
  frameMargin
) {
  const code = await createImageBitmap(new Blob([png], { type: "image/png" }));
  const size = code.width;

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const fg = solidColor(params.foreground, "#000000");
  const bg = solidColor(params.background, "#ffffff");

  clipToFrame(ctx, size, clipPath, canvasSize, frameMargin);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const image = imageUrl
    ? await fetch(imageUrl)
        .then((res) => res.blob())
        .then((blob) => createImageBitmap(blob))
    : null;

  if (image) {
    const cellPixels = Math.max(
      1,
      Math.round(size / (canvasSize * params.halftoneCells))
    );
    const grid = Math.ceil(size / cellPixels);

    const cells = new OffscreenCanvas(grid, grid);
    const cellCtx = cells.getContext("2d");

    cellCtx.fillStyle = bg;
    cellCtx.fillRect(0, 0, grid, grid);

    cellCtx.filter = `brightness(${params.halftoneBrightness}) contrast(${params.halftoneContrast})`;
    const imgSize = Math.floor(params.halftoneScale * grid);
    const offset = Math.floor((grid - imgSize) / 2);
    cellCtx.drawImage(image, offset, offset, imgSize, imgSize);
    cellCtx.filter = "none";

    ditherImage(cellCtx, grid, offset, imgSize, fg, bg);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cells, 0, 0, grid * cellPixels, grid * cellPixels);
    ctx.imageSmoothingEnabled = true;
  }

  ctx.drawImage(code, 0, 0);

  const blob = await canvas.convertToBlob({ type: "image/png" });
  return new Uint8Array(await blob.arrayBuffer());
}

export { clipToFrame, halftoneBackdrop, solidColor };
