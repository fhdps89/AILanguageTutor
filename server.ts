import express, { Request, Response } from 'express';
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
app.set('trust proxy', 1);

const PORT = parseInt(process.env.PORT || '3000', 10);
const APP_DIR = process.cwd();
const CACHE_DIR = process.env.FRENCH_TUTOR_CACHE || path.join(APP_DIR, 'cache');
const DEMO_JSON_PATH = path.join(APP_DIR, 'demo_page.json');
const LIBRARY_PATH = path.join(CACHE_DIR, 'library.json');
const TTS_CACHE_DIR = path.join(CACHE_DIR, 'tts');
const BUILD_VERSION = '20260930-gemini-single';

// Ensure required directories exist
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}
if (!fs.existsSync(TTS_CACHE_DIR)) {
  fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
}

// Security: Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
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
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

// Cache API key lookup at startup
let cachedGeminiApiKey: string | undefined = undefined;

function getCachedGeminiApiKey(): string | undefined {
  if (cachedGeminiApiKey) return cachedGeminiApiKey;

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
        cachedGeminiApiKey = trimmed;
        return cachedGeminiApiKey;
      }
    }
  }

  for (const rawVal of Object.values(process.env)) {
    if (typeof rawVal === 'string') {
      const trimmed = rawVal.trim();
      if ((trimmed.startsWith('AIza') || trimmed.startsWith('AQ.')) && trimmed.length > 25) {
        cachedGeminiApiKey = trimmed;
        return cachedGeminiApiKey;
      }
    }
  }

  if (process.env.GOOGLE_API_KEY && !process.env.GOOGLE_API_KEY.startsWith('MY_')) {
    cachedGeminiApiKey = process.env.GOOGLE_API_KEY.trim();
    return cachedGeminiApiKey;
  }
  if (process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('MY_')) {
    cachedGeminiApiKey = process.env.GEMINI_API_KEY.trim();
    return cachedGeminiApiKey;
  }

  return undefined;
}

