// Extrait une plage temporelle d'un fichier audio et l'encode en WAV (PCM 16 bits),
// entièrement côté client (Web Audio API), sans dépendance à un encodeur externe.

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;

  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // taille du sous-bloc fmt
  view.setUint16(20, 1, true); // format PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export async function extractAudioRange(url, startSec, endSec) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`audio: HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.max(0, Math.floor(startSec * sampleRate));
    const endSample = Math.min(audioBuffer.length, Math.ceil(endSec * sampleRate));
    const frameCount = Math.max(1, endSample - startSample);

    const sliced = ctx.createBuffer(audioBuffer.numberOfChannels, frameCount, sampleRate);
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      sliced.copyToChannel(audioBuffer.getChannelData(ch).subarray(startSample, endSample), ch);
    }

    return audioBufferToWav(sliced);
  } finally {
    ctx.close();
  }
}
