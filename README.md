<div align="center">
  <br/>
  <h1>🤖 Clô AI</h1>
  <p><strong>Seu amigo de todas as horas!</strong></p>
  <p>Assistente de IA em tempo real com voz, câmera e muito estilo.</p>
  <br/>
  <p>
    <a href="https://ivansouza.github.io/Clo/" target="_blank">
      <img src="https://img.shields.io/badge/Acessar-Clô%20AI-orange?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Acessar"/>
    </a>
    <a href="#-funcionalidades">
      <img src="https://img.shields.io/badge/Funcionalidades-%E2%86%93-orange?style=for-the-badge" alt="Funcionalidades"/>
    </a>
  </p>
  <br/>
</div>

---

## ✨ Sobre

**Clô** é um assistente de IA que vai muito além de um chatbot. Ele **ouve**, **vê** e **conversa com você** em tempo real usando os modelos mais avançados do Google Gemini.

Construído como **PWA** (Progressive Web App), pode ser instalado na tela inicial do seu celular como um app nativo.

> 🎯 **Foco total em áudio e visão** — sem chat textual, sem firulas. Só a inteligência artificial conversando com você.

---

## 🚀 Funcionalidades

### 🎤 Modo Live (Áudio em Tempo Real)
Converse com o Clô como se fosse uma ligação. Ele ouve, processa e responde em áudio instantaneamente.

- Conexão bidirecional via WebSocket
- Áudio PCM 16kHz em tempo real
- Respostas com voz natural (Gemini TTS)
- Botão pulsando quando ativo

### 📷 Câmera Inteligente
Clô pode **ver** o que você está vendo.

- Ative a câmera do celular
- Alterne entre frontal e traseira
- Envia frames para análise durante a conversa
- "Clô, o que você está vendo?"

### 🗣️ Voz Personalizada
5 vozes diferentes para o Clô responder:

| Variação | Voz Interna | Estilo |
|----------|-------------|--------|
| Variação 1 | Zephyr | Feminina - Suave |
| Variação 2 | Kore | Feminina - Clara |
| Variação 3 | Puck | Masculina - Enérgica |
| Variação 4 | Aoede | Feminina - Expressiva |
| Variação 5 | Charon | Masculina - Profunda |

### 🎨 Temas
Troque o visual do app com um clique:

- 🔥 **Laranja** — tema padrão, vibrante
- 💖 **Pink** — rosa forte + bebê

### 📱 PWA (App Instalável)
- Instale na tela inicial do celular
- Funciona como app nativo
- Instalação é sugerida após configurar a chave API

---

## 🛠️ Stack

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 19 + TypeScript |
| **Build** | Vite 6 |
| **Estilos** | Tailwind CSS 4 |
| **Animações** | Motion |
| **Ícones** | Lucide React |
| **API Gemini** | @google/genai SDK |
| **PWA** | vite-plugin-pwa |
| **Hospedagem** | GitHub Pages |

---

## 🧠 Modelos Gemini

| Função | Modelo |
|--------|--------|
| Live (áudio) | `gemini-3.1-flash-live-preview` |
| TTS (voz) | `gemini-3.1-flash-tts-preview` |
| Chat | `gemini-3.1-flash-preview` |
| Imagem | `gemini-3.1-flash-preview` |

---

## 🔧 Como Usar

1. **Acesse** [ivansouza.github.io/Clo](https://ivansouza.github.io/Clo/)
2. **Configure sua API Key** do Google AI Studio (gratuita)
3. **Escolha a voz** do Clô nas configurações
4. **Ative o Live** e comece a conversar!
5. **Instale na tela inicial** para usar como app

> 💡 **Dica:** A chave API é validada automaticamente. Se estiver tudo certo, o app já sugere a instalação.

---

## 🏗️ Desenvolvimento

```bash
# Clonar
git clone https://github.com/ivansouza/Clo.git
cd Clo

# Instalar dependências
npm install

# Rodar em desenvolvimento
GEMINI_API_KEY="sua-chave-aqui" npm run dev

# Build de produção
GEMINI_API_KEY="sua-chave-aqui" npm run build

# Preview do build
npm run preview
```

### Estrutura

```
Clo/
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Componente principal
│   ├── index.css             # Estilos + temas
│   └── services/
│       └── geminiService.ts  # API Gemini
├── index.html
├── vite.config.ts            # Config Vite + PWA
├── package.json
└── .github/workflows/        # Deploy automático
```

---

## 📦 Deploy

O deploy é **automático** via GitHub Actions. Toda vez que você faz push na `main`:

1. O GitHub Actions roda `npm run build`
2. Faz upload da pasta `dist` para o GitHub Pages
3. Pronto! Sua versão está no ar em minutos

---

## 📜 Histórico de Versões

### v0.1.0 (25/04/2026)
- ✅ Modo Live com áudio em tempo real
- ✅ Câmera frontal/traseira com switch
- ✅ TTS com 5 vozes (Gemini 3.1 Flash)
- ✅ Temas Laranja e Pink
- ✅ Validação automática de API Key
- ✅ PWA com instalação forçada após validação
- ✅ ErrorBoundary contra tela branca
- ✅ Container responsivo (100dvh)
- ✅ Backup em branch separada

---

<div align="center">
  <br/>
  <p>Feito com ☕ e 🤖 por <a href="https://github.com/ivansouza">Ivan Souza</a></p>
  <p>
    <a href="https://github.com/ivansouza/Clo">GitHub</a> ·
    <a href="https://ivansouza.github.io/Clo/">Acessar Clô</a>
  </p>
  <br/>
</div>
