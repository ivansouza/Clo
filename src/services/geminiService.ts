import { GoogleGenAI, Modality } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;
let currentApiKey: string | null = null;

export function setApiKey(key: string) {
  currentApiKey = key;
  aiInstance = new GoogleGenAI({ apiKey: key });
}

export function getAI() {
  if (!aiInstance) {
    const apiKey = currentApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "undefined") {
      throw new Error("GEMINI_API_KEY_MISSING");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function chatStream(message: string, systemInstruction?: string) {
  const ai = getAI();
  const response = await ai.models.generateContentStream({
    model: "gemini-3.1-flash-preview",
    contents: [{ role: "user", parts: [{ text: message }] }],
    config: {
      systemInstruction,
    },
  });
  return response;
}

export async function connectLive(callbacks: any, voiceName: string = 'Zephyr', systemInstruction: string = "Você é Zenith, um assistente de IA em tempo real. Responda de forma concisa, amigável e filosófica em Português do Brasil.") {
  const ai = getAI();
  return ai.live.connect({
    model: "gemini-3.1-flash-live-preview",
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
      systemInstruction,
    },
  });
}

export async function generateTTSSpeech(text: string, voiceName: string = 'Kore') {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio;
}

export async function analyzeImage(imageBuffer: string, prompt: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-preview",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageBuffer.split(",")[1],
              mimeType: "image/jpeg",
            },
          },
        ],
      },
    ],
  });
  return response.text;
}
