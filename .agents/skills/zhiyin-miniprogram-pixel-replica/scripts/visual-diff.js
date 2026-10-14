'use strict';

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, png) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCrop(source, crop, targetWidth, targetHeight) {
  const region = crop || { x: 0, y: 0, width: source.width, height: source.height };
  const x0 = clamp(Math.round(region.x), 0, source.width - 1);
  const y0 = clamp(Math.round(region.y), 0, source.height - 1);
  const sourceWidth = clamp(Math.round(region.width), 1, source.width - x0);
  const sourceHeight = clamp(Math.round(region.height), 1, source.height - y0);
  const output = new PNG({ width: targetWidth, height: targetHeight });

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = y0 + ((y + 0.5) * sourceHeight / targetHeight) - 0.5;
    const yA = clamp(Math.floor(sourceY), y0, y0 + sourceHeight - 1);
    const yB = clamp(yA + 1, y0, y0 + sourceHeight - 1);
    const yWeight = sourceY - Math.floor(sourceY);
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = x0 + ((x + 0.5) * sourceWidth / targetWidth) - 0.5;
      const xA = clamp(Math.floor(sourceX), x0, x0 + sourceWidth - 1);
      const xB = clamp(xA + 1, x0, x0 + sourceWidth - 1);
      const xWeight = sourceX - Math.floor(sourceX);
      const targetIndex = (y * targetWidth + x) * 4;
      const indexes = [
        (yA * source.width + xA) * 4,
        (yA * source.width + xB) * 4,
        (yB * source.width + xA) * 4,
        (yB * source.width + xB) * 4
      ];
      for (let channel = 0; channel < 4; channel += 1) {
        const top = source.data[indexes[0] + channel] * (1 - xWeight) + source.data[indexes[1] + channel] * xWeight;
        const bottom = source.data[indexes[2] + channel] * (1 - xWeight) + source.data[indexes[3] + channel] * xWeight;
        output.data[targetIndex + channel] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }
  return output;
}

function applyMasks(images, masks) {
  for (const mask of masks || []) {
    const left = clamp(Math.round(mask.x), 0, images[0].width);
    const top = clamp(Math.round(mask.y), 0, images[0].height);
    const right = clamp(left + Math.round(mask.width), 0, images[0].width);
    const bottom = clamp(top + Math.round(mask.height), 0, images[0].height);
    for (const image of images) {
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const index = (y * image.width + x) * 4;
          image.data[index] = 255;
          image.data[index + 1] = 255;
          image.data[index + 2] = 255;
          image.data[index + 3] = 255;
        }
      }
    }
  }
}

function createOverlay(baseline, actual) {
  const overlay = new PNG({ width: baseline.width, height: baseline.height });
  for (let index = 0; index < overlay.data.length; index += 4) {
    overlay.data[index] = Math.round((baseline.data[index] + actual.data[index]) / 2);
    overlay.data[index + 1] = Math.round((baseline.data[index + 1] + actual.data[index + 1]) / 2);
    overlay.data[index + 2] = Math.round((baseline.data[index + 2] + actual.data[index + 2]) / 2);
    overlay.data[index + 3] = 255;
  }
  return overlay;
}

function estimateGlobalShift(baseline, actual, maxSearch = 6) {
  let best = { x: 0, y: 0, score: Number.POSITIVE_INFINITY };
  const step = 4;
  const top = 56;
  const bottom = baseline.height - 18;
  for (let shiftY = -maxSearch; shiftY <= maxSearch; shiftY += 1) {
    for (let shiftX = -maxSearch; shiftX <= maxSearch; shiftX += 1) {
      let score = 0;
      let samples = 0;
      for (let y = top + maxSearch; y < bottom - maxSearch; y += step) {
        for (let x = maxSearch; x < baseline.width - maxSearch; x += step) {
          const actualX = x + shiftX;
          const actualY = y + shiftY;
          const baselineIndex = (y * baseline.width + x) * 4;
          const actualIndex = (actualY * actual.width + actualX) * 4;
          score += Math.abs(baseline.data[baselineIndex] - actual.data[actualIndex]);
          score += Math.abs(baseline.data[baselineIndex + 1] - actual.data[actualIndex + 1]);
          score += Math.abs(baseline.data[baselineIndex + 2] - actual.data[actualIndex + 2]);
          samples += 3;
        }
      }
      const average = samples ? score / samples : Number.POSITIVE_INFINITY;
      if (average < best.score) best = { x: shiftX, y: shiftY, score: Number(average.toFixed(3)) };
    }
  }
  return best;
}

function compareImages(options) {
  const viewport = options.viewport || { width: 390, height: 844 };
  const baseline = normalizeCrop(readPng(options.baselinePath), options.baselineCrop, viewport.width, viewport.height);
  const actual = normalizeCrop(readPng(options.actualPath), options.actualCrop, viewport.width, viewport.height);
  applyMasks([baseline, actual], options.masks || []);

  const diff = new PNG({ width: viewport.width, height: viewport.height });
  const diffPixels = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    viewport.width,
    viewport.height,
    { threshold: options.pixelThreshold == null ? 0.1 : options.pixelThreshold, includeAA: false }
  );
  const diffRatio = diffPixels / (viewport.width * viewport.height);
  const shift = estimateGlobalShift(baseline, actual);
  const maxDiffRatio = options.maxDiffRatio == null ? 0.06 : options.maxDiffRatio;
  const maxGlobalShiftPx = options.maxGlobalShiftPx == null ? 2 : options.maxGlobalShiftPx;
  const report = {
    viewport,
    diffPixels,
    diffRatio: Number(diffRatio.toFixed(6)),
    maxDiffRatio,
    estimatedGlobalShift: shift,
    maxGlobalShiftPx,
    pixelPass: diffRatio <= maxDiffRatio,
    geometryPass: Math.abs(shift.x) <= maxGlobalShiftPx && Math.abs(shift.y) <= maxGlobalShiftPx
  };
  report.pass = report.pixelPass && report.geometryPass;

  writePng(path.join(options.outputDir, 'baseline-normalized.png'), baseline);
  writePng(path.join(options.outputDir, 'actual-normalized.png'), actual);
  writePng(path.join(options.outputDir, 'overlay.png'), createOverlay(baseline, actual));
  writePng(path.join(options.outputDir, 'diff.png'), diff);
  fs.writeFileSync(path.join(options.outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

module.exports = { compareImages, normalizeCrop, readPng, writePng };

if (require.main === module) {
  const args = {};
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (!value.startsWith('--')) continue;
    args[value.slice(2)] = process.argv[index + 1];
    index += 1;
  }
  if (!args.baseline || !args.actual || !args.output) {
    console.error('Usage: node visual-diff.js --baseline <png> --actual <png> --output <dir>');
    process.exit(1);
  }
  const report = compareImages({
    baselinePath: path.resolve(args.baseline),
    actualPath: path.resolve(args.actual),
    outputDir: path.resolve(args.output),
    viewport: { width: Number(args.width) || 390, height: Number(args.height) || 844 }
  });
  console.log(JSON.stringify(report));
  process.exitCode = report.pass ? 0 : 2;
}
