import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const APP_DIR = process.cwd();
const CACHE_DIR = process.env.FRENCH_TUTOR_CACHE || path.join(APP_DIR, 'cache');
const DEMO_JSON_PATH = path.join(APP_DIR, 'demo_page.json');
const LIBRARY_PATH = path.join(CACHE_DIR, 'library.json');
const BUILD_VERSION = '20260927-libname';

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
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

function getActiveEngine(): string {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;
  const xaiKey = process.env.XAI_API_KEY;
  const visionProvider = (process.env.VISION_PROVIDER || (openRouterKey ? 'openrouter' : 'gemini')).toLowerCase();

  if (visionProvider === 'openrouter' && openRouterKey) {
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

  // Detect and resolve language info
  const combinedText = cleaned.map(s => s.raw_text).join(' ');
  const fallbackLang = inferLanguageFromText(combinedText);
  const rawLang = data.language && typeof data.language === 'object' ? data.language : {};

  const language = {
    code: String(rawLang.code || fallbackLang.code),
    name_ko: String(rawLang.name_ko || fallbackLang.name_ko),
    name_en: String(rawLang.name_en || fallbackLang.name_en),
    flag: String(rawLang.flag || fallbackLang.flag),
  };

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

// API Routes
app.get('/api/status', (_req: Request, res: Response) => {
  const openRouterKey = !!process.env.OPENROUTER_API_KEY;
  const geminiKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY);
  const xaiKey = !!process.env.XAI_API_KEY;

  const openRouterModel = process.env.OPENROUTER_MODEL || 'z-ai/glm-5.3-flash';
  const geminiModel = process.env.VISION_MODEL || 'gemini-3.8-flash';
  const xaiModel = process.env.XAI_VISION_MODEL || 'grok-2-vision-1212';

  const availableProviders = [];

  if (openRouterKey) {
    availableProviders.push({
      id: 'openrouter',
      name: `OpenRouter (${openRouterModel})`,
      model: openRouterModel,
      available: true,
    });
  }

  if (geminiKey) {
    availableProviders.push({
      id: 'gemini',
      name: `Google Gemini (${geminiModel})`,
      model: geminiModel,
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

  // Default selection: If OPENROUTER_API_KEY is configured, default to OpenRouter unless VISION_PROVIDER overrides
  let defaultProvider = 'gemini';
  if (process.env.VISION_PROVIDER) {
    defaultProvider = process.env.VISION_PROVIDER.toLowerCase();
  } else if (openRouterKey) {
    defaultProvider = 'openrouter';
  } else if (geminiKey) {
    defaultProvider = 'gemini';
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
    res.json({
      key: 'demo-arc',
      page: data,
      photoUrl: null,
      audioPaths: {
        lecture: '/api/audio/demo-arc/lecture_complete.mp3',
      },
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

    // Check available audio files
    const audioFiles: Record<string, string> = {};
    if (fs.existsSync(lessonFolder)) {
      const files = fs.readdirSync(lessonFolder);
      for (const f of files) {
        if (f.endsWith('.mp3')) {
          audioFiles[f] = `/api/audio/${safeKey}/${f}`;
        }
      }
    }

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
      'Content-Type': 'audio/mpeg',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': total,
      'Content-Type': 'audio/mpeg',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

app.post('/api/analyze', upload.single('photo'), async (req: Request, res: Response) => {
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
      return res.json({
        key: cacheKey,
        page: cachedData,
        photoUrl: `/api/photo/${cacheKey}`,
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
    } else if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY) {
      const gKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY;
      const ai = new GoogleGenAI({ apiKey: gKey });
      const model = req.body.model || process.env.VISION_MODEL || 'gemini-3.8-flash';
      console.log(`[OCR] Analyzing with Google Gemini model: ${model}`);
      const prompt = `${SYSTEM_PROMPT}\n\nDetect the source language of this document/book page photo and transcribe it verbatim into the required JSON learning structure with Korean learner annotations.`;

      const response = await ai.models.generateContent({
        model,
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
