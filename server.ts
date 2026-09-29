import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
// Enable trust proxy for Cloud Run and reverse proxies
app.set('trust proxy', 1);

const PORT = parseInt(process.env.PORT || '3000', 10);
const APP_DIR = process.cwd();
const CACHE_DIR = process.env.FRENCH_TUTOR_CACHE || path.join(APP_DIR, 'cache');
const DEMO_JSON_PATH = path.join(APP_DIR, 'demo_page.json');
const LIBRARY_PATH = path.join(CACHE_DIR, 'library.json');
const TTS_CACHE_DIR = path.join(CACHE_DIR, 'tts');
const BUILD_VERSION = '20260928-multilingual-v7';

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}
if (!fs.existsSync(TTS_CACHE_DIR)) {
  fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
}

// Security: Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { error: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
    trustProxy: false,
  },
});

const analyzeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: '이미지 분석 요청 한도를 초과했습니다. 15분 후 다시 시도해주세요.' },
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
    trustProxy: false,
  },
});

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use('/api/', generalLimiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const SYSTEM_PROMPT = `You are an OCR and Multilingual Language-Learning Annotator for Korean learners.
Analyze the uploaded document or book page photo, automatically detect its source language, and transcribe it verbatim into structured learning content.

CRITICAL RULES:
1. AUTO LANGUAGE DETECTION & ZERO UNWANTED TRANSLATION:
   - Identify the primary source language in the image (e.g. English, French, Japanese, Spanish, German, Chinese, Italian, etc.).
   - NEVER translate the original foreign text into another foreign language (e.g., NEVER translate English into French or vice-versa).
   - "raw_text" and "tts_text" MUST be the exact verbatim text in the DETECTED foreign language.

2. LEARNER ANNOTATIONS (for Korean learners):
   - "translation": Natural and accurate Korean translation of the sentence.
   - "breath_marks": The original sentence with "/" inserted at natural breath pauses/thought groups for shadowing.
   - "syntax_diagram": ASCII chunk breakdown diagram explaining sentence structure & grammar in Korean (e.g. [주어] [동사] [목적어]).
   - "pronunciation_hint": Language-appropriate phonetics/rhythm/intonation tips (e.g. for English: linking/stress/flap-t; for French: liaison/enchaînement; for Japanese: pitch/furigana; for German: compound breakdown/umlaut; for Spanish: accent marks/rolling r).
   - "vocabulary": 3 to 6 key vocabulary words from this sentence with Korean meanings and pronunciation hints.

3. STRUCTURE:
   - First sentence id MUST be "s00" (title/headline). Body sentences MUST be "s01", "s02", ...
   - Spoken expansions (e.g. numbers, abbreviations) belong in "tts_text" and "full_tts_script".
   - Return ONLY a valid JSON object matching the schema below. No markdown fences.

Schema:
{
  "language": {
    "code": "BCP-47 language tag (e.g. 'en-US', 'fr-FR', 'ja-JP', 'es-ES', 'de-DE', 'zh-CN')",
    "name_ko": "Language name in Korean (e.g. '영어', '프랑스어', '일본어', '스페인어', '독일어')",
    "name_en": "Language name in English (e.g. 'English', 'French', 'Japanese', 'Spanish', 'German')",
    "flag": "Flag emoji (e.g. '🇺🇸', '🇫🇷', '🇯🇵', '🇪🇸', '🇩🇪', '🇨🇳')"
  },
  "title": "Title of the page/article in the original language",
  "full_tts_script": "Full verbatim text in the original language for continuous listening",
  "disclaimer_ko": "음성은 합성 TTS이며 원어민이 아닙니다. 발음 표기는 학습용 보조 힌트입니다.",
  "sentences": [
    {
      "id": "s00",
      "raw_text": "Original text in the detected foreign language",
      "tts_text": "Spoken form in the detected foreign language",
      "translation": "자연스러운 한국어 번역",
      "breath_marks": "Original text / with natural breath / pause markers",
      "syntax_diagram": "[주어] [동사구] [수식어] ASCII 구문 분석도",
      "pronunciation_hint": "해당 언어 맞춤 발음/연음/강세 팁",
      "vocabulary": [
        { "word": "word", "meaning": "한국어 뜻", "hint": "[발음 힌트]" }
      ]
    }
  ]
}`;

function inferLanguageFromText(text: string): { code: string; name_ko: string; name_en: string; flag: string } {
  if (/[\u3040-\u30ff]/.test(text)) {
    return { code: 'ja-JP', name_ko: '일본어', name_en: 'Japanese', flag: '🇯🇵' };
  }
  if (/[\u4e00-\u9fff]/.test(text)) {
    return { code: 'zh-CN', name_ko: '중국어', name_en: 'Chinese', flag: '🇨🇳' };
  }
  if (/[éèêëàâçîïôûùœæÉÈÊËÀÂÇÎÏÔÛÙŒÆ]/.test(text) || /\b(le|la|les|des|un|une|est|sont|dans|pour|avec)\b/i.test(text)) {
    return { code: 'fr-FR', name_ko: '프랑스어', name_en: 'French', flag: '🇫🇷' };
  }
  if (/[äöüßÄÖÜ]/.test(text) || /\b(der|die|das|und|ist|nicht|ein|eine)\b/i.test(text)) {
    return { code: 'de-DE', name_ko: '독일어', name_en: 'German', flag: '🇩🇪' };
  }
  if (/[ñáéíóúü¡¿ÑÁÉÍÓÚÜ]/.test(text) || /\b(el|la|los|las|por|para|con|como)\b/i.test(text)) {
    return { code: 'es-ES', name_ko: '스페인어', name_en: 'Spanish', flag: '🇪🇸' };
  }
  return { code: 'en-US', name_ko: '영어', name_en: 'English', flag: '🇺🇸' };
}

function findGeminiApiKey(): string | undefined {
  // Real Google / Gemini API keys start with 'AIza' or 'AQ.' and have length > 25
  const directCandidates = [
    process.env.GOOGLE_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_GENAI_API_KEY,
    process.env.API_KEY,
  ];

  for (const c of directCandidates) {
    if (c && typeof c === 'string') {
      const trimmed = c.trim();
      if ((trimmed.startsWith('AIza') || trimmed.startsWith('AQ.')) && trimmed.length > 25) {
        return trimmed;
      }
    }
  }

  // Scan all env vars for authentic keys starting with AIza or AQ.
  for (const rawVal of Object.values(process.env)) {
    if (typeof rawVal === 'string') {
      const trimmed = rawVal.trim();
      if ((trimmed.startsWith('AIza') || trimmed.startsWith('AQ.')) && trimmed.length > 25) {
        return trimmed;
      }
    }
  }

  // Fallback to direct keys if not placeholder
  if (process.env.GOOGLE_API_KEY && !process.env.GOOGLE_API_KEY.startsWith('MY_')) return process.env.GOOGLE_API_KEY.trim();
  if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('MY_')) return process.env.GEMINI_API_KEY.trim();
  return undefined;
}

