/* ============================================================
 * BLOG_OS — 零依赖 GIF89a/87a 解码器（供 WebGL 纹理动画使用）
 * 纯函数、无 DOM 依赖：浏览器与 Node 均可导入。
 * 输出逐帧合成的 RGBA 位图 + 每帧延迟 + 平均亮度。
 * ============================================================ */

/**
 * 解码 GIF 字节。
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ width:number, height:number,
 *            frames:Array<{data:Uint8ClampedArray, width:number, height:number,
 *                          delay:number, brightness:number}> }}
 *   data 为 width*height*4 的 RGBA（透明通道 0 表示完全透明）。
 */
export function decodeGIF(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    throw new Error(`GIF_DECODE // 非法文件头: ${signature}`);
  }

  let p = 6;
  const width = bytes[p] | (bytes[p + 1] << 8); p += 2;
  const height = bytes[p] | (bytes[p + 1] << 8); p += 2;
  if (!width || !height || width > 4096 || height > 4096) {
    throw new Error(`GIF_DECODE // 异常尺寸 ${width}x${height}`);
  }

  const packed = bytes[p++];
  const hasGCT = (packed >> 7) & 1;
  const gctSize = 1 << ((packed & 0x07) + 1);
  p += 2; // 背景色索引 + 宽高比，暂不使用

  let gct = null;
  if (hasGCT) {
    gct = bytes.subarray(p, p + gctSize * 3);
    p += gctSize * 3;
  }

  const rawFrames = [];
  let gce = { delay: 100, disposal: 0, transparentIndex: null };

  while (p < bytes.length) {
    const blockType = bytes[p++];
    if (blockType === 0x3B) break; // 尾部
    if (blockType === 0x21) {
      const label = bytes[p++];
      const blockSize = bytes[p++];
      const block = bytes.subarray(p, p + blockSize);
      p += blockSize;
      let subSize = bytes[p++];
      while (subSize) { p += subSize; subSize = bytes[p++]; }
      if (label === 0xF9) { // 图形控制扩展
        gce = {
          delay: (block[1] | (block[2] << 8)) * 10,
          disposal: (block[0] & 0x1C) >> 2,
          transparentIndex: (block[0] & 1) ? block[3] : null,
        };
      }
      continue;
    }
    if (blockType !== 0x2C) {
      throw new Error(`GIF_DECODE // 未知块类型 0x${blockType.toString(16)}`);
    }

    const left = bytes[p] | (bytes[p + 1] << 8); p += 2;
    const top = bytes[p] | (bytes[p + 1] << 8); p += 2;
    const fw = bytes[p] | (bytes[p + 1] << 8); p += 2;
    const fh = bytes[p] | (bytes[p + 1] << 8); p += 2;
    const fPacked = bytes[p++];
    const hasLCT = (fPacked >> 7) & 1;
    const lctSize = 1 << ((fPacked & 0x07) + 1);
    let lct = null;
    if (hasLCT) {
      lct = bytes.subarray(p, p + lctSize * 3);
      p += lctSize * 3;
    }
    const minCodeSize = bytes[p++];
    const data = [];
    let subSize = bytes[p++];
    while (subSize) {
      for (let i = 0; i < subSize; i++) data.push(bytes[p + i]);
      p += subSize;
      subSize = bytes[p++];
    }

    const indices = lzwDecode(minCodeSize, new Uint8Array(data), fw * fh);
    rawFrames.push({ left, top, width: fw, height: fh, indices, ...gce });
  }

  if (!rawFrames.length) throw new Error('GIF_DECODE // 没有可用的帧');

  const palette = gct || new Uint8Array(0);
  return {
    width,
    height,
    frames: composeFrames(rawFrames, width, height, palette),
  };
}

/* ---------- LZW 解码 ---------- */

