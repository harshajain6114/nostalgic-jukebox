import fs from 'fs';
import path from 'path';

function createWavBuffer(sampleRate, durationSeconds, frequencyFunc) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const fileSize = 44 + dataSize;
  const buffer = Buffer.alloc(fileSize);

  // RIFF identifier
  buffer.write('RIFF', 0);
  // file length
  buffer.writeUInt32LE(fileSize - 8, 4);
  // RIFF type
  buffer.write('WAVE', 8);
  // format chunk identifier
  buffer.write('fmt ', 12);
  // format chunk length
  buffer.writeUInt32LE(16, 16);
  // sample format (raw)
  buffer.writeUInt16LE(1, 20);
  // channel count
  buffer.writeUInt16LE(numChannels, 22);
  // sample rate
  buffer.writeUInt32LE(sampleRate, 24);
  // byte rate (sample rate * block align)
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  // block align (channel count * bytes per sample)
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  // bits per sample
  buffer.writeUInt16LE(bitsPerSample, 34);
  // data chunk identifier
  buffer.write('data', 36);
  // data chunk length
  buffer.writeUInt32LE(dataSize, 40);

  // Write samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = frequencyFunc(t);
    const sampleVal = Math.sin(2 * Math.PI * freq * t);
    // Scale to 16-bit signed integer range (-32768 to 32767)
    const intVal = Math.max(-32768, Math.min(32767, Math.floor(sampleVal * 15000)));
    buffer.writeInt16LE(intVal, offset);
    offset += 2;
  }

  return buffer;
}

const audioDir = path.join(process.cwd(), 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// 1. Synth wave track: melody sweeps, 15 seconds
const synthWave = createWavBuffer(44100, 15, (t) => {
  const beat = Math.floor(t * 2); // 2 beats per second
  const melody = [220, 261.63, 293.66, 329.63, 349.23, 392.00, 440, 493.88];
  const baseFreq = melody[beat % melody.length];
  return baseFreq + Math.sin(2 * Math.PI * 6 * t) * 5;
});
fs.writeFileSync(path.join(audioDir, 'synth-wave.wav'), synthWave);
console.log('Generated synth-wave.wav');

// 2. Ambient beat: lower frequency ambient drone, 15 seconds
const ambientBeat = createWavBuffer(44100, 15, (t) => {
  const beat = Math.floor(t / 2);
  const drone = [110, 130.81, 146.83, 164.81];
  const baseFreq = drone[beat % drone.length];
  return baseFreq + Math.sin(2 * Math.PI * 0.5 * t) * 2;
});
fs.writeFileSync(path.join(audioDir, 'ambient-beat.wav'), ambientBeat);
console.log('Generated ambient-beat.wav');