function getActiveEngine(): string {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = findGeminiApiKey();
  const xaiKey = process.env.XAI_API_KEY;
  const visionProvider = (process.env.VISION_PROVIDER || (geminiKey ? 'gemini' : openRouterKey ? 'openrouter' : 'gemini')).toLowerCase();

  if (visionProvider === 'gemini' && geminiKey) {
    return 'Google Gemini Vision (' + (process.env.VISION_MODEL || 'gemini-3.8-flash') + ')';
  } else if (visionProvider === 'openrouter' && openRouterKey) {
    return 'OpenRouter ' + (process.env.OPENROUTER_MODEL || 'z-ai/glm-5.3-flash');
  } else if (visionProvider === 'xai' && xaiKey) {
    return 'xAI Grok ' + (process.env.XAI_VISION_MODEL || 'grok-2-vision-1212');
  } else if (geminiKey) {
    return 'Google Gemini Vision (' + (process.env.VISION_MODEL || 'gemini-3.8-flash') + ')';
  }
  return '미설정 (데모 가능)';
}

function loadLibrary(): any[] {
  if (!fs.existsSync(LIBRARY_PATH)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(LIBRARY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLibrary(items: any[]) {
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(items, null, 2), 'utf-8');
}

function normalizePage(data: any): any {
  if (!data || typeof data !== 'object') {
    throw new Error('Vision response is not an object');
  }

  let sentences: any[] = [];
  if (Array.isArray(data.sentences)) sentences = data.sentences;
  else if (Array.isArray(data.items)) sentences = data.items;
  else if (Array.isArray(data.lines)) sentences = data.lines;
  else if (Array.isArray(data.paragraphs)) sentences = data.paragraphs;
  else if (Array.isArray(data.page?.sentences)) sentences = data.page.sentences;

  const cleaned = sentences.map((sent, i) => {
    if (typeof sent === 'string') sent = { raw_text: sent };
    const raw = sent.raw_text || sent.text || sent.original || sent.fr || sent.french || sent.en || sent.english || '';
    const sid = sent.id || `s${String(i).padStart(2, '0')}`;
    const tts = sent.tts_text || sent.spoken || raw;
    const trans = sent.translation || sent.ko || sent.meaning || '';
    const vocab = Array.isArray(sent.vocabulary)
      ? sent.vocabulary.map((v: any) =>
          typeof v === 'string'
            ? { word: v, meaning: '', hint: '' }
            : { word: String(v.word || ''), meaning: String(v.meaning || ''), hint: String(v.hint || '') }
        )
      : [{ word: raw.split(' ')[0] || '단어', meaning: '핵심 어휘', hint: '' }];

    const pronHint = String(sent.pronunciation_hint || sent.liaison_hint || '').trim();

    return {
      id: String(sid),
      raw_text: String(raw).trim(),
      tts_text: String(tts || raw).trim(),
      translation: String(trans).trim(),
      breath_marks: String(sent.breath_marks || raw).trim(),
      syntax_diagram: String(sent.syntax_diagram || raw).trim(),
      pronunciation_hint: pronHint,
      liaison_hint: pronHint,
      vocabulary: vocab,
    };
  }).filter(s => s.raw_text.length > 0);

  let title = String(data.title || '').trim();
  if (!title && cleaned.length > 0) {
    title = cleaned[0].raw_text.slice(0, 80);
  }

  const hasS00 = cleaned.some(s => s.id === 's00');
  if (!hasS00 && title) {
    cleaned.unshift({
      id: 's00',
      raw_text: title,
      tts_text: title,
      translation: '제목 / 헤드라인',
      breath_marks: title,
      syntax_diagram: `[제목] ${title}`,
      pronunciation_hint: '',
      liaison_hint: '',
      vocabulary: [{ word: title.split(' ')[0] || title, meaning: '제목', hint: '' }],
    });
  }

  // Detect and resolve language info: Vision output takes priority; regex heuristic is fallback
  const combinedText = cleaned.map(s => s.raw_text).join(' ');
  const rawLang = data.language && typeof data.language === 'object' ? data.language : {};
  let language = { code: '', name_ko: '', name_en: '', flag: '' };

  if (rawLang.code && rawLang.name_ko) {
    language = {
      code: String(rawLang.code),
      name_ko: String(rawLang.name_ko),
      name_en: String(rawLang.name_en || rawLang.code),
      flag: String(rawLang.flag || '🌐'),
    };
  } else {
    const fallbackLang = inferLanguageFromText(combinedText);
    language = {
      code: String(rawLang.code || fallbackLang.code),
      name_ko: String(rawLang.name_ko || fallbackLang.name_ko),
      name_en: String(rawLang.name_en || fallbackLang.name_en),
      flag: String(rawLang.flag || fallbackLang.flag),
    };
  }

  const fullTts = String(data.full_tts_script || cleaned.map(s => s.tts_text || s.raw_text).join(' ')).trim();

  return {
    language,
    title,
    full_tts_script: fullTts,
    disclaimer_ko: data.disclaimer_ko || '음성은 합성 TTS이며 원어민이 아닙니다. 발음 표기는 학습용 보조 힌트입니다.',
    sentences: cleaned,
  };
}

function extractJson(text: string): any {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  let jsonStr = fenceMatch ? fenceMatch[1] : trimmed;
  if (!fenceMatch) {
    const start = jsonStr.indexOf('{');
    const end = jsonStr.lastIndexOf('}');
    if (start >= 0 && end > start) {
      jsonStr = jsonStr.substring(start, end + 1);
    }
  }
  const parsed = JSON.parse(jsonStr);
  return normalizePage(parsed);
}

let lastTtsError = '';

// In-Flight TTS Deduplication Map
const inFlightTts = new Map<string, Promise<{ buffer: Buffer; mimeType: string; hash: string } | null>>();

// Ensure raw PCM audio from Gemini has valid RIFF WAV header for browser audio playback
function ensureWavHeader(rawBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitDepth = 16): any {
  if (rawBuffer.length >= 4 && rawBuffer.toString('ascii', 0, 4) === 'RIFF') {
    return rawBuffer;
  }
  const dataSize = rawBuffer.length;
  const header = Buffer.alloc(44);
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20);  // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, rawBuffer]);
}

// Gemini High-Fidelity Native TTS Engine (gemini-3.8-flash-lite-tts)
async function generateGeminiSpeech(
  text: string,
  langName?: string,
  voiceName: string = 'Kore',
  speed: string = '1.0'
): Promise<{ buffer: Buffer; mimeType: string; hash: string } | null> {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;

  const normalizedSpeed = String(speed || '1.0').trim().toLowerCase();

  // Check persistent disk cache first (including speed in the hash)
  const hash = crypto
    .createHash('sha256')
    .update(`${cleanText}_${langName || 'default'}_${voiceName}_${normalizedSpeed}`)
    .digest('hex');
  const cacheFile = path.join(TTS_CACHE_DIR, `${hash}.wav`);

  if (fs.existsSync(cacheFile)) {
    try {
      const buffer = fs.readFileSync(cacheFile);
      if (buffer.length > 200) {
        return { buffer, mimeType: 'audio/wav', hash };
      }
    } catch {}
  }

  // Deduplicate in-flight concurrent requests for identical TTS text
  if (inFlightTts.has(hash)) {
    return inFlightTts.get(hash)!;
  }

  const geminiKey = findGeminiApiKey();
  if (!geminiKey) {
    lastTtsError = 'Gemini API key is not available in environment';
    console.warn(lastTtsError);
    return null;
  }

  const speechPromise = (async () => {
    try {
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const langLabel = langName ? `native ${langName}` : 'native';
      let promptStyle = '';

      if (normalizedSpeed === '0.5' || normalizedSpeed === 'slowest') {
        promptStyle = `Speak very slowly and deliberately at a 0.5x beginner pace, carefully pronouncing every single phoneme in authentic ${langLabel}, with clear pauses between thought groups.`;
      } else if (normalizedSpeed === '0.75' || normalizedSpeed === 'slow') {
        promptStyle = `Speak slowly and clearly at a 0.75x relaxed learner pace in authentic ${langLabel}.`;
      } else {
        promptStyle = `Natural, articulate, and expressive ${langLabel} speaker with authentic pronunciation and proper cadence.`;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: promptStyle,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
            },
          },
        },
      });

      const candidate = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = candidate?.inlineData?.data;

      if (base64Audio) {
        let buffer = Buffer.from(base64Audio, 'base64');
        buffer = ensureWavHeader(buffer);
        try {
          fs.writeFileSync(cacheFile, buffer);
        } catch (err) {
          console.warn('Failed to cache TTS file:', err);
        }
        return { buffer, mimeType: 'audio/wav', hash };
      } else {
        lastTtsError = 'Candidate returned no inlineData audio';
      }
    } catch (err: any) {
      lastTtsError = err.message || String(err);
      console.error('Gemini TTS synthesis failed:', err.message);
    } finally {
      inFlightTts.delete(hash);
    }
    return null;
  })();

  inFlightTts.set(hash, speechPromise);
  return speechPromise;
}

