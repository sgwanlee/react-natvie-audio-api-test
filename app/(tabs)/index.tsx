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
import { AudioContext } from "react-native-audio-api";
import { useEffect, useRef, useState } from "react";
import { RealtimeClient } from "@openai/realtime-api-beta";
import { goofyResample } from "@/utils/decode";

export default function HomeScreen() {
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
    client.on("conversation.updated", async ({ item, delta }: any) => {
      const items = client.conversation.getItems();

      if (delta?.audio) {
      }
      if (item.status === "completed") {
        items.map((item) => {
          if (item.role === "user") {
            console.log(item);
          }
        });
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
      </View>
    </SafeAreaView>
  );
}
