import {
  Image,
  StyleSheet,
  Platform,
  SafeAreaView,
  View,
  TouchableOpacity,
  Text,
} from "react-native";

import { HelloWave } from "@/components/HelloWave";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { AudioBufferSourceNode, AudioContext } from "react-native-audio-api";
import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeClient } from "@openai/realtime-api-beta";
import { goofyResample } from "@/utils/decode";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { parseWavFile, readWavFile } from "@/utils/wav";

const assetUrl =
  "https://audio-ssl.itunes.apple.com/apple-assets-us-std-000001/AudioPreview18/v4/9c/db/54/9cdb54b3-5c52-3063-b1ad-abe42955edb5/mzaf_520282131402737225.plus.aac.p.m4a";

const RecordingOptions = {
  isMeteringEnabled: true,
  android: {
    extension: ".aac",
    outputFormat: Audio.AndroidOutputFormat.AAC_ADTS,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 16000,
  },
  ios: {
    extension: ".wav",
    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 16000,
    // linearPCMBitDepth: 16,
    // linearPCMIsBigEndian: false,
    // linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 128000,
  },
};

function floatTo16BitPCM(float32Array: Float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  let offset = 0;
  for (let i = 0; i < float32Array.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

// Converts a Float32Array to base64-encoded PCM16 data
function base64EncodeAudio(float32Array: Float32Array) {
  const arrayBuffer = floatTo16BitPCM(float32Array);
  let binary = "";
  let bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000; // 32KB chunk size
  for (let i = 0; i < bytes.length; i += chunkSize) {
    let chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

export default function HomeScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingStatus, setRecordingStatus] = useState("idle");
  const [audioPermission, setAudioPermission] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient({
      apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY,
      dangerouslyAllowAPIKeyInBrowser: true,
    })
  );

  const connectConversation = async () => {
    console.log("connectConversation");
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    const client = clientRef.current;

    try {
      console.log("connecting to realtime API");
      await client.connect();

      setIsConnected(true);

      await client.sendUserMessageContent([
        {
          type: `input_text`,
          text: `소담아!`,
        },
      ]);
    } catch (e) {
      console.error(e);
    }
  };

  const disconnectConversation = async () => {
    setIsConnected(false);

    const client = clientRef.current;
    client.disconnect();
  };

  async function startRecording() {
    try {
      if (audioPermission) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }

      const newRecording = new Audio.Recording();
      console.log("Starting recording");
      await newRecording.prepareToRecordAsync(
        // Audio.RecordingOptionsPresets.HIGH_QUALITY
        RecordingOptions
      );
      await newRecording.startAsync();
      setRecording(newRecording);
      setRecordingStatus("recording");
    } catch (error) {
      console.error("Error starting recording: ", error);
    }
  }

  async function stopRecording() {
    try {
      if (recordingStatus === "recording" && recording) {
        console.log("Stopping recording");
        await recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
        });
        const recordingUri = recording.getURI();

        console.log("recordingUri", recordingUri);

        const newUri = await moveCachedAudioToDocumentDirectory(recordingUri!);
        setRecordingUri(newUri);

        // const playbackObject = new Audio.Sound();
        // await playbackObject.loadAsync({
        //   uri: FileSystem.documentDirectory + "recordings/" + fileName,
        // });
        // await playbackObject.playAsync();
        setRecording(null);
        setRecordingStatus("stopped");
      }
    } catch (error) {
      console.error("Error stopping recording: ", error);
    }
  }

  const moveCachedAudioToDocumentDirectory = async (recordingUri: string) => {
    const fileName = `recording-${Date.now()}.${recordingUri.split(".")[1]}`;
    console.log("fileName", fileName);

    await FileSystem.makeDirectoryAsync(
      FileSystem.documentDirectory + "recordings/",
      {
        intermediates: true,
      }
    );

    const filePath = FileSystem.documentDirectory + "recordings/" + fileName;

    await FileSystem.moveAsync({
      from: recordingUri!,
      to: filePath,
    });

    return filePath;
  };

  const sendUserAudio = async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (!recordingUri) {
      return;
    }

    try {
      console.log("recordingUri", recordingUri);

      // const buffer = await audioContextRef.current.decodeAudioDataSource(
      //   recordingUri
      // );

      // console.log("buffer", buffer);

      // const chanelData = buffer.getChannelData(0); // Mono
      // const base64audioData = base64EncodeAudio(new Float32Array(chanelData));

      const wavBuffer = await readWavFile(recordingUri);
      if (!wavBuffer) {
        return;
      }
      const { rawAudio, sampleRate, numChannels, bitsPerSample } =
        parseWavFile(wavBuffer);

      console.log("rawAudio", rawAudio);

      // const client = clientRef.current;
      // client.sendUserMessageContent([
      //   { type: "input_audio", audio: base64audioData },
      // ]);
    } catch (error) {
      console.error("Error sending user audio: ", error);
    }
  };

  const handleRecordButtonPress = async () => {
    if (recording) {
      const audioUri = await stopRecording();
    } else {
      await startRecording();
    }
  };

  useEffect(() => {
    async function getPermission() {
      await Audio.requestPermissionsAsync()
        .then((permission) => {
          console.log("Permission granted: " + permission.granted);
          setAudioPermission(permission.granted);
        })
        .catch((error: any) => {
          console.error(error);
        });
    }

    getPermission();

    return () => {
      if (recording) {
        stopRecording();
      }
    };
  }, []);

  useEffect(() => {
    const client = clientRef.current;

    // Set instructions
    client.updateSession({
      instructions:
        "너는 노인을 도와주는 에이전트 소담이야. 5살 아이처럼 대답해.",
    });
    client.updateSession({ voice: "alloy" });
    // Set transcription, otherwise we don't get user transcriptions back
    client.updateSession({ input_audio_transcription: { model: "whisper-1" } });

    client.on("error", (event: any) => console.error(event));

    client.on("realtime.event", (realtimeEvent: any) => {
      console.log(
        "realtime.event",
        realtimeEvent.source,
        realtimeEvent.event?.response?.status,
        realtimeEvent.event.type
      );
      if (realtimeEvent.event?.response?.status === "failed") {
        console.log(JSON.stringify(realtimeEvent, null, 2));
      }
    });

    client.on("conversation.updated", async ({ item, delta }: any) => {
      const items = client.conversation.getItems();

      if (delta?.audio) {
      }
      if (item.status === "completed") {
        console.log("conversation.updated", item);
      }
      if (item.status === "completed" && item.formatted.audio?.length) {
        // Success case 1.
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }

        const aCtx = audioContextRef.current;
        const audioBuffer = goofyResample(
          aCtx,
          new Int16Array(item.formatted.audio)
        );

        console.log("audioBuffer", audioBuffer.length);

        const sourceNode = aCtx.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(aCtx.destination);
        sourceNode.start();
        sourceNode.stop(aCtx.currentTime + audioBuffer.duration);
      }
    });

    return () => {
      client.reset();
    };
  }, []);

  return (
    <SafeAreaView>
      <View style={{ padding: 10 }}>
        <TouchableOpacity
          onPress={isConnected ? disconnectConversation : connectConversation}
          style={{ padding: 4 }}
        >
          <Text style={{ color: "red" }}>
            {isConnected ? "Disconnect" : "Connect"}
          </Text>
        </TouchableOpacity>
        <View style={{ paddingTop: 20 }}>
          <TouchableOpacity
            onPress={handleRecordButtonPress}
            style={{ padding: 4, borderWidth: 1, borderColor: "red" }}
          >
            <Text style={{ color: "red" }}>mic</Text>
          </TouchableOpacity>
          <Text style={{ color: "red" }}>{recordingStatus}</Text>
        </View>
        <View style={{ paddingTop: 20 }}>
          <TouchableOpacity
            onPress={sendUserAudio}
            style={{ padding: 4, borderWidth: 1, borderColor: "red" }}
          >
            <Text style={{ color: "red" }}>send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
