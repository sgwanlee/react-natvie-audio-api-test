import * as FileSystem from "expo-file-system";
import { Buffer } from "buffer";

export const readWavFile = async (uri: string) => {
  try {
    const wavData = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const buffer = Buffer.from(wavData, "base64");
    console.log("buffer", buffer);

    return buffer;
  } catch (error) {
    console.error("Failed to read WAV file:", error);
  }
};

export const parseWavFile = (wavBuffer: Buffer) => {
  const headerSize = 44;

  if (wavBuffer.length < headerSize) {
    throw new Error("Invalid WAV file.");
  }

  // Extract key details from the WAV header
  const audioFormat = wavBuffer.readUInt16LE(20);
  const numChannels = wavBuffer.readUInt16LE(22);
  const sampleRate = wavBuffer.readUInt32LE(24);
  const byteRate = wavBuffer.readUInt32LE(28);
  const blockAlign = wavBuffer.readUInt16LE(32);
  const bitsPerSample = wavBuffer.readUInt16LE(34);

  console.log(`Audio Format: ${audioFormat}`);
  console.log(`Channels: ${numChannels}`);
  console.log(`Sample Rate: ${sampleRate}`);
  console.log(`Byte Rate: ${byteRate}`);
  console.log(`Block Align: ${blockAlign}`);
  console.log(`Bits Per Sample: ${bitsPerSample}`);

  // Extract raw audio data (skip the 44-byte header)
  const rawAudio = wavBuffer.slice(headerSize);

  return {
    audioFormat,
    numChannels,
    sampleRate,
    bitsPerSample,
    rawAudio,
  };
};