// API Routes
app.get('/api/status', (_req: Request, res: Response) => {
  const openRouterKey = !!process.env.OPENROUTER_API_KEY;
  const geminiKey = !!findGeminiApiKey();
  const xaiKey = !!process.env.XAI_API_KEY;

  const openRouterModel = process.env.OPENROUTER_MODEL || 'z-ai/glm-5.3-flash';
  const geminiModel = process.env.VISION_MODEL || 'gemini-3.8-flash';
  const xaiModel = process.env.XAI_VISION_MODEL || 'grok-2-vision-1212';

  const availableProviders = [];

  if (geminiKey) {
    availableProviders.push({
      id: 'gemini',
      name: `Google Gemini (${geminiModel})`,
      model: geminiModel,
      available: true,
    });
  }

  if (openRouterKey) {
    availableProviders.push({
      id: 'openrouter',
      name: `OpenRouter (${openRouterModel})`,
      model: openRouterModel,
      available: true,
    });
  }

  if (xaiKey) {
    availableProviders.push({
      id: 'xai',
      name: `xAI Grok (${xaiModel})`,
      model: xaiModel,
      available: true,
    });
  }

  // Default selection: Prefer Gemini as top/default model unless VISION_PROVIDER overrides
  let defaultProvider = 'gemini';
  if (process.env.VISION_PROVIDER) {
    defaultProvider = process.env.VISION_PROVIDER.toLowerCase();
  } else if (geminiKey) {
    defaultProvider = 'gemini';
  } else if (openRouterKey) {
    defaultProvider = 'openrouter';
  }

  const activeOption = availableProviders.find(p => p.id === defaultProvider) || availableProviders[0];

  res.json({
    activeEngine: activeOption ? activeOption.name : getActiveEngine(),
    currentProvider: activeOption ? activeOption.id : defaultProvider,
    currentModel: activeOption ? activeOption.model : '',
    build: BUILD_VERSION,
    hasGemini: geminiKey,
    hasOpenRouter: openRouterKey,
    hasXAI: xaiKey,
    availableProviders,
  });
});

