import { useState, useRef, useEffect, useCallback } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';
import '@aws-amplify/ui-react/styles.css';
import './App.css';
import beaImg from './assets/bea.png';

// ─── COMPONENT IMPORTS ────────────────────────────────────────────────────────
import ProfilePage from './components/ProfilePage';
import SymptomLoggerPage from './components/SymptomLogger';
import ExposureTestingPage from './components/ExposureTesting';
import HomePage from './components/HomePage';
import InsightsPage from './components/InsightsPage';
import VoicePage from './components/VoicePage';
import CommunityPage from './components/CommunityPage';
import BottomNav from './components/BottomNav';
import type { Page } from './types';

// ── 🔴 WATCH SENSOR FEATURE (COMMENTED OUT — ready for future integration) ──
// import WatchStatus, { type Vitals } from './components/WatchStatus';

const client = generateClient<Schema>();

// ─── 🔗 API ENDPOINTS (MedGemma — disabled, kept for future re-enable) ────────
const COLAB_BASE_URL = "https://available-lifestyle-additional-hunting.trycloudflare.com";
const AGENT_URL = `${COLAB_BASE_URL}/agent/ask`;
const IMAGE_URL = `${COLAB_BASE_URL}/analyse-image`;
const MEDGEMMA_ENABLED = false; // set to true + deploy Colab to re-enable

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  source?: 'nova';
  imagePreview?: string;
}

interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

// ─── SESSION CONTEXT (Live Memory) ───────────────────────────────────────────
// This is the "working memory" of the conversation. It tracks entities and
// topics the user mentions so Nova can reference them across turns naturally.
interface SessionContext {
  knownAllergies: string[];        // e.g. ["shellfish", "peanuts"]
  currentSymptoms: string[];       // symptoms mentioned this session
  currentTopic: string | null;     // e.g. "reaction at restaurant"
  lastMentionedFood: string | null;
  lastMentionedMedication: string | null;
  urgencyLevel: 'normal' | 'elevated' | 'emergency';
  turnCount: number;
}

const INITIAL_SESSION_CONTEXT: SessionContext = {
  knownAllergies: [],
  currentSymptoms: [],
  currentTopic: null,
  lastMentionedFood: null,
  lastMentionedMedication: null,
  urgencyLevel: 'normal',
  turnCount: 0,
};

