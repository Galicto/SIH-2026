import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import DashboardLayout from '../components/DashboardLayout';
import { useLanguage } from '../lib/i18n';
import { usePredX } from '../context/PredXContext';
import { chatWithAdvisor, fetchAiHealth } from '../lib/geminiAdvisor';
import PanelErrorBoundary from '../components/PanelErrorBoundary';
import { API_BASE_URL } from '../config';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = {
  en: [
    'Which business is safest for my budget?',
    'Why is this business recommended?',
    'What happens if income drops by 20%?',
    'Which schemes may support this business?',
    'What documents should I prepare?',
    'Show businesses with lower competition near me.',
  ],
  hi: [
    'मेरे बजट के लिए कौन सा व्यवसाय सबसे सुरक्षित है?',
    'इस व्यवसाय की सिफारिश क्यों की जाती है?',
    'यदि आय 20% गिर जाए तो क्या होगा?',
    'कौन सी योजनाएं इस व्यवसाय का समर्थन कर सकती हैं?',
    'मुझे कौन से दस्तावेज़ तैयार करने चाहिए?',
    'मेरे आस-पास कम प्रतिस्पर्धा वाले व्यवसाय दिखाएं।',
  ],
};

export default function ArthnitiChat() {
  const { t, lang, toggleLang } = useLanguage();
  const { navigate } = usePredX();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [aiStatus, setAiStatus] = useState<'checking' | 'ready' | 'unavailable' | 'not_configured'>('checking');
  const [aiMessage, setAiMessage] = useState('');
  const [lastFailedStatus, setLastFailedStatus] = useState<number | null>(null);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const checkHealth = async () => {
    setAiStatus('checking');
    try {
      const health = await fetch(`${API_BASE_URL}/api/health`);
      setBackendReachable(health.ok);
    } catch {
      setBackendReachable(false);
    }
    try {
      const data = await fetchAiHealth();
      setAiConfigured(data.status !== 'not_configured');
      if (data.status === 'connected') {
        setAiStatus('ready');
        setAiMessage('');
        setLastFailedStatus(null);
      } else {
        setAiStatus(data.status === 'not_configured' ? 'not_configured' : 'unavailable');
        setAiMessage(`AI connection failed: ${data.safeReason || 'Unknown error'}`);
      }
    } catch {
      setAiStatus('unavailable');
      setAiConfigured(null);
      setAiMessage('AI connection failed: network_failure');
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const profile = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('arthniti-profile') || 'null'); } catch { return null; }
  }, []);
  const business = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('arthniti-selected-business') || 'null'); } catch { return null; }
  }, []);
  const compared = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('arthniti-compared-businesses') || '[]'); } catch { return []; }
  }, []);
  const discoveryResults = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('arthniti-discovery-results') || '[]'); } catch { return []; }
  }, []);
  const discoveryMeta = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('arthniti-discovery-meta') || 'null'); } catch { return null; }
  }, []);
  const comparisonApi = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('arthniti-comparison-result') || 'null'); } catch { return null; }
  }, []);
  const financialPlan = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('arthniti-financial-plan') || 'null'); } catch { return null; }
  }, []);
  const schemeMatches = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem('arthniti-scheme-matches') || '[]'); } catch { return []; }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: lang === 'hi'
          ? 'नमस्ते! मैं व्यापार-मित्र सहायक हूँ। मैं आपको ऋण योजनाओं, EMI गणना, व्यावसायिक जोखिमों और पात्रता के बारे में मदद कर सकता हूँ। कृपया पूछें!'
          : 'Hello! I\'m the Vyapar-Mitra Assistant. I can help you understand loan schemes, EMI calculations, business risks, and eligibility using your saved location and discovery data. Feel free to ask!',
        timestamp: new Date(),
      }]);
    }
  }, []);

  const buildContext = () => {
    const selected = business ? [business] : (compared.length ? compared : []);
    const sources: any[] = [];
    if (discoveryMeta) sources.push({ type: 'discovery', ...discoveryMeta });
    selected.forEach((b: any) => {
      if (b?.provenance) sources.push({ type: 'business', name: b.name, ...b.provenance });
    });
    return {
      language: lang === 'hi' ? 'hi' : 'en',
      location: profile?.location || undefined,
      businessDiscoveryResults: discoveryResults.length ? discoveryResults : undefined,
      selectedBusinesses: selected.length ? selected : undefined,
      comparison: comparisonApi || (compared.length ? { businesses: compared } : undefined),
      financialPlan: financialPlan || undefined,
      schemeMatches: schemeMatches.length
        ? schemeMatches
        : selected.flatMap((b: any) => b?.matchedSchemes || []),
      sourceMetadata: sources,
      context: { profile: profile || undefined },
    };
  };

  const handleSend = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || isThinking || aiStatus === 'unavailable' || aiStatus === 'not_configured') return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: msg,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    const result = await chatWithAdvisor(msg, buildContext());

    if (result.ok) {
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
      }]);
      setLastFailedStatus(null);
    } else {
      setMessages(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: `Sorry, I encountered an error: ${result.message}`,
        timestamp: new Date(),
      }]);
      setLastFailedStatus(result.statusCode);
    }

    setIsThinking(false);
    inputRef.current?.focus();
  };

  const questions = SUGGESTED_QUESTIONS[lang] || SUGGESTED_QUESTIONS.en;
  const chatDisabled = aiStatus === 'unavailable' || aiStatus === 'not_configured' || aiStatus === 'checking';

  return (
    <DashboardLayout>
      <PanelErrorBoundary fallbackMessage="Vyapar-Mitra Assistant could not load.">
      <div className="px-4 md:px-8 pb-12 md:pb-8 pt-4 max-w-4xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-[#FF8C00] flex items-center justify-center shadow-[0_0_20px_rgb(var(--primary)/0.3)]">
              <span className="material-symbols-outlined text-on-primary text-xl">smart_toy</span>
            </div>
            <div>
              <h1 className="text-lg font-headline font-bold text-on-surface">{t('chat.title')}</h1>
              <p className="text-[10px] font-label text-on-surface/50 uppercase tracking-wider">
                {business || compared.length
                  ? (lang === 'hi' ? 'आपकी रिपोर्ट से संदर्भ' : 'Context from your report')
                  : (lang === 'hi' ? 'सामान्य सलाहकार' : 'General Advisor')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('explore')}
              className="text-[10px] font-bold text-primary px-2 py-1 rounded-lg hover:bg-primary/10"
            >
              Explore
            </button>
            <button
              onClick={toggleLang}
              className="flex items-center gap-2 bg-on-surface/5 border border-on-surface/10 px-3 py-1.5 rounded-xl text-xs font-body font-semibold text-on-surface/70 hover:bg-on-surface/10 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">translate</span>
              {t('common.language')}
            </button>
          </div>
        </div>

        {(aiStatus === 'unavailable' || aiStatus === 'not_configured') && (
          <div className="bg-surface-container border border-outline-variant/10 p-5 rounded-2xl text-center mb-4 max-w-lg mx-auto flex-shrink-0">
            <span className="material-symbols-outlined text-4xl text-on-surface/40 mb-3">cloud_off</span>
            <p className="text-base font-bold text-on-surface mb-2">AI Provider Verification Failed</p>
            <p className="text-sm text-on-surface/60 mb-4">{aiMessage}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={checkHealth}
                className="bg-primary/10 text-primary px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary/20"
              >
                Retry
              </button>
              <button
                onClick={() => navigate('explore')}
                className="bg-surface-container-high text-on-surface px-4 py-2 rounded-xl text-sm font-bold"
              >
                Explore Businesses
              </button>
              <button
                onClick={() => navigate('compare')}
                className="bg-surface-container-high text-on-surface px-4 py-2 rounded-xl text-sm font-bold"
              >
                View Report
              </button>
            </div>
          </div>
        )}

        {messages.length <= 1 && aiStatus === 'ready' && (
          <div className="mb-4 flex-shrink-0">
            <span className="text-[10px] font-label text-on-surface/50 uppercase tracking-widest block mb-2">
              {t('chat.suggestedQuestions')}
            </span>
            <div className="flex flex-wrap gap-2">
              {questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  className="bg-on-surface/5 border border-on-surface/10 text-on-surface/70 px-3 py-2 rounded-xl text-xs font-body hover:bg-primary/10 hover:border-primary/20 hover:text-primary transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 mb-4">
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl text-sm font-body leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-primary to-[#FF8C00] text-on-primary rounded-br-md'
                  : 'bg-on-surface/5 border border-on-surface/10 text-on-surface/80 rounded-bl-md'
              }`}>
                {msg.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                ) : (
                  <div className="markdown-chat">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
                <div className={`text-[9px] mt-2 ${msg.role === 'user' ? 'text-on-primary/50' : 'text-on-surface/30'}`}>
                  {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex justify-start">
              <div className="bg-on-surface/5 border border-on-surface/10 p-4 rounded-2xl rounded-bl-md flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-xs text-on-surface/40 font-body">{t('chat.thinking')}</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="flex-shrink-0 flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder={chatDisabled ? 'Chat unavailable' : t('chat.placeholder')}
              disabled={isThinking || chatDisabled}
              className="w-full bg-on-surface/5 border border-on-surface/10 text-on-surface rounded-2xl px-5 py-4 text-sm font-body focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:outline-none transition-colors disabled:opacity-50 pr-12"
            />
          </div>
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isThinking || chatDisabled}
            className="w-12 h-12 rounded-2xl bg-gradient-to-r from-primary to-[#FF8C00] text-on-primary flex items-center justify-center hover:shadow-[0_0_20px_rgb(var(--primary)/0.3)] transition-all active:scale-90 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
          >
            <span className="material-symbols-outlined">send</span>
          </button>
        </div>
        <p className="text-center text-[10px] text-on-surface/40 font-body mt-3 mb-2 flex-shrink-0">
          {lang === 'hi'
            ? 'सहायक गलती कर सकता है। यह ऋण को मंजूरी नहीं दे सकता। किसी भी जानकारी को बैंक के साथ सत्यापित करें।'
            : 'Assistant may make mistakes. It cannot approve loans. Verify any scheme details with a bank.'}
        </p>

        {import.meta.env.DEV && (
          <div className="text-[10px] font-mono text-on-surface/40 border-t border-outline-variant/10 pt-2 flex-shrink-0">
            backend reachable: {backendReachable == null ? '…' : backendReachable ? 'yes' : 'no'} ·
            AI configured: {aiConfigured == null ? '…' : aiConfigured ? 'yes' : 'no'} ·
            AI health: {aiStatus} ·
            last failed status: {lastFailedStatus ?? '—'}
          </div>
        )}
      </div>
      </PanelErrorBoundary>
    </DashboardLayout>
  );
}
