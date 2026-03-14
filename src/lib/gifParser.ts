export interface GifFrame {
  imageData: ImageData;
  delay: number; // in milliseconds
  disposalMethod: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ParsedGif {
  width: number;
  height: number;
  frames: GifFrame[];
}

export function parseGif(buffer: ArrayBuffer): ParsedGif {
  const bytes = new Uint8Array(buffer);
  let pos = 0;

  function readByte(): number {
    return bytes[pos++];
  }

  function readUint16(): number {
    const val = bytes[pos] | (bytes[pos + 1] << 8);
    pos += 2;
    return val;
  }

  function readBytes(n: number): Uint8Array {
    const slice = bytes.slice(pos, pos + n);
    pos += n;
    return slice;
  }

  // --- Header ---
  const sigBytes = readBytes(6);
  let signature = "";
  for (let i = 0; i < sigBytes.length; i++) {
    signature += String.fromCharCode(sigBytes[i]);
  }
  if (signature !== "GIF87a" && signature !== "GIF89a") {
    throw new Error("Not a valid GIF file: " + signature);
  }

  // --- Logical Screen Descriptor ---
  const screenWidth = readUint16();
  const screenHeight = readUint16();
  const packed = readByte();
  const globalColorTableFlag = (packed >> 7) & 1;
  const globalColorTableSize = 2 << (packed & 0x07);
  const _bgColorIndex = readByte();
  const _pixelAspectRatio = readByte();

  // --- Global Color Table ---
  let globalColorTable: Uint8Array | null = null;
  if (globalColorTableFlag) {
    globalColorTable = readBytes(3 * globalColorTableSize);
  }

  // --- Parse blocks ---
  const frames: GifFrame[] = [];

  // State carried between blocks via Graphic Control Extension
  let delayTime = 0;
  let disposalMethod = 0;
  let transparentColorIndex = -1;
  let hasTransparency = false;

  // We use an offscreen canvas to composite frames properly
  const canvas = document.createElement("canvas");
  canvas.width = screenWidth;
  canvas.height = screenHeight;
  const ctx = canvas.getContext("2d")!;

  // A second canvas to hold the "previous" state for disposal method 3
  const restoreCanvas = document.createElement("canvas");
  restoreCanvas.width = screenWidth;
  restoreCanvas.height = screenHeight;
  const restoreCtx = restoreCanvas.getContext("2d")!;

  let firstFrame = true;

  while (pos < bytes.length) {
    const introducer = readByte();

    if (introducer === 0x3b) {
      // Trailer - end of GIF
      break;
    }

    if (introducer === 0x21) {
      // Extension block
      const label = readByte();

      if (label === 0xf9) {
        // Graphic Control Extension
        const blockSize = readByte(); // always 4
        const gcPacked = readByte();
        disposalMethod = (gcPacked >> 2) & 0x07;
        hasTransparency = (gcPacked & 0x01) === 1;
        delayTime = readUint16() * 10; // convert centiseconds to ms
        transparentColorIndex = readByte();
        if (!hasTransparency) {
          transparentColorIndex = -1;
        }
        readByte(); // block terminator (0x00)
        void blockSize;
      } else {
        // Skip other extensions (comment, application, plain text, etc.)
        skipSubBlocks();
      }
    } else if (introducer === 0x2c) {
      // Image Descriptor
      const frameLeft = readUint16();
      const frameTop = readUint16();
      const frameWidth = readUint16();
      const frameHeight = readUint16();
      const imgPacked = readByte();
      const localColorTableFlag = (imgPacked >> 7) & 1;
      const interlaceFlag = (imgPacked >> 6) & 1;
      const localColorTableSize = localColorTableFlag
        ? 2 << (imgPacked & 0x07)
        : 0;

      let localColorTable: Uint8Array | null = null;
      if (localColorTableFlag) {
        localColorTable = readBytes(3 * localColorTableSize);
      }

      const colorTable = localColorTable || globalColorTable;
      if (!colorTable) {
        throw new Error("No color table available for frame");
      }

      // --- Read image data sub-blocks ---
      const lzwMinCodeSize = readByte();
      const compressedData = readSubBlocks();

      // --- LZW Decompress ---
      const pixels = lzwDecode(lzwMinCodeSize, compressedData, frameWidth * frameHeight);

      // --- De-interlace if needed ---
      const deinterlaced = interlaceFlag
        ? deinterlace(pixels, frameWidth, frameHeight)
        : pixels;

      // --- Handle disposal before drawing this frame ---
      // Disposal is applied BEFORE drawing the next frame, but we need to
      // snapshot for disposal method 3 BEFORE drawing.
      if (disposalMethod === 3) {
        // Save current canvas state before drawing
        restoreCtx.clearRect(0, 0, screenWidth, screenHeight);
        restoreCtx.drawImage(canvas, 0, 0);
      }

      // --- Build RGBA pixel data for this frame ---
      const frameImageData = new ImageData(frameWidth, frameHeight);
      const framePixels = frameImageData.data;

      for (let i = 0; i < deinterlaced.length; i++) {
        const colorIndex = deinterlaced[i];
        const outIdx = i * 4;

        if (hasTransparency && colorIndex === transparentColorIndex) {
          framePixels[outIdx] = 0;
          framePixels[outIdx + 1] = 0;
          framePixels[outIdx + 2] = 0;
          framePixels[outIdx + 3] = 0;
        } else {
          const tableIdx = colorIndex * 3;
          framePixels[outIdx] = colorTable[tableIdx];
          framePixels[outIdx + 1] = colorTable[tableIdx + 1];
          framePixels[outIdx + 2] = colorTable[tableIdx + 2];
          framePixels[outIdx + 3] = 255;
        }
      }

      // --- Composite onto the full canvas ---
      // Create a temp canvas for this frame's image data
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = frameWidth;
      tmpCanvas.height = frameHeight;
      const tmpCtx = tmpCanvas.getContext("2d")!;
      tmpCtx.putImageData(frameImageData, 0, 0);

      // Draw frame onto main canvas
      ctx.drawImage(tmpCanvas, frameLeft, frameTop);

      // --- Capture the composited full frame ---
      const composited = ctx.getImageData(0, 0, screenWidth, screenHeight);

      frames.push({
        imageData: composited,
        delay: delayTime || 100, // default 100ms if 0
        disposalMethod,
        left: frameLeft,
        top: frameTop,
        width: frameWidth,
        height: frameHeight,
      });

      // --- Apply disposal method for NEXT frame ---
      if (disposalMethod === 2) {
        // Restore to background: clear the frame area
        ctx.clearRect(frameLeft, frameTop, frameWidth, frameHeight);
      } else if (disposalMethod === 3) {
        // Restore to previous
        ctx.clearRect(0, 0, screenWidth, screenHeight);
        ctx.drawImage(restoreCanvas, 0, 0);
      }
      // disposalMethod 0 or 1: do not dispose (leave as is)

      // Reset GCE state
      delayTime = 0;
      disposalMethod = 0;
      transparentColorIndex = -1;
      hasTransparency = false;
      firstFrame = false;
    } else {
      // Unknown block, try to skip
      // Could be a stray byte; in a well-formed GIF this shouldn't happen
      // but we handle it gracefully
    }
  }

  void firstFrame;

  return {
    width: screenWidth,
    height: screenHeight,
    frames,
  };

  // ----------------------------------------------------------------
  // Helper: skip sub-blocks (used for extensions we don't parse)
  // ----------------------------------------------------------------
  function skipSubBlocks(): void {
    while (true) {
      const size = readByte();
      if (size === 0) break;
      pos += size;
    }
  }

  // ----------------------------------------------------------------
  // Helper: read sub-blocks into a single Uint8Array
  // ----------------------------------------------------------------
  function readSubBlocks(): Uint8Array {
    const chunks: Uint8Array[] = [];
    let totalLen = 0;
    while (true) {
      const size = readByte();
      if (size === 0) break;
      chunks.push(bytes.slice(pos, pos + size));
      totalLen += size;
      pos += size;
    }
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  // ----------------------------------------------------------------
  // LZW Decoder for GIF
  // ----------------------------------------------------------------
  function lzwDecode(
    minCodeSize: number,
    compressed: Uint8Array,
    pixelCount: number
  ): Uint8Array {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;

    // Code table: each entry is an array of pixel indices.
    // For performance we store as Uint8Array per entry.
    // We use a flat approach: table[code] = array of color indices.
    const MAX_TABLE_SIZE = 4096;

    let codeSize = minCodeSize + 1;
    let codeMask = (1 << codeSize) - 1;

    // Initialize table
    let table: (Uint8Array | null)[] = new Array(MAX_TABLE_SIZE);
    let tableSize = 0;

    function initTable(): void {
      table = new Array(MAX_TABLE_SIZE);
      for (let i = 0; i < clearCode; i++) {
        table[i] = new Uint8Array([i]);
      }
      table[clearCode] = null; // clear code marker
      table[eoiCode] = null; // EOI marker
      tableSize = eoiCode + 1;
      codeSize = minCodeSize + 1;
      codeMask = (1 << codeSize) - 1;
    }

    initTable();

    const output = new Uint8Array(pixelCount);
    let outPos = 0;

    // Bit reader state
    let bitBuf = 0;
    let bitCount = 0;
    let dataPos = 0;

    function readCode(): number {
      while (bitCount < codeSize) {
        if (dataPos >= compressed.length) {
          return eoiCode; // out of data
        }
        bitBuf |= compressed[dataPos++] << bitCount;
        bitCount += 8;
      }
      const code = bitBuf & codeMask;
      bitBuf >>= codeSize;
      bitCount -= codeSize;
      return code;
    }

    // Read the first code (should be a clear code)
    let code = readCode();
    if (code === clearCode) {
      initTable();
      code = readCode();
      if (code === eoiCode || code === clearCode) {
        return output;
      }
    }

    // Output the first code
    let prevEntry = table[code];
    if (prevEntry) {
      for (let i = 0; i < prevEntry.length && outPos < pixelCount; i++) {
        output[outPos++] = prevEntry[i];
      }
    }

    while (outPos < pixelCount) {
      const prevCode = code;
      code = readCode();

      if (code === eoiCode) {
        break;
      }

      if (code === clearCode) {
        initTable();
        code = readCode();
        if (code === eoiCode) {
          break;
        }
        prevEntry = table[code];
        if (prevEntry) {
          for (let i = 0; i < prevEntry.length && outPos < pixelCount; i++) {
            output[outPos++] = prevEntry[i];
          }
        }
        continue;
      }

      let entry: Uint8Array;
      const prev = table[prevCode];
      if (!prev) {
        continue;
      }

      if (code < tableSize && table[code] !== null && table[code] !== undefined) {
        // Code is in the table
        entry = table[code]!;
        // Add prev + entry[0] to the table
        if (tableSize < MAX_TABLE_SIZE) {
          const newEntry = new Uint8Array(prev.length + 1);
          newEntry.set(prev);
          newEntry[prev.length] = entry[0];
          table[tableSize++] = newEntry;
        }
      } else {
        // Code is not in the table: special case
        // entry = prev + prev[0]
        entry = new Uint8Array(prev.length + 1);
        entry.set(prev);
        entry[prev.length] = prev[0];
        if (tableSize < MAX_TABLE_SIZE) {
          table[tableSize++] = entry;
        }
      }

      // Output the entry
      for (let i = 0; i < entry.length && outPos < pixelCount; i++) {
        output[outPos++] = entry[i];
      }

      // Increase code size if needed
      if (tableSize >= codeMask + 1 && codeSize < 12) {
        codeSize++;
        codeMask = (1 << codeSize) - 1;
      }

      prevEntry = entry;
    }

    return output;
  }

  // ----------------------------------------------------------------
  // De-interlace: GIF interlace reorders rows in 4 passes
  // ----------------------------------------------------------------
  function deinterlace(
    pixels: Uint8Array,
    width: number,
    height: number
  ): Uint8Array {
    const result = new Uint8Array(pixels.length);

    // Interlace passes:
    // Pass 1: rows 0, 8, 16, ... (start=0, step=8)
    // Pass 2: rows 4, 12, 20, ... (start=4, step=8)
    // Pass 3: rows 2, 6, 10, ... (start=2, step=4)
    // Pass 4: rows 1, 3, 5, ...  (start=1, step=2)
    const passes = [
      { start: 0, step: 8 },
      { start: 4, step: 8 },
      { start: 2, step: 4 },
      { start: 1, step: 2 },
    ];

    let srcRow = 0;
    for (const pass of passes) {
      for (let y = pass.start; y < height; y += pass.step) {
        const srcOffset = srcRow * width;
        const dstOffset = y * width;
        for (let x = 0; x < width; x++) {
          result[dstOffset + x] = pixels[srcOffset + x];
        }
        srcRow++;
      }
    }

    return result;
  }
}