app.get('/api/demo', (_req: Request, res: Response) => {
  const demoPath = fs.existsSync(path.join(CACHE_DIR, 'demo-arc', 'page.json'))
    ? path.join(CACHE_DIR, 'demo-arc', 'page.json')
    : DEMO_JSON_PATH;

  if (!fs.existsSync(demoPath)) {
    return res.status(404).json({ error: 'Demo file not found' });
  }

  try {
    const raw = fs.readFileSync(demoPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.language) {
      data.language = { code: 'fr-FR', name_ko: '프랑스어', name_en: 'French', flag: '🇫🇷' };
    }

    const langParam = data.language?.name_en || 'French';
    const fullText = (data.sentences || []).map((s: any) => s.tts_text || s.raw_text).join(' ');
    const audioFiles: Record<string, string> = {
      'lecture_complete.mp3': `/api/tts?text=${encodeURIComponent(fullText)}&lang=${encodeURIComponent(langParam)}`,
    };
    (data.sentences || []).forEach((s: any) => {
      audioFiles[`${s.id}.mp3`] = `/api/tts?text=${encodeURIComponent(s.tts_text || s.raw_text)}&lang=${encodeURIComponent(langParam)}`;
    });

    res.json({
      key: 'demo-arc',
      page: data,
      photoUrl: null,
      audioFiles,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/library', (_req: Request, res: Response) => {
  const lib = loadLibrary();
  res.json(lib);
});

app.get('/api/lesson/:key', (req: Request, res: Response) => {
  const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const safeKey = String(rawKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const lessonFolder = path.join(CACHE_DIR, safeKey);
  const pagePath = path.join(lessonFolder, 'page.json');

  if (!fs.existsSync(pagePath)) {
    return res.status(404).json({ error: 'Lesson not found' });
  }

  try {
    const page = JSON.parse(fs.readFileSync(pagePath, 'utf-8'));
    const photoExists = fs.existsSync(path.join(lessonFolder, 'page.jpg'));
    const photoUrl = photoExists ? `/api/photo/${safeKey}` : null;

    // Check available audio files or provide Gemini TTS endpoints
    const audioFiles: Record<string, string> = {};
    if (fs.existsSync(lessonFolder)) {
      const files = fs.readdirSync(lessonFolder);
      for (const f of files) {
        if (f.endsWith('.mp3') || f.endsWith('.wav')) {
          audioFiles[f] = `/api/audio/${safeKey}/${f}`;
        }
      }
    }

    const langParam = page.language?.name_en || page.language?.code || '';
    if (!audioFiles['lecture_complete.mp3'] && !audioFiles['lecture_complete.wav']) {
      const fullText = (page.sentences || []).map((s: any) => s.tts_text || s.raw_text).join(' ');
      if (fullText) {
        audioFiles['lecture_complete.mp3'] = `/api/tts?text=${encodeURIComponent(fullText)}&lang=${encodeURIComponent(langParam)}`;
      }
    }

    (page.sentences || []).forEach((s: any) => {
      if (!audioFiles[`${s.id}.mp3`] && !audioFiles[`${s.id}.wav`]) {
        audioFiles[`${s.id}.mp3`] = `/api/tts?text=${encodeURIComponent(s.tts_text || s.raw_text)}&lang=${encodeURIComponent(langParam)}`;
      }
    });

    res.json({
      key: safeKey,
      page,
      photoUrl,
      audioFiles,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/lesson/:key', (req: Request, res: Response) => {
  const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const safeKey = String(rawKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeKey) {
    return res.status(400).json({ error: '유효하지 않은 키입니다.' });
  }

  // Hardcoded defense: Prevent deletion of default demo lesson
  if (safeKey === 'demo-arc') {
    return res.status(403).json({ error: '기본 데모 교재(demo-arc)는 삭제할 수 없습니다.' });
  }

  // Delete cached directory if it exists
  const lessonFolder = path.join(CACHE_DIR, safeKey);
  if (fs.existsSync(lessonFolder)) {
    try {
      fs.rmSync(lessonFolder, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to delete lesson folder from disk', e);
    }
  }

  // Remove from library.json
  const currentLib = loadLibrary();
  const updatedLib = currentLib.filter((item: any) => item.key !== safeKey);
  saveLibrary(updatedLib);

  res.json({ success: true, key: safeKey, remaining: updatedLib.length });
});

app.get('/api/photo/:key', (req: Request, res: Response) => {
  const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const safeKey = String(rawKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const photoPath = path.join(CACHE_DIR, safeKey, 'page.jpg');

  if (!fs.existsSync(photoPath)) {
    return res.status(404).json({ error: 'Photo not found' });
  }

  res.setHeader('Content-Type', 'image/jpeg');
  fs.createReadStream(photoPath).pipe(res);
});

app.get('/api/audio/:key/:file', (req: Request, res: Response) => {
  const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const rawFile = Array.isArray(req.params.file) ? req.params.file[0] : req.params.file;
  const safeKey = String(rawKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeFile = String(rawFile || '').replace(/[^a-zA-Z0-9_.-]/g, '');
  const filePath = path.join(CACHE_DIR, safeKey, safeFile);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }

  const stat = fs.statSync(filePath);
  const total = stat.size;
  const range = req.headers.range;
  const ext = path.extname(safeFile).toLowerCase();
  const contentType = ext === '.wav' ? 'audio/wav' : 'audio/mpeg';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const partialStart = parts[0];
    const partialEnd = parts[1];

    const start = parseInt(partialStart, 10);
    const end = partialEnd ? parseInt(partialEnd, 10) : total - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// Stream cached TTS audio by hash (/api/tts/:hash)
app.get('/api/tts/:hash', (req: Request, res: Response) => {
  const rawHash = req.params.hash;
  const safeHash = String(rawHash || '').replace(/[^a-fA-F0-9]/g, '');
  if (!safeHash) {
    return res.status(400).json({ error: '유효하지 않은 오디오 해시입니다.' });
  }

  const audioPath = path.join(TTS_CACHE_DIR, `${safeHash}.wav`);
  if (!fs.existsSync(audioPath)) {
    return res.status(404).json({ error: '오디오 파일을 찾을 수 없습니다.' });
  }

  const stat = fs.statSync(audioPath);
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  fs.createReadStream(audioPath).pipe(res);
});

// Prepare TTS via POST (avoids 414 URI Too Long)
app.post('/api/tts/prepare', async (req: Request, res: Response) => {
  const rawText = String(req.body.text || '').trim();
  const rawLang = String(req.body.lang || '').trim();
  const rawVoice = String(req.body.voice || 'Kore').trim();
  const rawSpeed = String(req.body.speed || req.body.rate || '1.0').trim();

  if (!rawText) {
    return res.status(400).json({ error: 'Text parameter is required' });
  }

  try {
    const result = await generateGeminiSpeech(rawText, rawLang, rawVoice, rawSpeed);
    if (!result) {
      return res.status(500).json({ error: 'Gemini TTS generation failed' });
    }

    return res.json({
      hash: result.hash,
      audioUrl: `/api/tts/${result.hash}`,
    });
  } catch (err: any) {
    console.error('Error in /api/tts/prepare:', err);
    res.status(500).json({ error: err.message });
  }
});

// Gemini TTS API - Legacy GET/POST fallback
app.get('/api/tts', async (req: Request, res: Response) => {
  const rawText = String(req.query.text || '').trim();
  const rawLang = String(req.query.lang || '').trim();
  const rawVoice = String(req.query.voice || 'Kore').trim();
  const rawSpeed = String(req.query.speed || req.query.rate || '1.0').trim();

  if (!rawText) {
    return res.status(400).json({ error: 'Text query parameter is required' });
  }

  try {
    const result = await generateGeminiSpeech(rawText, rawLang, rawVoice, rawSpeed);
    if (!result) {
      return res.status(500).json({ error: 'Gemini TTS generation failed' });
    }

    res.setHeader('Content-Type', result.mimeType || 'audio/wav');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(result.buffer);
  } catch (err: any) {
    console.error('Error in /api/tts GET:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tts', async (req: Request, res: Response) => {
  const rawText = String(req.body.text || '').trim();
  const rawLang = String(req.body.lang || '').trim();
  const rawVoice = String(req.body.voice || 'Kore').trim();
  const rawSpeed = String(req.body.speed || req.body.rate || '1.0').trim();

  if (!rawText) {
    return res.status(400).json({ error: 'Text parameter is required' });
  }

  try {
    const result = await generateGeminiSpeech(rawText, rawLang, rawVoice, rawSpeed);
    if (!result) {
      return res.status(500).json({ error: 'Gemini TTS generation failed' });
    }

    res.setHeader('Content-Type', result.mimeType || 'audio/wav');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(result.buffer);
  } catch (err: any) {
    console.error('Error in /api/tts POST:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/analyze', analyzeLimiter, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    let imageBuffer: Buffer | null = null;

    if (req.file) {
      imageBuffer = req.file.buffer;
    } else if (req.body.imageBase64) {
      const b64Data = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(b64Data, 'base64');
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const digest = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const cacheKey = digest.slice(0, 16);
    const lessonFolder = path.join(CACHE_DIR, cacheKey);
    const pageJsonFile = path.join(lessonFolder, 'page.json');

    // 1. Check disk cache
    if (fs.existsSync(pageJsonFile)) {
      const cachedData = JSON.parse(fs.readFileSync(pageJsonFile, 'utf-8'));
      const langParam = cachedData.language?.name_en || cachedData.language?.code || '';
      const audioFiles: Record<string, string> = {
        'lecture_complete.mp3': `/api/tts?text=${encodeURIComponent((cachedData.sentences || []).map((s: any) => s.tts_text || s.raw_text).join(' '))}&lang=${encodeURIComponent(langParam)}`,
      };
      (cachedData.sentences || []).forEach((s: any) => {
        audioFiles[`${s.id}.mp3`] = `/api/tts?text=${encodeURIComponent(s.tts_text || s.raw_text)}&lang=${encodeURIComponent(langParam)}`;
      });

      return res.json({
        key: cacheKey,
        page: cachedData,
        photoUrl: `/api/photo/${cacheKey}`,
        audioFiles,
        reused: true,
        message: '이미 분석한 사진입니다. 캐시를 재사용합니다.',
      });
    }

    // 2. Perform OCR analysis
    const base64Image = imageBuffer.toString('base64');
    let pageData: any = null;

    // Determine target provider: client preference > env override > openrouter (if key exists) > gemini > xai
    let chosenProvider = (req.body.provider || '').toLowerCase();
    if (!chosenProvider) {
      if (process.env.VISION_PROVIDER) {
        chosenProvider = process.env.VISION_PROVIDER.toLowerCase();
      } else if (process.env.OPENROUTER_API_KEY) {
        chosenProvider = 'openrouter';
      } else if (process.env.GEMINI_API_KEY) {
        chosenProvider = 'gemini';
      } else if (process.env.XAI_API_KEY) {
        chosenProvider = 'xai';
      }
    }

    if (chosenProvider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
      const model = req.body.model || process.env.OPENROUTER_MODEL || 'z-ai/glm-5.3-flash';
      console.log(`[OCR] Analyzing with OpenRouter model: ${model}`);

      const fetchResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://github.com/fhdps89/AILanguageTutor',
          'X-Title': 'AILanguageTutor',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Detect the source language of this document/book page photo and transcribe it verbatim into the required JSON learning structure with Korean learner annotations.' },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
              ],
            },
          ],
        }),
      });

      if (!fetchResp.ok) {
        const errText = await fetchResp.text();
        throw new Error(`OpenRouter 오류 (${fetchResp.status}): ${errText.slice(0, 300)}`);
      }

      const jsonResp: any = await fetchResp.json();
      const content = jsonResp.choices?.[0]?.message?.content || '';
      pageData = extractJson(content);
    } else if (chosenProvider === 'xai' && process.env.XAI_API_KEY) {
      const model = req.body.model || process.env.XAI_VISION_MODEL || 'grok-2-vision-1212';
      console.log(`[OCR] Analyzing with xAI Grok model: ${model}`);

      const fetchResp = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Detect the source language of this document/book page photo and transcribe it verbatim into the required JSON learning structure with Korean learner annotations.' },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
              ],
            },
          ],
        }),
      });

      if (!fetchResp.ok) {
        const errText = await fetchResp.text();
        throw new Error(`xAI Grok 오류 (${fetchResp.status}): ${errText.slice(0, 300)}`);
      }

      const jsonResp: any = await fetchResp.json();
      const content = jsonResp.choices?.[0]?.message?.content || '';
      pageData = extractJson(content);
    } else if (findGeminiApiKey()) {
      const gKey = findGeminiApiKey()!;
      const ai = new GoogleGenAI({ apiKey: gKey });
      const primaryModel = req.body.model || process.env.VISION_MODEL || 'gemini-3.8-flash';
      const fallbackModels = Array.from(new Set([primaryModel, 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash']));
      
      const prompt = `${SYSTEM_PROMPT}\n\nDetect the source language of this document/book page photo and transcribe it verbatim into the required JSON learning structure with Korean learner annotations.`;
      let lastError: any = null;

      for (const modelCandidate of fallbackModels) {
        try {
          console.log(`[OCR] Attempting Google Gemini analysis with model: ${modelCandidate}`);
          const response = await ai.models.generateContent({
            model: modelCandidate,
            contents: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Image,
                },
              },
            ],
            config: {
              responseMimeType: 'application/json',
              temperature: 0,
            },
          });

          const responseText = response.text || '';
          pageData = extractJson(responseText);
          console.log(`[OCR] Successfully analyzed image with model: ${modelCandidate}`);
          break; // Success!
        } catch (err: any) {
          console.warn(`[OCR] Model ${modelCandidate} failed/timed out:`, err.message || err);
          lastError = err;
        }
      }

      if (!pageData) {
        throw new Error(`Gemini 모델 분석 실패: ${lastError?.message || '모든 Gemini 모델 응답 불가'}`);
      }
    } else {
      return res.status(400).json({
        error: 'Vision API 키가 설정되지 않았습니다. .env에 GEMINI_API_KEY 또는 OPENROUTER_API_KEY를 설정하거나 상단 [데모]를 이용해주세요.',
      });
    }

    // 3. Persist lesson
    fs.mkdirSync(lessonFolder, { recursive: true });
    fs.writeFileSync(pageJsonFile, JSON.stringify(pageData, null, 2), 'utf-8');
    fs.writeFileSync(path.join(lessonFolder, 'page.jpg'), imageBuffer);

    // 4. Update library
    const lib = loadLibrary().filter(item => item.key !== cacheKey);
    const title = pageData.title || `Lesson ${cacheKey}`;
    const row = {
      key: cacheKey,
      title: `${title}_${new Date().toISOString().slice(0, 10)}`,
      book_title: title,
      page_no: 1,
      created_at: new Date().toISOString(),
      source: 'photo',
      n_sentences: pageData.sentences?.length || 0,
      saved_at: new Date().toISOString(),
      language: pageData.language,
    };
    lib.unshift(row);
    saveLibrary(lib.slice(0, 50));

    const langParam = pageData.language?.name_en || pageData.language?.code || '';
    const audioFiles: Record<string, string> = {
      'lecture_complete.mp3': `/api/tts?text=${encodeURIComponent((pageData.sentences || []).map((s: any) => s.tts_text || s.raw_text).join(' '))}&lang=${encodeURIComponent(langParam)}`,
    };
    (pageData.sentences || []).forEach((s: any) => {
      audioFiles[`${s.id}.mp3`] = `/api/tts?text=${encodeURIComponent(s.tts_text || s.raw_text)}&lang=${encodeURIComponent(langParam)}`;
    });

    // Background warming of Gemini native TTS audio
    setTimeout(async () => {
      try {
        const fullText = (pageData.sentences || []).map((s: any) => s.tts_text || s.raw_text).join(' ');
        if (fullText) await generateGeminiSpeech(fullText, langParam);
        for (const s of (pageData.sentences || []).slice(0, 6)) {
          await generateGeminiSpeech(s.tts_text || s.raw_text, langParam);
        }
      } catch (e) {
        console.warn('Background TTS warming error:', e);
      }
    }, 50);

    res.json({
      key: cacheKey,
      page: pageData,
      photoUrl: `/api/photo/${cacheKey}`,
      audioFiles,
      reused: false,
    });
  } catch (err: any) {
    console.error('Analyze error:', err);
    res.status(500).json({ error: err.message || '사진 분석 중 오류가 발생했습니다.' });
  }
});

// Setup Vite in Dev or serve build in Prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(APP_DIR, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AI Language Tutor] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
