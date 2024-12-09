import { AudioBuffer, AudioContext } from "react-native-audio-api";

const openAISampleRate = 24000;
const maxInputValue = 32768.0;

// TODO: this should ideally be done using native code through .decodeAudioData
export function goofyResample(
  audioContext: AudioContext,
  input: Int16Array
): AudioBuffer {
  console.log("goofyResample", audioContext.sampleRate, input.length);
  const scale = audioContext.sampleRate / openAISampleRate;

  const outputBuffer = audioContext.createBuffer(
    2,
    input.length * scale,
    audioContext.sampleRate
  );

  const processingChannel: Array<number> = [];
  const upSampleChannel: Array<number> = [];

  for (let i = 0; i < input.length; i += 1) {
    processingChannel[i] = input[i] / maxInputValue;
  }

  for (let i = 0; i < input.length; i += 1) {
    const isLast = i === input.length - 1;
    const currentSample = processingChannel[i];
    const nextSample = isLast ? currentSample : processingChannel[i + 1];

    upSampleChannel[2 * i] = currentSample;
    upSampleChannel[2 * i + 1] = (currentSample + nextSample) / 2;
  }

  outputBuffer.copyToChannel(upSampleChannel, 0);
  outputBuffer.copyToChannel(upSampleChannel, 1);

  console.log("C", outputBuffer.length);

  return outputBuffer;
}
