/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, 
  MicOff, 
  Camera, 
  CameraOff, 
  Send, 
  Sparkles, 
  ChevronRight,
  Maximize2,
  Settings,
  History,
  AlertCircle,
  Volume2,
  VolumeX,
  X,
  Languages
} from 'lucide-react';
import { chatStream, analyzeImage, generateTTSSpeech, connectLive, setApiKey } from './services/geminiService';
import { LiveServerMessage } from '@google/genai';

// Reconhecimento de voz
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognition = SpeechRecognition ? new SpeechRecognition() : null;

export default function App() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [errorVisible, setErrorVisible] = useState<string | null>(null);
  const [isTTSEnabled, setIsTTSEnabled] = useState(true);
  const [voiceName, setVoiceName] = useState('Zephyr');
  const [systemPrompt, setSystemPrompt] = useState("Você é Clô, um assistente de IA premium rodando em tempo real. Importante: Fale de forma rápida, natural e dinâmica. Evite pausas longas. Seja extremamente conciso nas respostas e mantenha um tom sofisticado, mas enérgico, em Português do Brasil.");
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [userApiKey, setUserApiKey] = useState(localStorage.getItem('CLO_API_KEY') || '');
  
  useEffect(() => {
    if (userApiKey) {
      setApiKey(userApiKey);
    } else if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'undefined') {
      setShowSettings(true);
      setErrorVisible("Por favor, configure sua API Key nas configurações para usar o Clô fora do ambiente de desenvolvimento.");
    }
  }, [userApiKey]);

  const handleSaveApiKey = (key: string) => {
    setUserApiKey(key);
    localStorage.setItem('CLO_API_KEY', key);
    setApiKey(key);
  };
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  const stopLiveSession = useCallback(() => {
    liveSessionRef.current?.close();
    liveSessionRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    setIsLiveMode(false);
    setIsStreaming(false);
  }, []);

  const startLiveSession = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Seu navegador não suporta acesso a mídia (microfone/câmera) ou está bloqueado.");
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(err => {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error("Permissão de microfone negada. Autorize o acesso para usar o Live.");
        }
        throw err;
      });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const session = await connectLive({
        onopen: () => {
          setIsLiveMode(true);
          // Start sending audio
          source.connect(processor);
          processor.connect(audioContextRef.current!.destination);
          
          processor.onaudioprocess = (e) => {
            if (!liveSessionRef.current) return;
            const inputData = e.inputBuffer.getChannelData(0);
            // Convert Float32 to Int16 PCM
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
            }
            const base64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
            liveSessionRef.current.sendRealtimeInput({
              audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
            });
          };
        },
        onmessage: async (message: LiveServerMessage) => {
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            // Decode and enqueue audio
            const binary = atob(audioData);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const pcm16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(pcm16.length);
            for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 0x7FFF;
            
            audioQueueRef.current.push(float32);
            playNextChunk();
          }

          const transcription = message.serverContent?.modelTurn?.parts?.[0]?.text || 
                              message.serverContent?.modelTurn?.parts?.map(p => p.text).join(' ');
          
          if (transcription) {
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant') {
                return [...prev.slice(0, -1), { role: 'assistant', content: last.content + transcription }];
              }
              return [...prev, { role: 'assistant', content: transcription }];
            });
          }

          if (message.serverContent?.interrupted) {
            audioQueueRef.current = [];
            isPlayingRef.current = false;
          }
        },
        onclose: () => stopLiveSession(),
        onerror: (err: any) => {
          console.error("Live error", err);
          setErrorVisible("Erro na rede neural Live.");
          stopLiveSession();
        }
      }, voiceName, systemPrompt);

      liveSessionRef.current = session;
    } catch (err: any) {
      console.error(err);
      setErrorVisible(err.message || "Erro ao iniciar sessão Live.");
    }
  }, [voiceName, isCameraActive, stopLiveSession, systemPrompt]);

  const playNextChunk = () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0 || !audioContextRef.current) return;
    
    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;
    const buffer = audioContextRef.current.createBuffer(1, chunk.length, 16000);
    buffer.copyToChannel(chunk, 0);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextChunk();
    };
    source.start();
  };

  const toggleLive = () => {
    if (isLiveMode) {
      stopLiveSession();
    } else {
      startLiveSession();
    }
  };
  
  const voices = [
    { id: 'Zephyr', name: 'Zephyr (Feminina - Suave)', gender: 'female' },
    { id: 'Kore', name: 'Kore (Feminina - Clara)', gender: 'female' },
    { id: 'Puck', name: 'Puck (Masculina - Enérgica)', gender: 'male' },
    { id: 'Aoede', name: 'Aoede (Feminina - Expressiva)', gender: 'female' },
    { id: 'Charon', name: 'Charon (Masculina - Profunda)', gender: 'male' },
  ];

  // Função para falar o texto usando Gemini TTS
  const speak = useCallback(async (text: string) => {
    if (!isTTSEnabled) return;
    
    try {
      const base64Audio = await generateTTSSpeech(text, voiceName);
      if (base64Audio) {
        const audioBuffer = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
        const blob = new Blob([audioBuffer], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(e => console.error("Audio playback failed", e));
      }
    } catch (err) {
      console.error("TTS failed", err);
    }
  }, [isTTSEnabled, voiceName]);

  // Configuração Voice
  useEffect(() => {
    if (recognition) {
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'pt-BR';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (!recognition) {
      setErrorVisible("Seu navegador não suporta reconhecimento de voz (STT).");
      return;
    }
    if (isListening) {
      recognition?.stop();
      setIsListening(false);
    } else {
      window.speechSynthesis.cancel(); 
      try {
        recognition?.start();
        setIsListening(true);
      } catch (err) {
        setErrorVisible("Erro ao acessar microfone para ditado.");
        setIsListening(false);
      }
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const toggleCamera = async () => {
    if (isCameraActive) {
      cameraStream?.getTracks().forEach(track => track.stop());
      setCameraStream(null);
      setIsCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setCameraStream(stream);
        setIsCameraActive(true);
      } catch (err: any) {
        console.error("Camera access denied", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setErrorVisible("Permissão de câmera negada. Autorize o acesso nas configurações do navegador.");
        } else {
          setErrorVisible("Erro ao acessar a câmera.");
        }
      }
    }
  };

  // Efeito para ligar o stream ao elemento de vídeo quando ele aparecer
  useEffect(() => {
    if (isCameraActive && videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [isCameraActive, cameraStream]);

  // Efeito para enviar frames da câmera durante o Live
  useEffect(() => {
    let frameTimeout: number;
    
    if (isLiveMode && liveSessionRef.current && isCameraActive && videoRef.current) {
      const offscreenCanvas = document.createElement('canvas');
      const offscreenCtx = offscreenCanvas.getContext('2d', { alpha: false });
      
      const sendFrame = () => {
        if (!liveSessionRef.current || !isCameraActive || !isLiveMode) return;
        
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          const maxWidth = 512;
          const scale = maxWidth / video.videoWidth;
          const width = maxWidth;
          const height = video.videoHeight * scale;
          
          if (offscreenCanvas.width !== width) {
            offscreenCanvas.width = width;
            offscreenCanvas.height = height;
          }
          
          offscreenCtx?.drawImage(video, 0, 0, width, height);
          const base64Frame = offscreenCanvas.toDataURL('image/jpeg', 0.4).split(',')[1];
          
          liveSessionRef.current.sendRealtimeInput({
            video: { data: base64Frame, mimeType: 'image/jpeg' }
          });
        }
        frameTimeout = window.setTimeout(sendFrame, 1000);
      };
      
      sendFrame();
    }
    
    return () => {
      window.clearTimeout(frameTimeout);
    };
  }, [isLiveMode, isCameraActive]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() && !isCameraActive) return;

    const userMessage = text.trim() || (isCameraActive ? "O que você está vendo?" : "");
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInput('');
    setIsStreaming(true);

    try {
      let responseText = "";
      
      if (isCameraActive && videoRef.current) {
        // Capture frame
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(videoRef.current, 0, 0);
        const base64 = canvas.toDataURL('image/jpeg');
        
        const result = await analyzeImage(base64, userMessage);
        responseText = result || "Não consegui processar a imagem.";
        setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
        speak(responseText);
      } else {
        const stream = await chatStream(userMessage, "Você é Clô, um assistente IA sofisticado e filosófico. Seja conciso e elegante. Responda sempre em Português do Brasil.");
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        
        let fullContent = "";
        for await (const chunk of stream) {
          fullContent += chunk.text;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            return [...prev.slice(0, -1), { role: 'assistant', content: fullContent }];
          });
        }
        speak(fullContent);
      }
    } catch (err: any) {
      console.error(err);
      let errorMessage = "Desculpe, encontrei um erro na conexão.";
      if (err.message?.includes("API_KEY") || err.message === "GEMINI_API_KEY_MISSING") {
        errorMessage = "Chave API inválida ou ausente. Configure-a nas configurações.";
        setShowSettings(true);
      }
      setMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
      setErrorVisible(errorMessage);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="relative h-screen w-screen flex flex-col items-center justify-center p-6 md:p-12 overflow-hidden">
      <div className="atmosphere" />

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-card w-full max-w-md p-8 relative"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-4 right-4 p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
              
              <h2 className="text-2xl font-medium mb-8 flex items-center gap-2">
                <Settings className="text-orange-400" />
                Configurações
              </h2>
              
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Audio Resposta (Gemini 3.1)</h3>
                    <p className="text-sm text-white/50">Clô falará as respostas</p>
                  </div>
                  <button 
                    onClick={() => setIsTTSEnabled(!isTTSEnabled)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${isTTSEnabled ? 'bg-orange-500' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 bottom-1 w-4 rounded-full bg-white transition-all ${isTTSEnabled ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-white/60">Escolher Voz</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {voices.map((voice) => (
                      <button
                        key={voice.id}
                        onClick={() => setVoiceName(voice.id)}
                        className={`p-3 rounded-xl flex items-center justify-between transition-all ${voiceName === voice.id ? 'bg-orange-500 text-white' : 'glass hover:bg-white/10'}`}
                      >
                        <span className="text-sm">{voice.name}</span>
                        {voiceName === voice.id && <Sparkles size={16} />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-white/60 uppercase tracking-widest text-[10px]">Google Gemini API Key</h3>
                  <div className="space-y-2">
                    <input 
                      type="password"
                      value={userApiKey}
                      onChange={(e) => handleSaveApiKey(e.target.value)}
                      placeholder="Cole sua API Key aqui..."
                      className="w-full glass bg-white/5 rounded-xl p-4 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                    />
                    <a 
                      href="https://aistudio.google.com/app/apikey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] text-orange-400 hover:underline flex items-center gap-1"
                    >
                      Obtenha sua chave gratuita no Google AI Studio
                      <ChevronRight size={10} />
                    </a>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-white/60 uppercase tracking-widest text-[10px]">Instrução do Sistema (Personalidade)</h3>
                  <textarea 
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="w-full glass bg-white/5 rounded-xl p-4 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 min-h-[120px] resize-none"
                    placeholder="Defina como o Clô deve se comportar..."
                  />
                  <p className="text-[10px] text-white/30 truncate">Nota: Reinicie o Live para aplicar mudanças.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Container */}
      <div className="z-10 w-full max-w-6xl h-full flex flex-col md:flex-row gap-8">
        
        {/* Left Side: Interaction Zone */}
        <div className="flex-1 flex flex-col gap-6 relative">
          <div className="flex items-center justify-between">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl glass flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-orange-400" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl font-medium tracking-tight">Clô <span className="text-orange-400/80">ao vivo</span></h1>
                <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-mono">seu amigo de todas as horas!</p>
              </div>
            </motion.div>

            <div className="flex gap-2">
              <button 
                onClick={() => {
                  if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen();
                  } else {
                    document.exitFullscreen();
                  }
                }}
                className="p-2 glass rounded-lg hover:bg-white/20 transition-colors"
                title="Tela Cheia"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className="p-2 glass rounded-lg hover:bg-white/20 transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 glass rounded-lg transition-colors ${showHistory ? 'bg-orange-500 text-white' : 'hover:bg-white/20'}`}
              >
                <History className="w-5 h-5" />
              </button>
            </div>
          </div>

          <AnimatePresence>
            {errorVisible && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute top-20 left-12 right-12 z-50 p-4 glass rounded-2xl border-orange-500/50 flex items-center gap-4 text-orange-200"
              >
                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
                  <Settings className="w-5 h-5 text-orange-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-orange-500">Configuração Requerida</h3>
                  <p className="text-sm opacity-80">{errorVisible}</p>
                </div>
                <button 
                  onClick={() => setErrorVisible(null)}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <ChevronRight className="rotate-180 w-5 h-5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Clô Orb Section */}
          <div className="flex-1 glass-card p-12 flex flex-col items-center justify-center relative overflow-hidden group">
            {/* Ambient Glow */}
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/5 to-purple-500/5 pointer-events-none" />
            
            <motion.div
              animate={{
                scale: isStreaming ? [1, 1.15, 1] : isListening ? [1, 1.08, 1] : [1, 1.02, 1],
                rotate: isStreaming ? 360 : 0,
                boxShadow: isStreaming 
                  ? "0 0 50px rgba(251, 146, 60, 0.4)" 
                  : isListening 
                    ? "0 0 30px rgba(251, 146, 60, 0.2)" 
                    : "0 0 0px rgba(0,0,0,0)"
              }}
              transition={{
                duration: isStreaming ? 3 : isListening ? 1.5 : 8,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="relative w-48 h-48 md:w-64 md:h-64 rounded-full"
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-400 to-red-600 blur-2xl opacity-20" />
              <div className={`absolute inset-2 rounded-full border transition-colors duration-500 ${isListening ? 'border-orange-400/60' : 'border-white/20'} animate-pulse`} />
              <div className="absolute inset-4 rounded-full glass border-white/40 shadow-inner overflow-hidden">
                {/* Internal energy effect */}
                <motion.div 
                  animate={{ y: isStreaming ? [0, -10, 0] : 0 }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="absolute inset-0 bg-gradient-to-t from-orange-500/10 to-transparent"
                />
              </div>
              
              <AnimatePresence>
                {(isStreaming || isListening) && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1.5, opacity: 1 }}
                    exit={{ scale: 2, opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    <div className="w-full h-full rounded-full border border-orange-400/30" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            <div className="absolute top-12 left-0 right-0 text-center z-10 pointer-events-none px-6">
              <h2 className="text-sm text-white/40 font-serif italic tracking-wider drop-shadow-lg">
                {isStreaming ? "Sintonizando rede neural..." : isListening ? "Ouvindo sua frequência..." : "Inicie o Clô ao vivo para começar"}
              </h2>
            </div>
            
            {/* Camera Overlay */}
            <AnimatePresence>
              {isCameraActive && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="absolute bottom-6 left-6 right-6 h-48 md:h-64 rounded-2xl overflow-hidden glass border-white/20 shadow-2xl"
                >
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted
                    className="w-full h-full object-cover contrast-110"
                  />
                  <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/80 backdrop-blur-md text-[10px] font-bold uppercase tracking-widest animate-pulse">
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    Live Input
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Controls - REPOSICIONADOS E COM Z-INDEX ALTO */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-6 z-50">
              <button 
                onClick={(e) => { e.stopPropagation(); toggleCamera(); }}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl active:scale-90 ${isCameraActive ? 'bg-orange-500 scale-110' : 'glass hover:bg-white/20'}`}
              >
                {isCameraActive ? <CameraOff className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); toggleLive(); }}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-2xl active:scale-90 ${isLiveMode ? 'bg-red-500 scale-110 animate-pulse' : 'bg-orange-500 hover:bg-orange-600'}`}
              >
                {isLiveMode ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); toggleListening(); }}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl active:scale-90 ${isListening ? 'bg-blue-500 scale-110 animate-pulse' : 'glass hover:bg-white/20'}`}
                title="Ditar texto (STT)"
              >
                {isListening ? <X className="w-6 h-6" /> : <Languages className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Chat & History */}
        <div className="w-full md:w-96 flex flex-col gap-4">
          <div className="flex-1 glass-card flex flex-col relative overflow-hidden">
            <AnimatePresence mode="wait">
              {!showHistory ? (
                <motion.div 
                  key="chat"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 flex flex-col pt-4"
                >
                  <div className="px-4 pb-4 border-bottom border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-xs font-mono uppercase tracking-widest text-white/40">Neural Link Active</span>
                    </div>
                  </div>

                  <div 
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
                  >
                    {messages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                        <Maximize2 className="w-12 h-12 mb-4" />
                        <p className="text-sm">A conversa aparecerá aqui.<br/>Comece agora.</p>
                      </div>
                    )}
                    {messages.map((msg, idx) => (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-white/10 rounded-tr-none' : 'glass rounded-tl-none border-white/5'}`}>
                          {msg.content}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="p-6 pt-0">
                    <div className="relative group">
                      <input 
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Comandar Clô..."
                        className="w-full glass bg-white/5 rounded-2xl py-4 pl-6 pr-14 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all font-light"
                      />
                      <button 
                        onClick={() => handleSend()}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50"
                        disabled={isStreaming}
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="history"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex-1 flex flex-col pt-4"
                >
                  <div className="px-4 pb-4 border-bottom border-white/10 flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-widest text-white/40">Temporal Archive</span>
                    <button 
                      onClick={() => {
                        setMessages([]);
                        setShowHistory(false);
                      }}
                      className="text-[10px] text-red-400 hover:text-red-300 transition-colors uppercase font-bold"
                    >
                      Limpar Chat
                    </button>
                  </div>
                  
                  <div className="flex-1 p-6 space-y-4">
                    <div className="p-4 rounded-xl glass border-orange-500/30 bg-orange-500/5 cursor-pointer">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-tighter">Sessão Atual</span>
                        <span className="text-[10px] text-white/20">Agora</span>
                      </div>
                      <p className="text-xs text-white/60 line-clamp-2 italic">
                        {messages.length > 0 ? messages[messages.length-1].content : "Inicie uma conversa para gerar registros."}
                      </p>
                    </div>
                    
                    <div className="p-4 rounded-xl glass border-white/5 opacity-40 grayscale flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-tighter">Sessão #402</span>
                        <span className="text-[10px] text-white/10">Ontem</span>
                      </div>
                      <div className="h-2 w-2/3 bg-white/10 rounded" />
                      <div className="h-2 w-1/2 bg-white/10 rounded" />
                    </div>

                    <div className="flex flex-col items-center justify-center pt-12 opacity-20">
                      <History className="w-12 h-12 mb-2" />
                      <p className="text-[10px] uppercase tracking-widest text-center">Nenhum registro anterior encontrado no cache local</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="glass-card p-4 flex items-center justify-between group cursor-pointer hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-400/20 flex items-center justify-center">
                <Sparkles size={16} className="text-orange-400" />
              </div>
              <span className="text-xs uppercase tracking-widest font-bold text-white/60">Upgrade System</span>
            </div>
            <div className="w-6 h-6 rounded-md glass flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight size={14} />
            </div>
          </div>
        </div>
      </div>

      {/* Decorative Text */}
      <div className="fixed bottom-6 left-12 hidden md:block">
        <p className="text-[10px] font-mono text-white/20 uppercase tracking-[0.5em] leading-loose">
          Version 3.1.0-Flash<br/>
          Temporal Alignment Engaged<br/>
          System Status: Optimal
        </p>
      </div>
    </div>
  );
}
