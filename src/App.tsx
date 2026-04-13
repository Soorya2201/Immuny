import { useState, useRef, useEffect, useCallback } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import '@aws-amplify/ui-react/styles.css';
import './App.css';
import immunyLogo from './assets/immuny-logo.png';

// ─── COMPONENT IMPORTS ────────────────────────────────────────────────────────
import ProfilePage from './components/ProfilePage';
import SymptomLoggerPage from './components/SymptomLogger';
import ExposureTestingPage from './components/ExposureTesting';

// ── 🔴 WATCH SENSOR FEATURE (COMMENTED OUT — ready for future integration) ──
// import WatchStatus, { type Vitals } from './components/WatchStatus';

const client = generateClient<Schema>();

// ─── 🔗 API ENDPOINTS ─────────────────────────────────────────────────────────
const COLAB_BASE_URL = "https://available-lifestyle-additional-hunting.trycloudflare.com"; // 🔴 Replace with your Ngrok URL
const AGENT_URL = `${COLAB_BASE_URL}/agent/ask`;
const IMAGE_URL = `${COLAB_BASE_URL}/analyse-image`;

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  source?: 'nova' | 'medgemma';
  imagePreview?: string;
  quickReplies?: string[];
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

type Page = 'chat' | 'profile' | 'symptom-logger' | 'exposure-testing';

// ─── CONVERSATIONAL LOGGING STATE MACHINE ──────────────────────────────────────
type LoggingEntryType = 'Exposure' | 'Symptom' | 'Medication';

interface FieldDef {
  key: string;
  label: string;
  question: string;          // natural prompt for Nova Micro
  options?: string[];         // if present, fuzzy-match against these
  type?: 'number' | 'text' | 'select' | 'time';  // parsing hint
  optional?: boolean;
}

interface LoggingSession {
  entryType: LoggingEntryType;
  currentFieldIndex: number;
  collectedData: Record<string, string>;
  awaitingConfirmation?: boolean;  // waiting for user to confirm before submit
}

const SYMPTOM_OPTIONS = ['Hives', 'Swelling', 'Itching', 'Nausea', 'Vomiting', 'Stomach Pain', 'Difficulty Breathing', 'Dizziness', 'Headache', 'Rash', 'Other'];
const MED_ROUTE_OPTIONS = ['Oral', 'Topical', 'Injectable', 'Inhaled'];
const MED_UNIT_OPTIONS = ['mg', 'ml', 'mcg', 'units', 'puffs'];
const EXPOSURE_TYPE_OPTIONS = ['Meal', 'Product', 'Environmental', 'Other'];

const FIELD_SCRIPTS: Record<LoggingEntryType, FieldDef[]> = {
  Symptom: [
    { key: 'name', label: 'Symptom', question: 'Ask the user which symptom they are experiencing. Mention options: Hives, Swelling, Itching, Nausea, Vomiting, Stomach Pain, Difficulty Breathing, Dizziness, Headache, Rash, or Other.', type: 'select', options: SYMPTOM_OPTIONS },
    { key: 'severity', label: 'Severity', question: 'Ask the user to rate the severity of their symptom on a scale of 1 to 10.', type: 'number' },
    { key: 'bodyArea', label: 'Body Area', question: 'Ask the user which body area is affected (e.g., face, arms, throat).', type: 'text', optional: true },
    { key: 'notes', label: 'Notes', question: 'Ask the user if they have any additional notes about this symptom. They can say "skip" if none.', type: 'text', optional: true },
  ],
  Exposure: [
    { key: 'subtype', label: 'Type', question: 'Ask what type of exposure this is: Meal, Product, Environmental, or Other.', type: 'select', options: EXPOSURE_TYPE_OPTIONS },
    { key: 'name', label: 'Name', question: 'Ask the user to describe what they were exposed to (e.g., "Chicken Caesar Salad", "New lotion").', type: 'text' },
    { key: 'tags', label: 'Ingredients/Tags', question: 'Ask the user to list the key ingredients or tags, separated by commas. They can say "skip" if unsure.', type: 'text', optional: true },
    { key: 'details', label: 'Details', question: 'Ask the user for any additional details about the exposure. They can say "skip" if none.', type: 'text', optional: true },
  ],
  Medication: [
    { key: 'name', label: 'Medication Name', question: 'Ask the user which medication they took (e.g., Benadryl, EpiPen).', type: 'text' },
    { key: 'dose', label: 'Dose', question: 'Ask the user what dose they took (just the number, e.g., 25).', type: 'text' },
    { key: 'unit', label: 'Unit', question: 'Ask what unit the dose is in: mg, ml, mcg, units, or puffs.', type: 'select', options: MED_UNIT_OPTIONS },
    { key: 'route', label: 'Route', question: 'Ask how they took the medication: Oral, Topical, Injectable, or Inhaled.', type: 'select', options: MED_ROUTE_OPTIONS },
    { key: 'reason', label: 'Reason', question: 'Ask why they took this medication (e.g., allergic reaction, prevention).', type: 'text', optional: true },
    { key: 'notes', label: 'Notes', question: 'Ask the user if they have any additional notes about this medication. They can say "skip" if none.', type: 'text', optional: true },
  ],
};

