// MD5 sur ArrayBuffer (RFC 1321). Nécessaire car SubtleCrypto ne fournit pas MD5,
// exigé par le protocole d'upload de fichier de l'API Zotero.
export function md5ArrayBuffer(buffer) {
  function rotl(x, c) {
    return (x << c) | (x >>> (32 - c));
  }
  function toHex(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  }

  const K = new Int32Array([
    -680876936, -389564586, 606105819, -1044525330, -176418897, 1200080426,
    -1473231341, -45705983, 1770035416, -1958414417, -42063, -1990404162,
    1804603682, -40341101, -1502002290, 1236535329, -165796510, -1069501632,
    643717713, -373897302, -701558691, 38016083, -660478335, -405537848,
    568446438, -1019803690, -187363961, 1163531501, -1444681467, -51403784,
    1735328473, -1926607734, -378558, -2022574463, 1839030562, -35309556,
    -1530992060, 1272893353, -155497632, -1094730640, 681279174, -358537222,
    -722521979, 76029189, -640364487, -421815835, 530742520, -995338651,
    -198630844, 1126891415, -1416354905, -57434055, 1700485571, -1894986606,
    -1051523, -2054922799, 1873313359, -30611744, -1560198380, 1309151649,
    -145523070, -1120210379, 718787259, -343485551,
  ]);
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  const msgLen = buffer.byteLength;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;

  const bytes = new Uint8Array(paddedLen);
  bytes.set(new Uint8Array(buffer));
  bytes[msgLen] = 0x80;
  const bitLen = msgLen * 8;
  const view = new DataView(bytes.buffer);
  // longueur en bits sur 64 bits little-endian
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(msgLen / 0x20000000), true);

  let a0 = 1732584193, b0 = -271733879, c0 = -1732584194, d0 = 271733878;

  for (let chunkStart = 0; chunkStart < paddedLen; chunkStart += 64) {
    const M = new Int32Array(16);
    for (let j = 0; j < 16; j++) {
      M[j] = view.getInt32(chunkStart + j * 4, true);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, S[i])) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setInt32(0, a0, true);
  outView.setInt32(4, b0, true);
  outView.setInt32(8, c0, true);
  outView.setInt32(12, d0, true);
  return toHex(out);
}