function lzwDecode(minCodeSize, data, expected) {
  if (minCodeSize < 2 || minCodeSize > 8) {
    throw new Error(`GIF_LZW // 非法最小码长 ${minCodeSize}`);
  }
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let table = [];
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  const reset = () => {
    table = [];
    for (let i = 0; i < clearCode; i++) table.push(Uint8Array.of(i));
    codeSize = minCodeSize + 1;
    nextCode = endCode + 1;
  };
  reset();

  const out = [];
  let prev = null;
  let bitPos = 0;

  const readCode = () => {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      const bit = (data[(bitPos + i) >> 3] >> ((bitPos + i) & 7)) & 1;
      code |= bit << i;
    }
    bitPos += codeSize;
    return code;
  };

  while (out.length < expected && bitPos + codeSize <= data.length * 8) {
    const code = readCode();
    if (code === clearCode) { reset(); prev = null; continue; }
    if (code === endCode) break;

    let entry;
    if (code < table.length) {
      entry = table[code];
    } else if (code === nextCode && prev !== null) {
      entry = new Uint8Array(prev.length + 1);
      entry.set(prev);
      entry[prev.length] = prev[0];
    } else {
      throw new Error(`GIF_LZW // 坏码 ${code}（字典 ${table.length} / 下一个 ${nextCode}）`);
    }

    for (let i = 0; i < entry.length; i++) out.push(entry[i]);

    if (prev !== null && nextCode < 4096) {
      const added = new Uint8Array(prev.length + 1);
      added.set(prev);
      added[prev.length] = entry[0];
      table[nextCode] = added;
      nextCode++;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = entry;
  }

  return out;
}

/* ---------- 帧合成 ---------- */

function composeFrames(rawFrames, width, height, palette) {
  const canvas = new Uint8ClampedArray(width * height * 4); // 初始全透明
  const frames = [];
  let prevDisposal = 0;
  let prevRect = { left: 0, top: 0, width: 0, height: 0 };

  for (const f of rawFrames) {
    if (prevDisposal === 2 || prevDisposal === 3) {
      clearRect(canvas, width, height, prevRect);
    }
    compositeFrame(canvas, width, height, f, palette);

    const data = new Uint8ClampedArray(canvas);
    frames.push({
      data,
      width,
      height,
      delay: Math.max(10, f.delay),
      brightness: measureBrightness(data),
    });

    prevDisposal = f.disposal;
    prevRect = { left: f.left, top: f.top, width: f.width, height: f.height };
  }
  return frames;
}

function clearRect(canvas, width, height, rect) {
  for (let y = rect.top; y < Math.min(height, rect.top + rect.height); y++) {
    for (let x = rect.left; x < Math.min(width, rect.left + rect.width); x++) {
      const o = (y * width + x) * 4;
      canvas[o] = canvas[o + 1] = canvas[o + 2] = canvas[o + 3] = 0;
    }
  }
}

function compositeFrame(canvas, width, height, f, palette) {
  const fw = f.width;
  const fh = f.height;
  const transparent = f.transparentIndex;
  for (let y = 0; y < fh; y++) {
    const canvasY = f.top + y;
    if (canvasY < 0 || canvasY >= height) continue;
    for (let x = 0; x < fw; x++) {
      const canvasX = f.left + x;
      if (canvasX < 0 || canvasX >= width) continue;
      const idx = f.indices[y * fw + x];
      if (transparent !== null && idx === transparent) continue;
      const ci = idx * 3;
      if (ci + 2 >= palette.length) continue;
      const o = (canvasY * width + canvasX) * 4;
      canvas[o] = palette[ci];
      canvas[o + 1] = palette[ci + 1];
      canvas[o + 2] = palette[ci + 2];
      canvas[o + 3] = 255;
    }
  }
}

/** 平均亮度（0~1），用于火焰光效的明暗闪烁。 */
function measureBrightness(data) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    sum += (data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722) / 255;
    count++;
  }
  return count ? sum / count : 0;
}