// ─── INTENT DETECTION ─────────────────────────────────────────────────────────
const LOGGING_INTENT_RE: { type: LoggingEntryType; pattern: RegExp }[] = [
  { type: 'Symptom',    pattern: /\b(log|record|track|add|note|enter|save)\b[\s\w]{0,12}\b(symptom|symptoms)\b/i },
  { type: 'Exposure',   pattern: /\b(log|record|track|add|note|enter|save)\b[\s\w]{0,12}\b(exposure|meal|food|what i ate|what i eat)\b/i },
  { type: 'Medication', pattern: /\b(log|record|track|add|note|enter|save)\b[\s\w]{0,12}\b(medication|medicine|med|drug|pill)\b/i },
  // Also detect reversed phrasing: "symptom log", "i want to log"
  { type: 'Symptom',    pattern: /\b(symptom|symptoms)\b[\s\w]{0,8}\b(log|record|track)\b/i },
  { type: 'Exposure',   pattern: /\b(exposure|meal)\b[\s\w]{0,8}\b(log|record|track)\b/i },
  { type: 'Medication', pattern: /\b(medication|medicine|med)\b[\s\w]{0,8}\b(log|record|track)\b/i },
];

const detectLoggingIntent = (text: string): LoggingEntryType | null => {
  for (const { type, pattern } of LOGGING_INTENT_RE) {
    if (pattern.test(text)) return type;
  }
  return null;
};

// ─── ANSWER PARSING ───────────────────────────────────────────────────────────
const fuzzyMatch = (input: string, options: string[]): string | null => {
  const lower = input.toLowerCase().trim();
  // Exact match
  const exact = options.find(o => o.toLowerCase() === lower);
  if (exact) return exact;
  // Starts-with match
  const starts = options.find(o => o.toLowerCase().startsWith(lower));
  if (starts) return starts;
  // Contains match
  const contains = options.find(o => o.toLowerCase().includes(lower) || lower.includes(o.toLowerCase()));
  if (contains) return contains;
  return null;
};

const parseFieldAnswer = (raw: string, field: FieldDef): { value: string; valid: boolean; hint?: string } => {
  const trimmed = raw.trim();
  // Skip / none handling for optional fields
  if (field.optional && /^(skip|none|no|n\/a|nothing|pass)$/i.test(trimmed)) {
    return { value: '', valid: true };
  }
  // Cancel detection
  if (/^(cancel|stop|quit|exit|abort|nevermind)$/i.test(trimmed)) {
    return { value: '__CANCEL__', valid: true };
  }

  if (field.type === 'select' && field.options) {
    const matched = fuzzyMatch(trimmed, field.options);
    if (matched) return { value: matched, valid: true };
    return { value: '', valid: false, hint: `Please choose one of: ${field.options.join(', ')}` };
  }
  if (field.type === 'number') {
    const num = trimmed.match(/(\d+)/)?.[1];
    if (num) {
      const n = parseInt(num);
      if (field.key === 'severity' && (n < 1 || n > 10)) {
        return { value: '', valid: false, hint: 'Please give a number between 1 and 10.' };
      }
      return { value: num, valid: true };
    }
    return { value: '', valid: false, hint: 'I need a number here. Could you try again?' };
  }
  // Free text
  if (!trimmed) {
    if (field.optional) return { value: '', valid: true };
    return { value: '', valid: false, hint: `Please provide a value for ${field.label}.` };
  }
  return { value: trimmed, valid: true };
};

// ─── MEDICAL TRIAGE KEYWORDS ──────────────────────────────────────────────────
const MEDICAL_KEYWORDS = [
  'allerg', 'rash', 'hive', 'itch', 'swell', 'anaphyla', 'epipen',
  'symptom', 'reaction', 'medication', 'antihistamine', 'inhaler',
  'throat', 'breathing', 'wheez', 'sting', 'bite', 'food', 'peanut',
  'dairy', 'gluten', 'pollen', 'asthma', 'diagnos', 'treatment',
  'doctor', 'hospital', 'pain', 'nausea', 'vomit', 'fever', 'skin',
  'immune', 'inflam', 'histamin', 'sensitiv', 'exposure', 'trigger',
  'throat', 'redness', 'bumps', 'hives', 'tingling', 'swelling',
];

const isMedicalQuery = (text: string): boolean => {
  const lower = text.toLowerCase();
  return MEDICAL_KEYWORDS.some(k => lower.includes(k));
};

