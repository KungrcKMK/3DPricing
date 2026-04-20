// Simple STL parser — supports both Binary and ASCII STL
// Returns { triangles, volume (cm^3), bbox: {x,y,z} (mm) }

window.STLParser = (function () {

  function parseBinary(buffer) {
    const dv = new DataView(buffer);
    const triCount = dv.getUint32(80, true);
    const triangles = [];
    let minX=Infinity, minY=Infinity, minZ=Infinity;
    let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
    let volume = 0;
    let offset = 84;

    for (let i = 0; i < triCount; i++) {
      // skip normal (12 bytes)
      offset += 12;
      const v = [];
      for (let j = 0; j < 3; j++) {
        const x = dv.getFloat32(offset, true); offset += 4;
        const y = dv.getFloat32(offset, true); offset += 4;
        const z = dv.getFloat32(offset, true); offset += 4;
        v.push([x, y, z]);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      // Signed tetrahedron volume from origin
      volume += signedVolume(v[0], v[1], v[2]);
      offset += 2; // attribute byte count
    }

    return {
      triangles: triCount,
      volume: Math.abs(volume) / 1000, // mm^3 to cm^3
      bbox: {
        x: maxX - minX,
        y: maxY - minY,
        z: maxZ - minZ,
      },
    };
  }

  function parseASCII(text) {
    const lines = text.split('\n');
    const vertices = [];
    let triCount = 0;
    let minX=Infinity, minY=Infinity, minZ=Infinity;
    let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
    let volume = 0;
    let currentTri = [];

    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('vertex')) {
        const parts = line.split(/\s+/);
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const z = parseFloat(parts[3]);
        currentTri.push([x, y, z]);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        if (currentTri.length === 3) {
          volume += signedVolume(currentTri[0], currentTri[1], currentTri[2]);
          triCount++;
          currentTri = [];
        }
      }
    }

    return {
      triangles: triCount,
      volume: Math.abs(volume) / 1000,
      bbox: {
        x: maxX - minX,
        y: maxY - minY,
        z: maxZ - minZ,
      },
    };
  }

  function signedVolume(a, b, c) {
    // V = (1/6) * (a · (b × c))
    const cross = [
      b[1] * c[2] - b[2] * c[1],
      b[2] * c[0] - b[0] * c[2],
      b[0] * c[1] - b[1] * c[0],
    ];
    return (a[0] * cross[0] + a[1] * cross[1] + a[2] * cross[2]) / 6;
  }

  function isBinarySTL(buffer) {
    // ASCII STL starts with "solid " and is readable text.
    // Check first 5 bytes and file-size match.
    const head = new Uint8Array(buffer, 0, Math.min(5, buffer.byteLength));
    const ascii = String.fromCharCode(...head);
    if (ascii === 'solid') {
      // Could still be binary (some binaries also start with 'solid')
      // Verify with triangle count vs file size
      if (buffer.byteLength < 84) return false;
      const dv = new DataView(buffer);
      const triCount = dv.getUint32(80, true);
      const expected = 84 + triCount * 50;
      return expected === buffer.byteLength;
    }
    return true;
  }

  function parse(buffer) {
    if (isBinarySTL(buffer)) {
      return parseBinary(buffer);
    }
    const text = new TextDecoder().decode(buffer);
    return parseASCII(text);
  }

  return { parse };
})();
