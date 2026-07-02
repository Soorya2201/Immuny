import { useState } from 'react';
import type { Page } from '../types';
import {
  AlertOctagonIcon,
  BookIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  GlobeIcon,
  HelpCircleIcon,
  InstagramIcon,
  LinkedinIcon,
  ListIcon,
  MedicalCrossIcon,
  MessageCircleIcon,
  MusicNoteIcon,
  RepeatIcon,
  SearchIcon,
  Share2Icon,
  StethoscopeIcon,
  UtensilsIcon,
  YoutubeIcon,
} from './icons';

interface ResourceHubPageProps {
  onNavigate: (page: Page) => void;
}

const SOCIAL_LINKS = [
  { label: 'Instagram', url: 'https://www.instagram.com/immunybee/', Icon: InstagramIcon },
  { label: 'TikTok', url: 'https://www.tiktok.com/@immunybee', Icon: MusicNoteIcon },
  { label: 'Discord', url: 'https://discord.gg/pNjPqTUxYw', Icon: MessageCircleIcon },
  { label: 'YouTube', url: 'https://www.youtube.com/@ImmunyBee', Icon: YoutubeIcon },
  { label: 'LinkedIn', url: 'https://www.linkedin.com/company/immuny/', Icon: LinkedinIcon },
  { label: 'Website', url: 'https://www.immuny.ai/', Icon: GlobeIcon },
];

const BIG_9_ALLERGENS = [
  'Milk', 'Eggs', 'Fish', 'Crustacean shellfish', 'Tree nuts',
  'Peanuts', 'Wheat', 'Soybeans', 'Sesame',
];

const CROSS_REACTOR_GROUPS = [
  {
    title: 'Birch pollen & produce (Pollen-Food Syndrome)',
    text: 'Birch pollen allergy can cross-react with apples, pears, peaches, cherries, carrots, celery, and hazelnuts — often causing mild mouth/throat itching (oral allergy syndrome).',
  },
  {
    title: 'Ragweed pollen & melons/bananas',
    text: 'Ragweed allergy can cross-react with melons (cantaloupe, honeydew, watermelon), bananas, and cucumber.',
  },
  {
    title: 'Latex & certain fruits',
    text: 'Latex allergy can cross-react with banana, avocado, kiwi, and chestnut due to shared plant proteins.',
  },
  {
    title: 'Shellfish & dust mites',
    text: 'A protein called tropomyosin found in crustacean shellfish is also found in dust mites and cockroaches, which can cause cross-reactivity.',
  },
  {
    title: 'Tree nut families',
    text: 'Related tree nuts (e.g., cashew & pistachio, or walnut & pecan) can cross-react since they come from the same botanical family.',
  },
];

const FOOD_PREP_TIPS = [
  'Use dedicated cutting boards, utensils, and cookware for allergen-free meals.',
  'Read ingredient labels every time — manufacturers can change formulations without notice.',
  'Watch for cross-contact at shared fryers, grills, or buffet serving spoons.',
  'Wash hands, counters, and surfaces between preparing allergen and allergen-free foods.',
  'Consider substitutes: applesauce for egg in baking, sunflower seed butter for peanut butter, oat or rice milk for dairy (if not also nut-allergic).',
];

interface FaqItem {
  q: string;
  a: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'What does Immuny do?',
    a: 'Immuny helps you track allergy-related symptoms, exposures, and medications over time, and uses that history to surface patterns and trends — like Bea, your AI companion.',
  },
  {
    q: 'Does Immuny provide medical advice?',
    a: 'No. Immuny helps track experiences and patterns and does not provide medical advice. Always consult a licensed allergist or physician for diagnosis and treatment.',
  },
  {
    q: 'Is my health data private?',
    a: 'Your logged entries are stored under your account and are not shared with other users. Community posts are the only content visible to other Immuny users, and only if you choose to post.',
  },
  {
    q: 'What should I do during a severe allergic reaction?',
    a: 'If you experience difficulty breathing, throat tightness, or facial/lip swelling, use your epinephrine auto-injector if prescribed and call emergency services immediately. Do not wait to see if symptoms improve.',
  },
  {
    q: "What is the 'Big 9'?",
    a: 'The Big 9 are the major food allergens recognized by the FDA: milk, eggs, fish, crustacean shellfish, tree nuts, peanuts, wheat, soybeans, and sesame.',
  },
  {
    q: 'How do I log a new symptom or exposure?',
    a: 'Use the Health Logger from the Home screen, or simply tell Bea in chat — she can walk you through logging a symptom, exposure, or medication conversationally.',
  },
];

