/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback, Component } from 'react';
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

// Error boundary to prevent white screen
class ErrorBoundary extends Component<{children: any}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error('App crashed:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding: 40, background: '#0a0502', color: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif'}}>
          <h1 style={{color: '#f97316', marginBottom: 16}}>Algo deu errado</h1>
          <pre style={{background: '#1a1a1a', padding: 20, borderRadius: 12, maxWidth: '90%', overflow: 'auto', fontSize: 12}}>
            {this.state.error?.toString()}
          </pre>
          <button onClick={() => window.location.reload()} style={{marginTop: 20, padding: '12px 24px', background: '#f97316', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer'}}>
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppInner() {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('environment'); // user=frontal, environment=traseira
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [errorVisible, setErrorVisible] = useState<string | null>(null);
  const [isTTSEnabled, setIsTTSEnabled] = useState(true);
  const [voiceName, setVoiceName] = useState('Zephyr');
  const [theme, setTheme] = useState<'laranja' | 'pink'>('laranja');
  const [systemPrompt, setSystemPrompt] = useState("Você é Clô, um assistente de IA premium rodando em tempo real. Importante: Fale de forma rápida, natural e dinâmica. Evite pausas longas. Seja extremamente conciso nas respostas e mantenha um tom sofisticado, mas enérgico, em Português do Brasil.");
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [userApiKey, setUserApiKey] = useState(localStorage.getItem('CLO_API_KEY') || '');
  
  useEffect(() => {
    const apiKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '';
    if (userApiKey) {
      setApiKey(userApiKey);
    } else if (!apiKey || apiKey === 'undefined') {
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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: cameraFacing }
        });
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

  const switchCamera = async () => {
    const newFacing = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(newFacing);
    
    // Se a câmera estiver ativa, reinicia com o novo facing
    if (isCameraActive) {
      cameraStream?.getTracks().forEach(track => track.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacing }
        });
        setCameraStream(stream);
      } catch (err: any) {
        console.error("Camera switch failed", err);
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
    <div className={`relative h-screen w-screen flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden theme-${theme}`}>
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
                <Settings style={{ color: 'var(--tct)' }} />
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
                    className={`w-12 h-6 rounded-full transition-colors relative ${isTTSEnabled ? '' : 'bg-white/10'}`}
                    style={isTTSEnabled ? { backgroundColor: 'var(--tc)' } : {}}
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
                        className={`p-3 rounded-xl flex items-center justify-between transition-all ${voiceName === voice.id ? 'text-white' : 'glass hover:bg-white/10'}`}
                        style={voiceName === voice.id ? { backgroundColor: 'var(--tc)' } : {}}
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
                      className="text-[10px] hover:underline flex items-center gap-1"
                      style={{ color: 'var(--tct)' }}
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
      <div className="z-10 w-full max-w-lg h-full flex flex-col gap-4 mx-auto overflow-hidden">
        
        {/* Left Side: Interaction Zone */}
        <div className="flex-1 flex flex-col gap-6 relative">
          <div className="flex items-center justify-between">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className="flex flex-col">
                <h1 className="text-2xl font-medium tracking-tight">Clô <span style={{ color: 'var(--tct)', opacity: 0.8 }}>ao vivo</span></h1>
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
            </div>
          </div>

          <AnimatePresence>
            {errorVisible && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute top-20 left-12 right-12 z-50 p-4 glass rounded-2xl flex items-center gap-4"
                style={{ borderColor: 'var(--tc)', color: 'var(--tct)' }}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--tcb)' }}>
                  <Settings style={{ color: 'var(--tc)' }} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: 'var(--tc)' }}>Configuração Requerida</h3>
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
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top right, var(--tcb), rgba(168, 85, 247, 0.05))' }} />
            
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
              className="relative w-40 h-40 md:w-56 md:h-56 rounded-full"
            >
              <div className="absolute inset-0 rounded-full blur-2xl opacity-20" style={{ background: 'linear-gradient(to bottom right, var(--tc), var(--tcd))' }} />
              <div className={`absolute inset-2 rounded-full border transition-colors duration-500 animate-pulse`} style={{ borderColor: isListening ? 'var(--tcl)' : 'rgba(255,255,255,0.2)' }} />
              <div className="absolute inset-4 rounded-full glass border-white/40 shadow-inner overflow-hidden">
                {/* Internal energy effect */}
                <motion.div 
                  animate={{ y: isStreaming ? [0, -10, 0] : 0 }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="absolute inset-0 to-transparent"
                  style={{ background: 'linear-gradient(to top, var(--tcb), transparent)' }}
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
                    <div className="w-full h-full rounded-full" style={{ border: '1px solid var(--tcl)', opacity: 0.3 }} />
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
              <div className="flex items-center gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleCamera(); }}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-2xl active:scale-90 ${isCameraActive ? 'scale-110' : 'glass hover:bg-white/20'}`}
                  style={isCameraActive ? { backgroundColor: 'var(--tc)' } : {}}
                >
                  {isCameraActive ? <CameraOff className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
                </button>
                {isCameraActive && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); switchCamera(); }}
                    className="w-10 h-10 rounded-full glass flex items-center justify-center transition-all hover:bg-white/20 active:scale-90 shadow-lg"
                    title={cameraFacing === 'environment' ? 'Virar para frontal' : 'Virar para traseira'}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 16V8a2 2 0 0 1 2-2h3l2-3h6l2 3h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"/>
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M17 12h.01M7 12h.01" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); toggleLive(); }}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-2xl active:scale-90 ${isLiveMode ? 'bg-red-500 scale-110 animate-pulse' : ''}`}
                style={!isLiveMode ? { backgroundColor: 'var(--tc)' } : {}}
              >
                {isLiveMode ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Theme Toggle */}
      <button
        onClick={() => setTheme(theme === 'laranja' ? 'pink' : 'laranja')}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full glass flex items-center justify-center hover:bg-white/20 transition-all active:scale-90 shadow-lg"
        style={{ border: '2px solid var(--tcl)', color: 'var(--tct)' }}
        title={theme === 'pink' ? 'Tema Pink' : 'Tema Laranja'}
      >
        <span className="text-lg">{theme === 'pink' ? '💖' : '🔥'}</span>
      </button>

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

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
