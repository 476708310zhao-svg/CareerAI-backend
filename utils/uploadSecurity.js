const fs = require('fs');

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

const MAGIC_BYTES = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]]
};

function imageExtForMime(mime) {
  return MIME_TO_EXT[mime] || '.jpg';
}

function isAllowedImageMime(mime) {
  return ALLOWED_IMAGE_MIME.has(mime);
}

function checkImageMagicBytes(filePath, mime) {
  try {
    const buf = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);

    if (mime === 'image/webp') {
      const riff = [0x52, 0x49, 0x46, 0x46];
      const webp = [0x57, 0x45, 0x42, 0x50];
      return riff.every((b, i) => buf[i] === b) && webp.every((b, i) => buf[8 + i] === b);
    }

    const patterns = MAGIC_BYTES[mime];
    if (!patterns) return false;
    return patterns.some(magic => magic.every((byte, i) => buf[i] === byte));
  } catch (e) {
    return false;
  }
}

function rejectInvalidImage(file, onInvalid) {
  if (!file) return false;
  if (checkImageMagicBytes(file.path, file.mimetype)) return false;
  fs.unlink(file.path, () => {});
  if (onInvalid) onInvalid();
  return true;
}

module.exports = {
  ALLOWED_IMAGE_MIME,
  imageExtForMime,
  isAllowedImageMime,
  checkImageMagicBytes,
  rejectInvalidImage
};