export default function ResourceHubPage({ onNavigate }: ResourceHubPageProps) {
  const [openEducation, setOpenEducation] = useState<'cross' | 'big9' | null>(null);
  const [openFoodSafety, setOpenFoodSafety] = useState<'prep' | null>(null);
  const [showSocials, setShowSocials] = useState(false);
  const [faqQuery, setFaqQuery] = useState('');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const filteredFaqs = FAQ_ITEMS.filter(item =>
    item.q.toLowerCase().includes(faqQuery.trim().toLowerCase())
  );

  return (
    <div className="resource-hub-screen">
      <div className="resource-hub-top-bar">
        <button className="insights-back-btn" onClick={() => onNavigate('insights')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 className="resource-hub-title">Resource Hub</h1>
        <div style={{ width: 38 }} />
      </div>

      <div className="resource-hub-body">
        <a
          className="resource-hub-cta"
          href="https://www.google.com/maps/search/allergist+near+me"
          target="_blank"
          rel="noopener noreferrer"
        >
          <StethoscopeIcon />
          <span>Find an Allergist</span>
          <ExternalLinkIcon />
        </a>

        <a
          className="resource-hub-cta resource-hub-cta--highlight"
          href="https://www.google.com/maps/search/hospital+near+me"
          target="_blank"
          rel="noopener noreferrer"
        >
          <MedicalCrossIcon />
          <span>Find a Hospital</span>
          <ExternalLinkIcon />
        </a>

        <section className="resource-hub-section">
          <h2><BookIcon /> Immuny Allergy Education</h2>
          <div className="resource-hub-grid">
            <button
              className="resource-hub-card"
              onClick={() => setOpenEducation(openEducation === 'cross' ? null : 'cross')}
            >
              <RepeatIcon />
              <span>Cross Reactors</span>
            </button>
            <button
              className="resource-hub-card"
              onClick={() => setOpenEducation(openEducation === 'big9' ? null : 'big9')}
            >
              <ListIcon />
              <span>The "Big 9"</span>
            </button>
          </div>

          {openEducation === 'cross' && (
            <div className="resource-hub-detail">
              {CROSS_REACTOR_GROUPS.map(group => (
                <div key={group.title} className="resource-hub-detail-row">
                  <strong>{group.title}</strong>
                  <p>{group.text}</p>
                </div>
              ))}
            </div>
          )}

          {openEducation === 'big9' && (
            <div className="resource-hub-detail">
              <p>The FDA recognizes nine major food allergens that must be clearly labeled on packaged food:</p>
              <ul className="resource-hub-list">
                {BIG_9_ALLERGENS.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
        </section>

        <section className="resource-hub-section">
          <h2><AlertOctagonIcon /> Food Safety</h2>
          <div className="resource-hub-grid">
            <a
              className="resource-hub-card"
              href="https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts"
              target="_blank"
              rel="noopener noreferrer"
            >
              <AlertOctagonIcon />
              <span>FDA Food Recalls</span>
            </a>
            <button
              className="resource-hub-card"
              onClick={() => setOpenFoodSafety(openFoodSafety === 'prep' ? null : 'prep')}
            >
              <UtensilsIcon />
              <span>Food Prep Ideas</span>
            </button>
          </div>

          {openFoodSafety === 'prep' && (
            <div className="resource-hub-detail">
              <ul className="resource-hub-list">
                {FOOD_PREP_TIPS.map(tip => <li key={tip}>{tip}</li>)}
              </ul>
            </div>
          )}
        </section>

        <section className="resource-hub-section">
          <h2><HelpCircleIcon /> Extras</h2>
          <div className="resource-hub-grid">
            <a className="resource-hub-card" href="#faq-section">
              <HelpCircleIcon />
              <span>FAQ</span>
            </a>
            <button className="resource-hub-card" onClick={() => setShowSocials(!showSocials)}>
              <Share2Icon />
              <span>View our Socials</span>
            </button>
          </div>

          {showSocials && (
            <div className="resource-hub-socials">
              {SOCIAL_LINKS.map(({ label, url, Icon }) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="resource-hub-social-link">
                  <Icon />
                  <span>{label}</span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="resource-hub-section" id="faq-section">
          <h2><HelpCircleIcon /> Frequently Asked Questions</h2>
          <div className="resource-hub-search">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search"
              value={faqQuery}
              onChange={e => setFaqQuery(e.target.value)}
            />
          </div>

          <div className="resource-hub-faq-list">
            {filteredFaqs.length === 0 ? (
              <p className="resource-hub-faq-empty">No matching questions.</p>
            ) : (
              filteredFaqs.map((item, i) => {
                const isOpen = openFaqIndex === i;
                return (
                  <div key={item.q} className="resource-hub-faq-item">
                    <button
                      className="resource-hub-faq-question"
                      onClick={() => setOpenFaqIndex(isOpen ? null : i)}
                    >
                      <span>{item.q}</span>
                      <span className={`resource-hub-faq-chevron${isOpen ? ' open' : ''}`}>
                        <ChevronDownIcon />
                      </span>
                    </button>
                    {isOpen && <p className="resource-hub-faq-answer">{item.a}</p>}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