// ─── SENTENCE SPLITTER ────────────────────────────────────────────────────────
// Splits a response into individual sentence strings for multi-bubble display.
// Respects abbreviations like Dr., Mr., e.g., i.e., etc.
const splitIntoSentences = (text: string): string[] => {
  // Clean first
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();

  // Split on sentence-ending punctuation followed by whitespace or newline
  const raw = cleaned.split(/(?<=[.!?])\s+(?=[A-Z\u0080-\uFFFF*•-]|\d)/);
  const sentences: string[] = [];

  for (const chunk of raw) {
    const trimmed = chunk.trim();
    if (trimmed.length === 0) continue;
    // Further split on newlines that introduce bullets or numbered lists
    const lines = trimmed.split(/\n+/);
    for (const line of lines) {
      const l = line.trim();
      if (l.length > 0) sentences.push(l);
    }
  }

  return sentences.length > 0 ? sentences : [cleaned];
};

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, lineIndex) => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) parts.push(line.slice(lastIndex, match.index));
      if (match[0].startsWith('**')) parts.push(<strong key={`${lineIndex}-${match.index}`}>{match[2]}</strong>);
      else parts.push(<em key={`${lineIndex}-${match.index}`}>{match[3]}</em>);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) parts.push(line.slice(lastIndex));
    const isNumbered = /^\d+\.\s/.test(line);
    const isBullet = /^[•*-]\s/.test(line);
    return (
      <span key={lineIndex}>
        {isNumbered || isBullet
          ? <span style={{ display: 'block', paddingLeft: 10, marginBottom: 3 }}>{parts.length > 0 ? parts : line}</span>
          : <span style={{ display: 'block', marginBottom: line === '' ? 8 : 2 }}>{parts.length > 0 ? parts : line}</span>
        }
      </span>
    );
  });
}