// Singleton GoogleGenAI Client
let genAIInstance: GoogleGenAI | null = null;
function getGenAIClient(): GoogleGenAI | null {
  const key = getCachedGeminiApiKey();
  if (!key) return null;
  if (!genAIInstance) {
    genAIInstance = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIInstance;
}

const SYSTEM_PROMPT = `You are an expert OCR and Multilingual Language-Learning Annotator.
Analyze the uploaded document or book page photo, automatically detect its source language, and transcribe it verbatim into structured learning content.

CRITICAL RULES:
1. AUTO LANGUAGE DETECTION:
   - Identify the primary language of the text (Korean 'ko', French 'fr-FR', English 'en-US', Japanese 'ja-JP', German 'de-DE', Spanish 'es-ES', Chinese 'zh-CN', etc.).
   - NEVER translate the original source text into another foreign language in "raw_text" and "tts_text". They MUST be the exact verbatim text in the source language.

2. CASE A: KOREAN SOURCE TEXT (Learning Korean for English/Global learners):
   - If the main printed text is in Korean (book, magazine, article):
     * "translation": Natural and accurate English translation.
     * "sound_romanization": Exact spoken phonetic romanization (ONE single representation reflecting actual assimilation/liaison, e.g. "gieop-ui seongjang-eun haruachim-e irueojiji anki ttaemun-ida"). Never show dual romanization. For already-English words like "FOMO" or loanwords like "인베스팅" (investing), keep them clean and natural.
     * "korean_chunks": Array of meaningful grammatical chunks with particle/inflection breakdown.
     * "formality_badge": ONLY tag if there is a distinct sentence-ending speech level ("Formal (하십시오체)", "Polite (해요체)", "Casual (반말)"). Neutral written descriptive endings (-다, -이다, -ㄴ다) MUST return null.
     * "vocabulary": Array of { "word", "meaning" (English), "baseForm", "pos", "hint" }.
     * STRICT OPTICAL DEFENSE: Ignore faint bleed-through text from reverse side; strip footnote asterisks; if the last sentence is cut off, transcribe only visible text with ellipsis.

3. CASE B: FOREIGN SOURCE TEXT (Learning Foreign language for Korean learners):
   - If the source is French, English, Japanese, German, Spanish, etc.:
     * "translation": Natural and accurate Korean translation.
     * "breath_marks": The original sentence with "/" inserted at natural breath pauses/thought groups.
     * "syntax_diagram": ASCII chunk breakdown diagram explaining sentence structure in Korean.
     * "pronunciation_hint": Language-appropriate phonetics/rhythm/intonation tips.
     * "vocabulary": Key vocabulary words with Korean meanings.

4. STRUCTURE:
   - First sentence id MUST be "s00" (title/headline if present; if no distinct header, start directly with "s01").
   - Spoken expansions belong in "tts_text" and "full_tts_script".
   - Return ONLY a valid JSON object matching the schema below. No markdown fences.

Schema:
{
  "language": {
    "code": "BCP-47 code (e.g. 'ko', 'en-US', 'fr-FR', 'ja-JP', 'es-ES', 'de-DE', 'zh-CN')",
    "name_ko": "Language name in Korean (e.g. '한국어', '영어', '프랑스어', '일본어')",
    "name_en": "Language name in English (e.g. 'Korean', 'English', 'French', 'Japanese')",
    "flag": "Flag emoji (e.g. '🇰🇷', '🇺🇸', '🇫🇷', '🇯🇵')"
  },
  "title": "Title of the page/article in the original language",
  "full_tts_script": "Full verbatim text in the original language for continuous listening",
  "disclaimer_ko": "음성은 합성 TTS이며 원어민이 아닙니다. 발음 표기는 학습용 보조 힌트입니다.",
  "sentences": [
    {
      "id": "s01",
      "raw_text": "Original text in the detected language",
      "tts_text": "Spoken form in the detected language",
      "translation": "Natural translation (English if Korean source; Korean if foreign source)",
      "sound_romanization": "Phonetic spoken romanization (Korean mode only)",
      "korean_chunks": [
        { "text": "단어/구", "grammarRole": "조사/어미 분해 설명" }
      ],
      "formality_badge": null,
      "breath_marks": "Original text / with natural breath / pause markers",
      "syntax_diagram": "[주어] [동사구] [수식어] ASCII 구문 분석도",
      "pronunciation_hint": "발음/연음 팁",
      "vocabulary": [
        { "word": "word", "meaning": "뜻", "baseForm": "기본형", "pos": "품사", "hint": "발음힌트" }
      ]
    }
  ]
}`;

// Extract requester owner/device ID for library privacy and future Google SSO migration bridge
function getOwnerId(req: Request): string {
  const headerId = req.headers['x-device-id'];
  if (typeof headerId === 'string' && headerId.trim()) {
    return headerId.trim();
  }
  const queryId = req.query.deviceId;
  if (typeof queryId === 'string' && queryId.trim()) {
    return queryId.trim();
  }
  return 'anonymous';
}

async function loadLibraryAsync(): Promise<any[]> {
  try {
    const raw = await fs.promises.readFile(LIBRARY_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLibraryAsync(items: any[]) {
  try {
    await fs.promises.writeFile(LIBRARY_PATH, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to save library.json:', err);
  }
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

  const cleaned = sentences.map((s: any, idx: number) => {
    const raw = String(s.raw_text || s.text || s.sentence || s.french || s.korean || s.content || '').trim();
    const tts = String(s.tts_text || s.spoken || raw).trim();
    const trans = String(s.translation || s.meaning || s.korean_translation || s.english_translation || '').trim();
    const breath = String(s.breath_marks || s.chunks || s.phrasing || raw).trim();
    const syntax = String(s.syntax_diagram || s.structure || '').trim();
    const pron = String(s.pronunciation_hint || s.phonetics || s.sound_tips || '').trim();
    const liaison = String(s.liaison_hint || s.liaison || '').trim();
    const roman = s.sound_romanization ? String(s.sound_romanization).trim() : undefined;
    const formality = s.formality_badge ? String(s.formality_badge).trim() : null;

    let chunks: any[] = [];
    if (Array.isArray(s.korean_chunks)) {
      chunks = s.korean_chunks.map((chk: any) => ({
        text: String(chk.text || '').trim(),
        grammarRole: chk.grammarRole ? String(chk.grammarRole).trim() : '',
      })).filter((c: any) => c.text);
    }

    let vocab: any[] = [];
    if (Array.isArray(s.vocabulary)) {
      vocab = s.vocabulary.map((v: any) => ({
        word: String(v.word || '').trim(),
        meaning: String(v.meaning || v.translation || '').trim(),
        baseForm: v.baseForm ? String(v.baseForm).trim() : undefined,
        pos: v.pos ? String(v.pos).trim() : undefined,
        hint: v.hint ? String(v.hint).trim() : undefined,
      })).filter((v: any) => v.word);
    }

    return {
      id: s.id || `s${String(idx + 1).padStart(2, '0')}`,
      raw_text: raw,
      tts_text: tts,
      translation: trans,
      sound_romanization: roman,
      korean_chunks: chunks.length > 0 ? chunks : undefined,
      formality_badge: formality,
      breath_marks: breath,
      syntax_diagram: syntax,
      pronunciation_hint: pron,
      liaison_hint: liaison,
      vocabulary: vocab,
    };
  }).filter((s: any) => s.raw_text.length > 0);

  return {
    language: data.language || { code: 'en-US', name_ko: '영어', name_en: 'English', flag: '🇺🇸' },
    title: data.title || '학습 교재',
    full_tts_script: data.full_tts_script || cleaned.map((s: any) => s.tts_text || s.raw_text).join(' '),
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

// In-Flight TTS Deduplication Map
const inFlightTts = new Map<string, Promise<{ buffer: Buffer; mimeType: string; hash: string } | null>>();

function ensureWavHeader(rawBuffer: any, sampleRate = 24000, numChannels = 1, bitDepth = 16): any {
  if (rawBuffer && rawBuffer.length >= 4 && rawBuffer.toString('ascii', 0, 4) === 'RIFF') {
    return rawBuffer;
  }
  const dataSize = rawBuffer ? rawBuffer.length : 0;
  const header = Buffer.alloc(44);
  const blockAlign = (numChannels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
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
  let cleanText = String(text || '').trim();
  if (!cleanText) return null;

  // D2/Security: Cap TTS text to 1,000 characters to prevent disk abuse
  if (cleanText.length > 1000) {
    cleanText = cleanText.slice(0, 1000);
  }

  // Security: Speed and voice validation
  const validSpeeds = ['1.0', '0.75', '0.5'];
  const normalizedSpeed = validSpeeds.includes(speed) ? speed : '1.0';
  const safeVoice = voiceName === 'Kore' ? 'Kore' : 'Kore';

  // Check persistent disk cache
  const hash = crypto
    .createHash('sha256')
    .update(`${cleanText}_${langName || 'default'}_${safeVoice}_${normalizedSpeed}`)
    .digest('hex');
  const cacheFile = path.join(TTS_CACHE_DIR, `${hash}.wav`);

  try {
    const stats = await fs.promises.stat(cacheFile);
    if (stats.size > 200) {
      const buffer = await fs.promises.readFile(cacheFile);
      return { buffer, mimeType: 'audio/wav', hash };
    }
  } catch {}

  // Deduplicate in-flight concurrent requests for identical TTS
  if (inFlightTts.has(hash)) {
    return inFlightTts.get(hash)!;
  }

  const ai = getGenAIClient();
  if (!ai) {
    console.warn('Gemini API client is not configured');
    return null;
  }

  const speechPromise = (async () => {
    try {
      const langLabel = langName ? `native ${langName}` : 'native';
      let promptStyle = '';

      if (normalizedSpeed === '0.5') {
        promptStyle = `Speak very slowly and deliberately at a 0.5x beginner pace, carefully pronouncing every single phoneme in authentic ${langLabel}, with clear pauses between thought groups.`;
      } else if (normalizedSpeed === '0.75') {
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
              prebuiltVoiceConfig: { voiceName: safeVoice },
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
          await fs.promises.writeFile(cacheFile, buffer);
        } catch (err) {
          console.warn('Failed to cache TTS file:', err);
        }
        return { buffer, mimeType: 'audio/wav', hash };
      }
    } catch (err: any) {
      console.error('Gemini TTS synthesis failed:', err.message);
    } finally {
      inFlightTts.delete(hash);
    }
    return null;
  })();

  inFlightTts.set(hash, speechPromise);
  return speechPromise;
}

// ----------------- API Endpoints -----------------

app.get('/api/status', (_req: Request, res: Response) => {
  const geminiKey = !!getCachedGeminiApiKey();
  const visionModel = process.env.VISION_MODEL || 'gemini-3.8-flash';

  res.json({
    activeEngine: geminiKey ? `Google Gemini Vision (${visionModel})` : '미설정 (데모 가능)',
    currentProvider: 'gemini',
    currentModel: visionModel,
    build: BUILD_VERSION,
    hasGemini: geminiKey,
  });
});

app.get('/api/demo', async (_req: Request, res: Response) => {
  const demoPath = fs.existsSync(path.join(CACHE_DIR, 'demo-arc', 'page.json'))
    ? path.join(CACHE_DIR, 'demo-arc', 'page.json')
    : DEMO_JSON_PATH;

  if (!fs.existsSync(demoPath)) {
    return res.status(404).json({ error: 'Demo file not found' });
  }

  try {
    const raw = await fs.promises.readFile(demoPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.language) {
      data.language = { code: 'fr-FR', name_ko: '프랑스어', name_en: 'French', flag: '🇫🇷' };
    }

    res.json({
      key: 'demo-arc',
      page: data,
      photoUrl: null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// D1(a) Bridge: Filter library by caller's ownerId to completely prevent cross-user leak
app.get('/api/library', async (req: Request, res: Response) => {
  const callerOwnerId = getOwnerId(req);
  const fullLib = await loadLibraryAsync();

  // Return public demo-arc + lessons owned by this specific device/user
  const userLib = fullLib.filter((item) => {
    if (item.key === 'demo-arc') return true;
    if (!item.ownerId) return false; // Legacy unassigned items hidden for privacy
    return item.ownerId === callerOwnerId;
  });

  res.json(userLib);
});

// D1(a) Bridge: Verify ownership before returning lesson
app.get('/api/lesson/:key', async (req: Request, res: Response) => {
  const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const safeKey = String(rawKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const lessonFolder = path.join(CACHE_DIR, safeKey);
  const pagePath = path.join(lessonFolder, 'page.json');

  if (!fs.existsSync(pagePath)) {
    return res.status(404).json({ error: 'Lesson not found' });
  }

  // Security check: non-demo lessons must match owner
  if (safeKey !== 'demo-arc') {
    const callerOwnerId = getOwnerId(req);
    const fullLib = await loadLibraryAsync();
    const item = fullLib.find((l) => l.key === safeKey);
    if (item && item.ownerId && item.ownerId !== callerOwnerId) {
      return res.status(403).json({ error: '접근 권한이 없는 교재입니다.' });
    }
  }

  try {
    const raw = await fs.promises.readFile(pagePath, 'utf-8');
    const page = JSON.parse(raw);
    const photoExists = fs.existsSync(path.join(lessonFolder, 'page.jpg'));
    const photoUrl = photoExists ? `/api/photo/${safeKey}` : null;

    res.json({
      key: safeKey,
      page,
      photoUrl,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// D1(a) Bridge & #2 Security: Prevent unauthorized deletion
app.delete('/api/lesson/:key', async (req: Request, res: Response) => {
  const rawKey = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  const safeKey = String(rawKey || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeKey) {
    return res.status(400).json({ error: '유효하지 않은 키입니다.' });
  }

  if (safeKey === 'demo-arc') {
    return res.status(403).json({ error: '기본 데모 교재(demo-arc)는 삭제할 수 없습니다.' });
  }

  const callerOwnerId = getOwnerId(req);
  const currentLib = await loadLibraryAsync();
  const targetItem = currentLib.find((item: any) => item.key === safeKey);

  // Enforce ownership: only the creator can delete their lesson
  if (targetItem && targetItem.ownerId && targetItem.ownerId !== callerOwnerId) {
    return res.status(403).json({ error: '본인이 등록한 교재만 삭제할 수 있습니다.' });
  }

  // Delete cached directory if it exists
  const lessonFolder = path.join(CACHE_DIR, safeKey);
  if (fs.existsSync(lessonFolder)) {
    try {
      await fs.promises.rm(lessonFolder, { recursive: true, force: true });
    } catch (e) {
      console.warn('Failed to delete lesson folder from disk', e);
    }
  }

  const updatedLib = currentLib.filter((item: any) => item.key !== safeKey);
  await saveLibraryAsync(updatedLib);

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

// Stream cached TTS audio by hash (/api/tts/:hash)
app.get('/api/tts/:hash', async (req: Request, res: Response) => {
  const rawHash = req.params.hash;
  const safeHash = String(rawHash || '').replace(/[^a-fA-F0-9]/g, '');
  if (!safeHash) {
    return res.status(400).json({ error: '유효하지 않은 오디오 해시입니다.' });
  }

  const audioPath = path.join(TTS_CACHE_DIR, `${safeHash}.wav`);
  try {
    const stat = await fs.promises.stat(audioPath);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(audioPath).pipe(res);
  } catch {
    return res.status(404).json({ error: '오디오 파일을 찾을 수 없습니다.' });
  }
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

    const callerOwnerId = getOwnerId(req);
    const digest = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const cacheKey = digest.slice(0, 16);
    const lessonFolder = path.join(CACHE_DIR, cacheKey);
    const pageJsonFile = path.join(lessonFolder, 'page.json');

    // 1. Check disk cache
    if (fs.existsSync(pageJsonFile)) {
      try {
        const cachedRaw = await fs.promises.readFile(pageJsonFile, 'utf-8');
        const cachedData = JSON.parse(cachedRaw);

        return res.json({
          key: cacheKey,
          page: cachedData,
          photoUrl: `/api/photo/${cacheKey}`,
          reused: true,
          message: '이미 분석한 사진입니다. 캐시를 재사용합니다.',
        });
      } catch {}
    }

    // 2. Perform OCR analysis using Google Gemini Vision
    const ai = getGenAIClient();
    if (!ai) {
      return res.status(400).json({
        error: 'Gemini API 키가 설정되지 않았습니다. 상단 [데모]를 이용해주세요.',
      });
    }

    const base64Image = imageBuffer.toString('base64');
    const primaryModel = process.env.VISION_MODEL || 'gemini-3.8-flash';
    const fallbackModels = Array.from(new Set([primaryModel, 'gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash']));
    const prompt = `${SYSTEM_PROMPT}\n\nDetect the source language of this document/book page photo and transcribe it verbatim into the required JSON learning structure with Korean learner annotations.`;

    let pageData: any = null;
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
        break;
      } catch (err: any) {
        console.warn(`[OCR] Model ${modelCandidate} failed:`, err.message || err);
        lastError = err;
      }
    }

    if (!pageData) {
      throw new Error(`Gemini 모델 분석 실패: ${lastError?.message || '모든 Gemini 모델 응답 불가'}`);
    }

    // 3. Persist lesson
    await fs.promises.mkdir(lessonFolder, { recursive: true });
    await fs.promises.writeFile(pageJsonFile, JSON.stringify(pageData, null, 2), 'utf-8');
    await fs.promises.writeFile(path.join(lessonFolder, 'page.jpg'), imageBuffer);

    // 4. Update library with ownerId (bridge for user isolation & Google SSO)
    const currentLib = await loadLibraryAsync();
    const filteredLib = currentLib.filter(item => item.key !== cacheKey);
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
      ownerId: callerOwnerId,
    };
    filteredLib.unshift(row);
    await saveLibraryAsync(filteredLib.slice(0, 50));

    // 5. Efficient background warming: only first 3 sentences 1.0x (No wasteful full-passage synthesis)
    setTimeout(async () => {
      try {
        const langParam = pageData.language?.name_en || pageData.language?.code || '';
        for (const s of (pageData.sentences || []).slice(0, 3)) {
          await generateGeminiSpeech(s.tts_text || s.raw_text, langParam, 'Kore', '1.0');
        }
      } catch (e) {
        console.warn('Background TTS warming error:', e);
      }
    }, 100);

    res.json({
      key: cacheKey,
      page: pageData,
      photoUrl: `/api/photo/${cacheKey}`,
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