// ─── ENTITY EXTRACTORS ────────────────────────────────────────────────────────
const ALLERGY_FOOD_RE = /\b(shellfish|shrimp|crab|lobster|peanut|nut|dairy|milk|gluten|wheat|soy|egg|fish|sesame|tree nut|latex|bee|wasp|penicillin|aspirin|ibuprofen|sulfa|mold|dust|pollen|cat|dog|pet)s?\b/gi;
const SYMPTOM_ENTITY_RE = /\b(hives?|swelling|itch(?:ing)?|rash|nausea|vomit(?:ing)?|dizziness|dizzy|wheezing|wheeze|throat tightening|anaphylaxis|cramps?|bloating|stomach pain|difficulty breathing|headache|tingling|redness|bumps?)\b/gi;
const MEDICATION_RE = /\b(benadryl|epipen|epinephrine|cetirizine|zyrtec|claritin|loratadine|prednisone|prednisolone|inhaler|montelukast|singulair|diphenhydramine|hydroxyzine|cortisone|steroid)s?\b/gi;
const FOOD_RE = /\b(ate|eating|eat|had|having|consumed?|tried?)\s+(?:some\s+)?([\w\s]{2,25}?)(?:\s+and|\s+which|\s+that|\.|,|$)/gi;
const EMERGENCY_RE = /\b(can'?t breathe|throat closing|anaphylaxis|epipen|epinephrine|emergency|911|can not breathe|unable to breathe|severe reaction|face swelling|lips? swelling)\b/i;
const ELEVATED_RE = /\b(difficulty breathing|tight(?:ness)?|wheez|throat|spreading|getting worse|severe|bad reaction|not improving|still swelling)\b/i;

const extractEntities = (text: string) => ({
  allergies: [...new Set((text.match(ALLERGY_FOOD_RE) ?? []).map(s => s.toLowerCase()))],
  symptoms: [...new Set((text.match(SYMPTOM_ENTITY_RE) ?? []).map(s => s.toLowerCase()))],
  medications: [...new Set((text.match(MEDICATION_RE) ?? []).map(s => s.toLowerCase()))],
  isEmergency: EMERGENCY_RE.test(text),
  isElevated: ELEVATED_RE.test(text),
});

// ─── CONTEXT SERIALIZER ───────────────────────────────────────────────────────
// Produces a compact 1-3 sentence summary injected into every Nova call.
const buildContextSummary = (ctx: SessionContext): string | null => {
  if (ctx.turnCount === 0) return null; // no context yet on first turn
  const parts: string[] = [];
  if (ctx.knownAllergies.length > 0)
    parts.push(`User has known allergies to: ${ctx.knownAllergies.join(', ')}.`);
  if (ctx.currentSymptoms.length > 0)
    parts.push(`Symptoms mentioned this session: ${ctx.currentSymptoms.join(', ')}.`);
  if (ctx.currentTopic)
    parts.push(`Current topic: ${ctx.currentTopic}.`);
  if (ctx.lastMentionedFood)
    parts.push(`Last food mentioned: ${ctx.lastMentionedFood}.`);
  if (ctx.lastMentionedMedication)
    parts.push(`Medication mentioned: ${ctx.lastMentionedMedication}.`);
  if (ctx.urgencyLevel === 'emergency')
    parts.push('URGENT: User may be experiencing a severe/emergency reaction.');
  else if (ctx.urgencyLevel === 'elevated')
    parts.push('Note: User\'s symptoms may be worsening — stay attentive.');
  return parts.length > 0 ? parts.join(' ') : null;
};

// Page type is defined in src/types.ts — imported above

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
export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<HistoryTurn[]>([]);
  const [sessionContext, setSessionContext] = useState<SessionContext>(INITIAL_SESSION_CONTEXT);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [hasGreeted, setHasGreeted] = useState(false);

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

  // ── SESSION CONTEXT UPDATER ───────────────────────────────────────────────────
  // Called after every exchange to keep the live session memory up to date.
  const updateSessionContext = (userText: string, assistantText: string) => {
    const userEntities = extractEntities(userText);
    const assistantEntities = extractEntities(assistantText);
    setSessionContext(prev => {
      const next = { ...prev, turnCount: prev.turnCount + 1 };
      // Merge new allergies (deduplicated)
      if (userEntities.allergies.length > 0)
        next.knownAllergies = [...new Set([...prev.knownAllergies, ...userEntities.allergies])];
      // Merge new symptoms
      const newSymptoms = [...userEntities.symptoms, ...assistantEntities.symptoms];
      if (newSymptoms.length > 0)
        next.currentSymptoms = [...new Set([...prev.currentSymptoms, ...newSymptoms])].slice(-8);
      // Track last medication mentioned
      const meds = [...userEntities.medications, ...assistantEntities.medications];
      if (meds.length > 0) next.lastMentionedMedication = meds[meds.length - 1];
      // Derive current topic from user's message (first 60 chars as topic hint)
      const topicHint = userText.trim().slice(0, 60);
      if (topicHint.length > 10) next.currentTopic = topicHint;
      // Urgency escalation — never de-escalate within a session
      if (userEntities.isEmergency) next.urgencyLevel = 'emergency';
      else if (userEntities.isElevated && prev.urgencyLevel === 'normal') next.urgencyLevel = 'elevated';
      return next;
    });
  };

  // ── CONVERSATIONAL LOGGING HELPERS ────────────────────────────────────────────
  const askLoggingQuestion = async (entryType: LoggingEntryType, field: FieldDef) => {
    try {
      const prompt = `You are helping the user log a ${entryType}. ${field.question} Keep it friendly and conversational. Do NOT add any prefix like "Sure!" — just ask the question directly.`;
      const result = await client.queries.askNovaMicro({
        question: prompt,
        history: JSON.stringify(chatHistory.slice(-4)),
        context: buildContextSummary(sessionContext) ?? undefined,
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
  //  Image        → MedGemma vision     (Colab /analyse-image — disabled)
  //  Medical text → MedGemma /agent/ask (Colab — disabled)
  //  All text     → Nova Micro          (AWS Bedrock)
  //
  //  Every response is sentence-split into separate chat bubbles.
  //  All interactions are logged to DynamoDB via logConversationEvent.

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
    setLoading(true);
    const capturedImage = pendingImage;
    clearImage();

    // ── FIX: Add user turn to history BEFORE calling API ────────────────────
    // This ensures the current message is visible in the history sent to Nova,
    // preventing the "forgets what I just said" bug.
    const updatedHistory: HistoryTurn[] = [
      ...chatHistory,
      { role: 'user' as const, content: userContent },
    ].slice(-20);
    setChatHistory(updatedHistory);

    // ── CONVERSATIONAL LOGGING INTERCEPT ────────────────────────────────────
    // If a logging session is active, route the answer to the state machine
    if (loggingSession && !capturedImage) {
      setLoading(false);
      await handleLoggingAnswer(userContent);
      return;
    }

    // Check if the user wants to START a new logging session
    if (!capturedImage) {
      const intent = detectLoggingIntent(userContent);
      if (intent) {
        setLoading(false);
        await startLoggingSession(intent);
        return;
      }
    }

    // Stamp userId from Amplify Authenticator
    const userId = document.body.dataset.userId ?? 'anonymous';

    // History snapshot already includes the current user turn (fixed above)
    const historySnapshot = updatedHistory.slice(-10);
    const contextSummary = buildContextSummary(sessionContext);

    try {
      let responseText = '';
      let source: Message['source'] = 'nova';

      // ── RULE 1: Image → Nova Micro (MedGemma vision disabled) ───────────
      if (capturedImage && MEDGEMMA_ENABLED) {
        // MedGemma image analysis — disabled until COLAB_BASE_URL is live
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
        void logEvent(userId, 'image_analysis', { question: userContent, response_preview: responseText.slice(0, 120) });
      }

      // ── RULE 2: All text → Nova Micro (MedGemma disabled) ────────────────
      else if (MEDGEMMA_ENABLED && !capturedImage && isMedicalQuery(userContent)) {
        // Reserved: MedGemma medical routing — re-enable by setting MEDGEMMA_ENABLED = true
        const medGemmaQuestion = contextSummary ? `[Context: ${contextSummary}]\n\n${userContent}` : userContent;
        const res = await fetch(AGENT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: medGemmaQuestion, history: historySnapshot.slice(-10), biometrics: null }),
        });
        if (res.ok) {
          const data = await res.json() as { response?: string; error?: string };
          responseText = cleanModelOutput(data.response ?? '');
        } else {
          responseText = 'Connection Error: Is Colab running?';
        }
      }

      // ── RULE 3: Nova Micro — all queries ─────────────────────────────────
      else {
        source = 'nova';

        const result = await client.queries.askNovaMicro({
          question: userContent,
          history: JSON.stringify(historySnapshot),
          context: contextSummary ?? undefined,
        });
        responseText = cleanModelOutput(String(result.data ?? '').trim())
          || "I'm here! Could you tell me a little more about that?";

        void logEvent(userId, 'nova_reply', {
          question: userContent,
          response: responseText,
        });
      }

      // ── Inject multi-bubble response ────────────────────────────────────
      // Each sentence becomes its own chat bubble with a 350ms stagger
      injectBubbles(responseText, source, true);

      // ── Update rolling chat history with assistant reply ─────────────────
      // Note: user turn was already added before the API call (timing fix).
      setChatHistory(prev => [
        ...prev,
        { role: 'assistant', content: responseText },
      ].slice(-20) as HistoryTurn[]);

      // ── Update session context with entities from this exchange ──────────
      updateSessionContext(userContent, responseText);

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

  const navigateTo = (page: Page) => setCurrentPage(page);

  // ── Chat UI ────────────────────────────────────────────────────────────────
  const renderChat = () => (
    <>
      {/* ── Bea chat header ── */}
      <div className="chat-top-bar">
        <button className="chat-back-btn" onClick={() => navigateTo('home')}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 className="chat-top-title">Bea</h1>
        <div className="chat-profile-dot" />
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-chat">
            <img src={beaImg} alt="Bea" className="bot-logo-large" />
            <h2>Immuny</h2>
            <p className="tagline">ALLERGY AI ALLY</p>
            <div className="quick-actions">
              <button onClick={() => setInputText('Any allergy symptoms to check on?')}>🤧 Check allergies</button>
              <button onClick={() => setInputText('Is it safe to eat strawberries with my allergy?')}>🍓 Food allergies</button>
              <button onClick={() => setInputText('What should I do during an allergic reaction?')}>🏥 Reaction guide</button>
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`message-bubble ${msg.role}`}>
              {msg.role === 'assistant' && (
                <img src={beaImg} alt="Bea" className="message-avatar" />
              )}
              <div className="message-content">
                {msg.imagePreview && (
                  <img src={msg.imagePreview} alt="Uploaded"
                    style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, marginBottom: 6, display: 'block' }} />
                )}
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{renderMarkdown(msg.content)}</div>
                <span className="message-time">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="message-bubble assistant">
            <img src={beaImg} alt="Bea" className="message-avatar" />
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
                <p><strong>AI Model:</strong></p>
                <p className="info-note">⚡ Nova Micro — all queries (via AWS Bedrock)</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const renderContent = (userId: string, userEmail?: string) => {
    switch (currentPage) {
      case 'home':            return <HomePage onNavigate={navigateTo} userName={userEmail} />;
      case 'voice':           return <VoicePage onNavigate={navigateTo} />;
      case 'insights':        return <InsightsPage onNavigate={navigateTo} />;
      case 'community':       return <CommunityPage currentUserId={userId} />;
      case 'profile':         return <ProfilePage />;
      case 'symptom-logger':  return <SymptomLoggerPage />;
      case 'exposure-testing': return <ExposureTestingPage />;
      case 'chat':            return renderChat();
      default:                return <HomePage onNavigate={navigateTo} />;
    }
  };

  return (
    <Authenticator>
      {({ user }) => {
        const userId = user?.userId ?? 'anonymous';
        const userEmail = user?.signInDetails?.loginId;
        if (user?.userId) document.body.dataset.userId = user.userId;
        return (
          <div className="app-container">
            <div className="main-content">
              <div key={currentPage} className="page-fade">
                {renderContent(userId, userEmail)}
              </div>
            </div>
            <BottomNav current={currentPage} onNavigate={navigateTo} />
          </div>
        );
      }}
    </Authenticator>
  );
}