const cleanModelOutput = (raw: string): string => {
  let text = raw.replace(/\[SYSTEM:[\s\S]*?\]\s*/gi, '');
  // Strip any leaked [INSTRUCTION:...] blocks that MedGemma may echo back
  text = text.replace(/\[INSTRUCTION:[\s\S]*?\]/gi, '');
  // Strip the injected --- separator block if MedGemma echoes it back
  text = text.replace(/\n*---\nIf your reply[\s\S]*?question\./gi, '');
  text = text.replace(/^user[\s\S]*?model\s*/i, '');
  text = text.replace(/<unused\d+>thought\s*/gi, '');
  text = text.replace(/Thinking Process:[\s\S]*?(?=\n\nEssentially|\n\nIn summary|\n\nSo,|\n\n[A-Z][a-z]|$)/i, '');
  text = text.replace(/<[^>]+>/g, '').replace(/^model\s*/i, '').replace(/\n{3,}/g, '\n\n');
  return text.trim() || 'I could not generate a response.';
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
// ── Smart Quick-Reply Extractor ───────────────────────────────────────
// Instead of instructing MedGemma to emit a structured token (unreliable),
// we detect a symptom-question pattern in whatever MedGemma naturally writes,
// then serve relevant options from the frontend.
//
// Pipeline:
//  1. Detect if MedGemma is asking about symptoms (regex on response text)
//  2. Try to extract bullet/numbered list items from the response itself
//  3. Fall back to curated context-aware presets based on the user query
//  4. Last-resort: generic allergy symptom list
const SYMPTOM_QUESTION_RE =
  /which (of the following |specific |)symptoms|what symptoms|are you (currently |)(experiencing|having|feeling|noticing)|do you (have|notice|feel|experience)|what (are you|do you) (feeling|experiencing|noticing|having)|symptoms (are you|have you|do you)|any of these symptoms|please (let me know|tell me|describe|list)/i;

const CONTEXT_SYMPTOM_PRESETS: Record<string, string[]> = {
  shellfish: ['Hives', 'Swelling', 'Nausea', 'Difficulty breathing', 'Tingling lips', 'Stomach cramps'],
  seafood: ['Hives', 'Swelling', 'Nausea', 'Difficulty breathing', 'Tingling lips', 'Stomach cramps'],
  peanut: ['Hives', 'Throat tightening', 'Swelling', 'Nausea', 'Dizziness', 'Difficulty breathing'],
  nut: ['Hives', 'Throat tightening', 'Swelling', 'Nausea', 'Dizziness', 'Difficulty breathing'],
  dairy: ['Bloating', 'Nausea', 'Stomach pain', 'Diarrhea', 'Hives', 'Cramping'],
  milk: ['Bloating', 'Nausea', 'Stomach pain', 'Diarrhea', 'Hives', 'Cramping'],
  gluten: ['Bloating', 'Stomach pain', 'Fatigue', 'Rash', 'Nausea', 'Headache'],
  wheat: ['Bloating', 'Stomach pain', 'Fatigue', 'Rash', 'Nausea', 'Headache'],
  bee: ['Hives', 'Swelling', 'Dizziness', 'Difficulty breathing', 'Nausea', 'Chest tightness'],
  sting: ['Hives', 'Swelling', 'Dizziness', 'Difficulty breathing', 'Nausea', 'Chest tightness'],
  medication: ['Rash', 'Hives', 'Swelling', 'Nausea', 'Dizziness', 'Difficulty breathing'],
  benadryl: ['Still unwell', 'Drowsiness', 'Hives', 'Swelling', 'Nausea', 'Difficulty breathing'],
  reaction: ['Hives', 'Itching', 'Swelling', 'Nausea', 'Rash', 'Difficulty breathing'],
};

const GENERIC_SYMPTOMS = ['Hives', 'Itching', 'Swelling', 'Nausea', 'Rash', 'Difficulty breathing'];

const extractQuickRepliesFromResponse = (
  responseText: string,
  userQuery: string,
): string[] => {
  // 1 — Is MedGemma asking a symptom question?
  if (!SYMPTOM_QUESTION_RE.test(responseText)) return [];

  // 2 — Try to pull items from bullet / numbered lists in the response
  const bulletLines = responseText.match(/(?:^|\n)\s*[-•*‣▪●]\s*([^\n]{3,50})/gm);
  const numberedLines = responseText.match(/(?:^|\n)\s*\d+[.):]\s*([^\n]{3,50})/gm);
  const listSource = (bulletLines?.length ?? 0) >= 2 ? bulletLines : (numberedLines?.length ?? 0) >= 2 ? numberedLines : null;
  if (listSource) {
    const items = listSource
      .map(line => line.replace(/^[\s\n]*[-•*‣▪●\d.):\s]+/, '').trim())
      // Trim any trailing punctuation like bold markers or colons
      .map(s => s.replace(/[*_:]+$/, '').trim())
      .filter(s => s.length > 2 && s.length < 45);
    if (items.length >= 2) return items.slice(0, 6);
  }

  // 3 — Contextual presets from user query keywords
  const queryLower = userQuery.toLowerCase();
  for (const [keyword, preset] of Object.entries(CONTEXT_SYMPTOM_PRESETS)) {
    if (queryLower.includes(keyword)) return preset;
  }

  // 4 — Generic fallback
  return GENERIC_SYMPTOMS;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<HistoryTurn[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('chat');
  const [hasGreeted, setHasGreeted] = useState(false);

  // Quick-reply checkbox state
  const [quickReplies, setQuickReplies] = useState<string[]>([]);  // current options shown
  const [selectedReplies, setSelectedReplies] = useState<Set<string>>(new Set());

  // ── Conversational Logging State ──
  const [loggingSession, setLoggingSession] = useState<LoggingSession | null>(null);

  // Voice Settings
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);

  // Image Upload
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const srRef = useRef<{ stop: () => void } | null>(null);

  // ── Voice Init ──
  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      const preferred =
        voices.find(v => v.name === 'Google UK English Female') ||
        voices.find(v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female')) ||
        voices.find(v => v.lang.startsWith('en-')) ||
        voices[0];
      setSelectedVoice(preferred ?? null);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── speakText ──────────────────────────────────────────────────────────────
  const speakText = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 500));
    if (selectedVoice) u.voice = selectedVoice;
    u.rate = 0.92; u.pitch = 1.05;
    u.onstart = () => setIsSpeaking(true);
    u.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [selectedVoice]);

  const stopSpeaking = () => { window.speechSynthesis.cancel(); setIsSpeaking(false); };

  // ── Multi-bubble injector ──────────────────────────────────────────────────
  // Splits text into sentences and pushes each as a separate Message with a
  // staggered 350ms delay so the chat feels natural and alive.
  const injectBubbles = useCallback((
    text: string,
    source: Message['source'],
    speakFirst: boolean = false,
  ) => {
    const sentences = splitIntoSentences(text);
    sentences.forEach((sentence, i) => {
      setTimeout(() => {
        const msg: Message = {
          id: `${Date.now()}-${i}`,
          role: 'assistant',
          content: sentence,
          timestamp: new Date(),
          source,
        };
        setMessages(prev => [...prev, msg]);
        if (speakFirst && i === 0) speakText(sentence);
      }, i * 350);
    });
  }, [speakText]);

  // ── Nova Micro Greeting ────────────────────────────────────────────────────
  useEffect(() => {
    if (hasGreeted) return;
    const greet = async () => {
      try {
        setHasGreeted(true);
        const result = await client.queries.askNovaMicro({
          question: 'Greet the user warmly. Max 8 words.',
          history: '[]',
        });
        const greetText = String(result.data ?? "Hey! How can I help?").trim();
        const greetMsg: Message = {
          id: `greet-${Date.now()}`,
          role: 'assistant',
          content: greetText,
          timestamp: new Date(),
          source: 'nova',
        };
        setMessages([greetMsg]);
        speakText(greetText);
      } catch (e) {
        console.warn('Nova Micro greeting failed', e);
        setMessages([{
          id: 'greet-fallback',
          role: 'assistant',
          content: "Hi! I'm Immuny. Ask me anything.",
          timestamp: new Date(),
          source: 'nova',
        }]);
      }
    };
    greet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── DynamoDB Event Logger (non-blocking) ──────────────────────────────────
  const logEvent = useCallback(async (
    userId: string,
    type: 'user_query' | 'medical_response' | 'nova_reply' | 'image_analysis',
    payload: Record<string, unknown>,
  ) => {
    try {
      const event = JSON.stringify({ type, ts: new Date().toISOString(), ...payload });
      await client.queries.logConversationEvent({ userId, event });
    } catch (e) {
      console.warn('logEvent failed (non-blocking)', e);
    }
  }, []);

  // ── Voice Handlers ──
  const startRecording = () => {
    type SREvent = { results: { [k: number]: { [k: number]: { transcript: string } } } };
    type SRConstructor = new () => {
      lang: string; continuous: boolean; interimResults: boolean;
      start(): void; stop(): void;
      onresult: ((e: SREvent) => void) | null;
      onend: (() => void) | null;
    };
    const win = window as Window & { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) return alert('Voice input not supported. Please use Chrome.');
    const rec = new SR();
    rec.lang = 'en-US'; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e) => setInputText(prev => prev ? prev + ' ' + e.results[0][0].transcript : e.results[0][0].transcript);
    rec.onend = () => setIsRecording(false);
    rec.start(); srRef.current = rec; setIsRecording(true);
  };
  const stopRecording = () => { srRef.current?.stop(); setIsRecording(false); };

  // ── Image Handlers ──
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImage(file);
    const reader = new FileReader();
    reader.onload = ev => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  const clearImage = () => { setPendingImage(null); setImagePreview(null); };

  // ── CONVERSATIONAL LOGGING HELPERS ────────────────────────────────────────────
  const askLoggingQuestion = async (entryType: LoggingEntryType, field: FieldDef) => {
    try {
      const prompt = `You are helping the user log a ${entryType}. ${field.question} Keep it friendly and under 20 words. Do NOT add any prefix like "Sure!" — just ask the question directly.`;
      const result = await client.queries.askNovaMicro({
        question: prompt,
        history: JSON.stringify(chatHistory.slice(-4)),
      });
      const questionText = String(result.data ?? field.question).trim();
      injectBubbles(questionText, 'nova', false);
      setChatHistory(prev => [...prev, { role: 'assistant', content: questionText }].slice(-20) as HistoryTurn[]);
    } catch {
      // Fallback: use the raw question text
      const fallback = `What is the ${field.label.toLowerCase()}?`;
      injectBubbles(fallback, 'nova', false);
    }
  };

  const startLoggingSession = async (entryType: LoggingEntryType) => {
    const session: LoggingSession = { entryType, currentFieldIndex: 0, collectedData: {} };
    setLoggingSession(session);
    // Announce
    const announcement = `📋 Sure! Let's log a ${entryType.toLowerCase()}. I'll ask you a few questions.`;
    injectBubbles(announcement, 'nova', false);
    // Ask first question after a short delay
    const fields = FIELD_SCRIPTS[entryType];
    setTimeout(() => void askLoggingQuestion(entryType, fields[0]), 800);
  };

  const cancelLoggingSession = () => {
    setLoggingSession(null);
    injectBubbles('✅ Logging cancelled. Feel free to chat normally!', 'nova', false);
  };

  const submitLoggedEntry = async (session: LoggingSession) => {
    const { entryType, collectedData } = session;
    const now = new Date().toISOString().slice(0, 16);
    try {
      const basePayload: Record<string, unknown> = {
        type: entryType,
        time: now,
      };

      if (entryType === 'Symptom') {
        basePayload.name = collectedData.name || 'Unknown';
        basePayload.severity = collectedData.severity ? parseInt(collectedData.severity) : undefined;
        basePayload.bodyArea = collectedData.bodyArea || undefined;
        basePayload.notes = collectedData.notes || undefined;
      } else if (entryType === 'Exposure') {
        basePayload.subtype = collectedData.subtype || undefined;
        basePayload.name = collectedData.name || 'Unknown';
        basePayload.tags = collectedData.tags ? JSON.stringify(collectedData.tags.split(',').map((t: string) => t.trim()).filter(Boolean)) : undefined;
        basePayload.details = collectedData.details || undefined;
      } else if (entryType === 'Medication') {
        basePayload.name = collectedData.name || 'Unknown';
        basePayload.dose = collectedData.dose || undefined;
        basePayload.unit = collectedData.unit || undefined;
        basePayload.route = collectedData.route || undefined;
        basePayload.reason = collectedData.reason || undefined;
        basePayload.notes = collectedData.notes || undefined;
      }

      await client.models.HealthEntry.create(basePayload as Parameters<typeof client.models.HealthEntry.create>[0]);

      setLoggingSession(null);
      const summary = entryType === 'Symptom'
        ? `${collectedData.name} (severity ${collectedData.severity || '?'}/10)`
        : entryType === 'Exposure'
        ? `${collectedData.subtype || ''} — ${collectedData.name}`
        : `${collectedData.name} ${collectedData.dose || ''}${collectedData.unit || ''}`;
      injectBubbles(`✅ ${entryType} logged successfully!\n📋 ${summary}\nYou can view it in the Health Logger page.`, 'nova', false);
    } catch (e) {
      console.error('Failed to save logged entry:', e);
      setLoggingSession(null);
      injectBubbles('❌ Sorry, I couldn\'t save that entry. Please try logging it manually in the Health Logger.', 'nova', false);
    }
  };

  const handleLoggingAnswer = async (userText: string) => {
    if (!loggingSession) return;
    const { entryType, currentFieldIndex, collectedData } = loggingSession;
    const fields = FIELD_SCRIPTS[entryType];
    const currentField = fields[currentFieldIndex];

    const parsed = parseFieldAnswer(userText, currentField);

    // Cancel
    if (parsed.value === '__CANCEL__') {
      cancelLoggingSession();
      return;
    }

    // Invalid answer — re-ask
    if (!parsed.valid) {
      injectBubbles(parsed.hint || `Could you try that again?`, 'nova', false);
      return;
    }

    // Store the answer
    const updatedData = { ...collectedData, [currentField.key]: parsed.value };
    const nextIndex = currentFieldIndex + 1;

    if (nextIndex >= fields.length) {
      // All fields collected — submit
      const finalSession: LoggingSession = { entryType, currentFieldIndex: nextIndex, collectedData: updatedData };
      setLoggingSession(finalSession);
      await submitLoggedEntry(finalSession);
    } else {
      // Move to next field
      const nextSession: LoggingSession = { entryType, currentFieldIndex: nextIndex, collectedData: updatedData };
      setLoggingSession(nextSession);
      setTimeout(() => void askLoggingQuestion(entryType, fields[nextIndex]), 500);
    }
  };

  // ── THE AGENTIC ROUTER ──────────────────────────────────────────────────────
  //
  //  Image        → MedGemma vision     (Colab /analyse-image)
  //  Medical text → MedGemma /agent/ask (Colab, with chat history context)
  //  Casual text  → Nova Micro          (AWS Bedrock, ≤8 words)
  //
  //  Every response is sentence-split into separate chat bubbles.
  //  All interactions are logged to DynamoDB via logConversationEvent.
  //
  // ── Submit selected quick-reply checkboxes as a user message ─────────────
  const submitQuickReplies = async () => {
    if (selectedReplies.size === 0) return;
    const text = `I am experiencing: ${[...selectedReplies].join(', ')}`;
    setQuickReplies([]);
    setSelectedReplies(new Set());
    setInputText(text);
    // Use a tiny timeout so inputText state settles before sendMessage reads it
    setTimeout(() => {
      void sendMessageWithText(text);
    }, 0);
  };

  const sendMessage = async () => sendMessageWithText(inputText);

  const sendMessageWithText = async (overrideText?: string) => {
    const rawText = overrideText ?? inputText;
    const hasText = rawText.trim().length > 0;
    const hasImage = pendingImage !== null;
    if ((!hasText && !hasImage) || loading) return;

    const userContent = hasText ? rawText.trim() : '📷 What do you see in this image?';
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userContent,
      timestamp: new Date(),
      imagePreview: imagePreview ?? undefined,
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setQuickReplies([]);
    setSelectedReplies(new Set());
    setLoading(true);
    const capturedImage = pendingImage;
    clearImage();

    // ── CONVERSATIONAL LOGGING INTERCEPT ────────────────────────────────────
    // If a logging session is active, route the answer to the state machine
    if (loggingSession && !capturedImage) {
      setChatHistory(prev => [...prev, { role: 'user', content: userContent }].slice(-20) as HistoryTurn[]);
      setLoading(false);
      await handleLoggingAnswer(userContent);
      return;
    }

    // Check if the user wants to START a new logging session
    if (!capturedImage) {
      const intent = detectLoggingIntent(userContent);
      if (intent) {
        setChatHistory(prev => [...prev, { role: 'user', content: userContent }].slice(-20) as HistoryTurn[]);
        setLoading(false);
        await startLoggingSession(intent);
        return;
      }
    }

    // Stamp userId from Amplify Authenticator
    const userId = document.body.dataset.userId ?? 'anonymous';

    // Keep a rolling 10-turn history for MedGemma context
    const historySnapshot: HistoryTurn[] = [
      ...chatHistory,
      { role: 'user' as const, content: userContent },
    ].slice(-10);

    try {
      let responseText = '';
      let source: Message['source'] = 'nova';

      // ── RULE 1: Image → MedGemma Vision ──────────────────────────────────
      if (capturedImage) {
        source = 'medgemma';
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => resolve((e.target?.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(capturedImage);
        });
        const res = await fetch(IMAGE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_b64: b64, question: userContent }),
        });
        const data = await res.json() as { response?: string; error?: string };
        responseText = res.ok
          ? cleanModelOutput(data.response ?? '')
          : `Image Error: ${data.error ?? 'Unknown'}`;

        void logEvent(userId, 'image_analysis', {
          question: userContent,
          response_preview: responseText.slice(0, 120),
        });
      }

      // ── RULE 2: Medical text → MedGemma /agent/ask ───────────────────────
      else if (isMedicalQuery(userContent)) {
        source = 'medgemma';
        console.log('🩺 Medical query → MedGemma');

        void logEvent(userId, 'user_query', { text: userContent, routed_to: 'medgemma' });

        // No prompt injection needed — symptom options are detected from the
        // natural language response on the frontend (see extractQuickRepliesFromResponse).
        const res = await fetch(AGENT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: userContent,
            history: historySnapshot.slice(-10),
            biometrics: null,
          }),
        });

        if (res.ok) {
          const data = await res.json() as { response?: string; error?: string };
          responseText = cleanModelOutput(data.response ?? '');
        } else {
          try {
            const data = await res.json() as { error?: string };
            responseText = `MedGemma Error: ${data.error ?? 'Unknown'}`;
          } catch {
            responseText = 'Connection Error: Is Colab running? Ngrok URL correct?';
          }
        }

        // Detect symptom questions and surface contextual quick-reply chips
        const options = extractQuickRepliesFromResponse(responseText, userContent);
        if (options.length > 0) {
          // Defer so the bubbles render first, then show the panel
          const delay = splitIntoSentences(responseText).length * 350 + 200;
          setTimeout(() => setQuickReplies(options), delay);
        }

        void logEvent(userId, 'medical_response', {
          question: userContent,
          response_preview: responseText.slice(0, 120),
        });
      }

      // ── RULE 3: Casual text → Nova Micro (≤ 8 words) ─────────────────────
      else {
        source = 'nova';
        console.log('⚡ Casual query → Nova Micro');

        const result = await client.queries.askNovaMicro({
          question: userContent,
          history: JSON.stringify(chatHistory.slice(-6)),
        });
        responseText = cleanModelOutput(String(result.data ?? '').trim())
          || "I'm not sure, ask your doctor!";

        void logEvent(userId, 'nova_reply', {
          question: userContent,
          response: responseText,
        });
      }

      // ── Inject multi-bubble response ────────────────────────────────────
      // Each sentence becomes its own chat bubble with a 350ms stagger
      injectBubbles(responseText, source, true);

      // ── Update rolling chat history ─────────────────────────────────────
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: userContent },
        { role: 'assistant', content: responseText },
      ].slice(-20) as HistoryTurn[]); // keep last 20 turns

    } catch (err: unknown) {
      console.error('sendMessage error:', err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Network Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const navigateTo = (page: Page) => { setCurrentPage(page); setMenuOpen(false); };

  // ── Chat UI ────────────────────────────────────────────────────────────────
  const renderChat = () => (
    <>
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <img src={immunyLogo} alt="Immuny" className="bot-logo-large" />
            <h2>Immuny</h2>
            <p className="tagline">ALLERGY AI ALLY</p>
            <div className="quick-actions">
              <button onClick={() => setInputText('Any allergy symptoms to check on?')}>🤧 Check allergies</button>
              <button onClick={() => setInputText('Is it safe to eat strawberries with my allergy?')}>🍓 Food allergies</button>
              <button onClick={() => setInputText('What should I do during an allergic reaction?')}>🏥 Reaction guide</button>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isLastAssistant =
              msg.role === 'assistant' &&
              idx === messages.length - 1 &&
              !loading &&
              quickReplies.length > 0;
            return (
              <div key={msg.id} className={`message-bubble ${msg.role}`}>
                {msg.role === 'assistant' && (
                  <img src={immunyLogo} alt="Immuny" className="message-avatar" />
                )}
                <div className="message-content">
                  {/* Source badge */}
                  {msg.role === 'assistant' && msg.source && (
                    <div style={{
                      fontSize: 10, fontWeight: 700, marginBottom: 3,
                      color: msg.source === 'medgemma' ? '#7C3AED' : '#0369A1',
                    }}>
                      {msg.source === 'medgemma' ? '🔬 MedGemma' : '⚡ Nova Micro'}
                    </div>
                  )}
                  {msg.imagePreview && (
                    <img src={msg.imagePreview} alt="Uploaded"
                      style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginBottom: 6, display: 'block' }} />
                  )}
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{renderMarkdown(msg.content)}</div>
                  <span className="message-time">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                  {/* ── Quick-reply checkbox panel ────────────────────────── */}
                  {isLastAssistant && (
                    <div className="quick-reply-panel">
                      <p className="quick-reply-label">Select all that apply:</p>
                      <div className="quick-reply-chips">
                        {quickReplies.map(opt => {
                          const checked = selectedReplies.has(opt);
                          return (
                            <button
                              key={opt}
                              className={`quick-reply-chip${checked ? ' selected' : ''}`}
                              onClick={() => {
                                setSelectedReplies(prev => {
                                  const next = new Set(prev);
                                  if (next.has(opt)) next.delete(opt); else next.add(opt);
                                  return next;
                                });
                              }}
                            >
                              <span className="chip-checkbox">{checked ? '✓' : ''}</span>
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      <div className="quick-reply-actions">
                        <button
                          className="quick-reply-submit"
                          disabled={selectedReplies.size === 0}
                          onClick={() => void submitQuickReplies()}
                        >
                          Submit {selectedReplies.size > 0 ? `(${selectedReplies.size})` : ''}
                        </button>
                        <button
                          className="quick-reply-skip"
                          onClick={() => { setQuickReplies([]); setSelectedReplies(new Set()); }}
                        >
                          None / Skip
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        {loading && (
          <div className="message-bubble assistant">
            <img src={immunyLogo} alt="Immuny" className="message-avatar" />
            <div className="message-content typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        {/* ── Logging Session Banner ──────────────────────────────── */}
        {loggingSession && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 14px', marginBottom: 6, borderRadius: 8,
            background: 'linear-gradient(135deg, #D1E7F4, #E8F5E9)',
            border: '1px solid #4A7BA7', fontSize: 13, fontWeight: 600, color: '#2E5A7E',
          }}>
            <span>
              📋 Logging {loggingSession.entryType}
              {' '}
              ({Math.min(loggingSession.currentFieldIndex + 1, FIELD_SCRIPTS[loggingSession.entryType].length)}/{FIELD_SCRIPTS[loggingSession.entryType].length})
            </span>
            <button onClick={cancelLoggingSession} style={{
              background: '#DC2626', color: '#fff', border: 'none', borderRadius: 6,
              padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        )}
        {isSpeaking && (
          <div className="speaking-banner">
            <span>🔊 Speaking ({selectedVoice?.name || 'Default Voice'})…</span>
            <button onClick={stopSpeaking}>Stop</button>
          </div>
        )}
        {imagePreview && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            background: '#fff', borderRadius: 8, marginBottom: 8, border: '1px solid #4A7BA7',
          }}>
            <img src={imagePreview} alt="Selected" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
            <span style={{ flex: 1, fontSize: 12, color: '#4A7BA7', fontWeight: 600 }}>
              📷 Image ready — add a question or press send
            </span>
            <button onClick={clearImage}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#DC2626' }}>✕</button>
          </div>
        )}
        <div className="input-bar">
          <input type="file" accept="image/*" ref={imageInputRef} onChange={handleImageSelect} style={{ display: 'none' }} />
          <button onClick={() => setShowVoiceSettings(!showVoiceSettings)} className="settings-btn" title="Voice settings">⚙️</button>
          <button onClick={() => imageInputRef.current?.click()} className="settings-btn" title="Upload a photo"
            style={{ background: imagePreview ? '#4A7BA7' : 'white', color: imagePreview ? 'white' : '#4A7BA7', fontSize: '1.3rem' }}>📷</button>
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && void sendMessage()}
            placeholder={isRecording ? 'Listening...' : imagePreview ? 'Ask about the image…' : 'Type a message…'}
            className="message-input"
          />
          <button onClick={isRecording ? stopRecording : startRecording}
            className={`voice-btn ${isRecording ? 'recording' : ''}`}
            title={isRecording ? 'Stop' : 'Voice input'}>
            {isRecording ? '⏹️' : '🎤'}
          </button>
          <button onClick={() => void sendMessage()} disabled={(!inputText.trim() && !pendingImage) || loading} className="send-btn">➤</button>
        </div>
      </div>

      {showVoiceSettings && (
        <div className="voice-settings-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>🎙️ Voice Settings</h3>
              <button onClick={() => setShowVoiceSettings(false)}>✕</button>
            </div>
            <div className="modal-body">
              <label>Select Voice for AI Responses:</label>
              <select value={selectedVoice?.name || ''} onChange={(e) => {
                const voice = availableVoices.find(v => v.name === e.target.value);
                setSelectedVoice(voice || null);
              }} className="voice-select">
                {availableVoices.map((voice) => (
                  <option key={voice.name} value={voice.name}>{voice.name} ({voice.lang})</option>
                ))}
              </select>
              <div className="voice-test">
                <button onClick={() => speakText("Hello! This is Immuny, your allergy AI ally.")} className="test-voice-btn">🔊 Test Voice</button>
              </div>
              <div className="api-info">
                <p><strong>LLM Router:</strong></p>
                <p className="info-note">⚡ Nova Micro — casual &amp; greetings (≤8 words)</p>
                <p className="info-note">🔬 MedGemma — medical queries (detailed)</p>
                <p className="info-note">📷 MedGemma Vision — image analysis</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const renderContent = () => {
    switch (currentPage) {
      case 'profile': return <ProfilePage />;
      case 'symptom-logger': return <SymptomLoggerPage />;
      case 'exposure-testing': return <ExposureTestingPage />;
      default: return renderChat();
    }
  };

  return (
    <Authenticator>
      {({ signOut, user }) => {
        if (user?.userId) document.body.dataset.userId = user.userId;
        return (
          <div className="app-container">
            <div className={`sidebar ${menuOpen ? 'open' : ''}`}>
              <div className="sidebar-header">
                <img src={immunyLogo} alt="Immuny" className="sidebar-logo" />
                <h2>Immuny</h2>
                <button onClick={() => setMenuOpen(false)}>✕</button>
              </div>
              <nav>
                <button className={currentPage === 'chat' ? 'active' : ''} onClick={() => navigateTo('chat')}>💬 Ask Immuny</button>
                <button className={currentPage === 'symptom-logger' ? 'active' : ''} onClick={() => navigateTo('symptom-logger')}>📋 Health Logger</button>
                <button className={currentPage === 'exposure-testing' ? 'active' : ''} onClick={() => navigateTo('exposure-testing')}>🧪 Exposure Testing</button>
                <button className={currentPage === 'profile' ? 'active' : ''} onClick={() => navigateTo('profile')}>👤 Profile</button>
              </nav>
              <div className="sidebar-footer">
                <p>{user?.signInDetails?.loginId}</p>
                <button onClick={signOut}>Sign Out</button>
              </div>
            </div>

            <div className="main-content">
              <header className="chat-header">
                <button onClick={() => setMenuOpen(true)} className="menu-btn">☰</button>
                <div className="header-title">
                  <img src={immunyLogo} alt="Immuny" className="header-logo" />
                  <div>
                    <h1>Immuny AI</h1>
                    <p> {selectedVoice?.name?.replace('Google ', '').split(' ').slice(0, 3).join(' ') || 'Default'}</p>
                  </div>
                </div>
              </header>
              {renderContent()}
            </div>
          </div>
        );
      }}
    </Authenticator>
  );
}