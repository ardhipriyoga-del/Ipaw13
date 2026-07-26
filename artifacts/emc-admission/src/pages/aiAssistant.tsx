import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, Trash2, Loader2, User, Sparkles, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { apiUrl } from '@/lib/apiConfig';
import { exportAllStoresForAI } from '@/lib/aiContext';

/* ── Types ─────────────────────────────────────────────────────────── */
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/* ── Suggested starters ─────────────────────────────────────────────── */
const SUGGESTIONS = [
  'Bagaimana cara menambah pasien rawat inap baru?',
  'Apa itu SPRI dan bagaimana cara memonitornya?',
  'Jelaskan cara melakukan operan shift',
  'Apa fungsi fitur Cloud Backup?',
  'Jelaskan singkatan BPJS',
  'Apa itu ICD-10?',
];

/* ── Markdown-lite renderer ─────────────────────────────────────────── */
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={key++} className="font-semibold text-foreground mt-3 mb-1 text-sm">
          {line.slice(3)}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h2 key={key++} className="font-bold text-foreground mt-3 mb-1">
          {line.slice(2)}
        </h2>
      );
      i++;
      continue;
    }

    // Bullet list
    if (line.match(/^[-•*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-•*]\s/)) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-0.5 my-1 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm leading-relaxed">
              {inlineFormat(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={key++} className="list-decimal list-inside space-y-0.5 my-1 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="text-sm leading-relaxed">
              {inlineFormat(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line → paragraph break
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-1.5" />);
      i++;
      continue;
    }

    // Normal paragraph
    elements.push(
      <p key={key++} className="text-sm leading-relaxed">
        {inlineFormat(line)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

function inlineFormat(text: string): React.ReactNode {
  // Bold (**text**)
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        return part;
      })}
    </>
  );
}

/* ── Message bubble ─────────────────────────────────────────────────── */
function MessageBubble({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`
        w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5
        ${isUser
          ? 'bg-primary text-primary-foreground'
          : 'bg-sidebar text-sidebar-foreground'}
      `}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Bubble */}
      <div className={`
        max-w-[78%] rounded-2xl px-4 py-3 shadow-sm
        ${isUser
          ? 'bg-primary text-primary-foreground rounded-tr-sm'
          : 'bg-card border border-border rounded-tl-sm'}
      `}>
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none">
            {renderMarkdown(message.content)}
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-primary ml-0.5 animate-pulse rounded-sm" />
            )}
          </div>
        )}
        <p className={`text-[10px] mt-1.5 ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          {message.timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────── */
export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* Auto-scroll */
  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
  }, []);

  useEffect(() => {
    if (streamingId || messages.length) scrollToBottom();
  }, [messages, streamingId, scrollToBottom]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);
  };

  /* Send message */
  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, assistantMsg]);
    setStreamingId(assistantId);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const applicationContext = await exportAllStoresForAI();

      const res = await fetch(apiUrl('/api/ai/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, applicationContext }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);
            if (event.error) throw new Error(event.error);
            if (event.done) break;
            if (event.content) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.content }
                    : m
                )
              );
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      toast.error('Gagal mendapatkan respons dari AI. Silakan coba lagi.');
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    } finally {
      setIsLoading(false);
      setStreamingId(null);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setIsLoading(false);
    setStreamingId(null);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-background">

      {/* ── Header ── */}
      <div className="shrink-0 border-b bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sidebar flex items-center justify-center shadow-sm">
            <Sparkles className="w-5 h-5 text-sidebar-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-foreground leading-tight">AI Assistant</h1>
            <p className="text-xs text-muted-foreground">IP Admission Workspace · Data aplikasi terhubung</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            Online
          </Badge>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearChat} className="text-muted-foreground gap-1.5">
              <Trash2 className="w-3.5 h-3.5" />
              Hapus Riwayat
            </Button>
          )}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 space-y-5 relative"
      >
        {isEmpty ? (
          /* Welcome state */
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 pb-16">
            <div className="w-16 h-16 rounded-2xl bg-sidebar flex items-center justify-center shadow-md">
              <Bot className="w-8 h-8 text-sidebar-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Halo! Saya AI Assistant</h2>
              <p className="text-muted-foreground text-sm max-w-sm">
                Saya siap membantu Anda menggunakan IP Admission Workspace dan menjawab pertanyaan seputar medis.
              </p>
            </div>
            <div className="w-full max-w-lg space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Mulai dengan pertanyaan berikut</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    className="text-left text-sm px-4 py-3 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/30 transition-colors text-foreground/80 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={msg.id === streamingId && isLoading}
              />
            ))}
            {/* Loading dots when awaiting first token */}
            {isLoading && streamingId && messages.find(m => m.id === streamingId)?.content === '' && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-sidebar flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-sidebar-foreground" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <div className="absolute right-6 bottom-24 z-10">
          <Button
            size="icon"
            variant="secondary"
            className="rounded-full shadow-md w-8 h-8"
            onClick={() => scrollToBottom()}
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ── Input bar ── */}
      <div className="shrink-0 border-t bg-card px-4 py-3">
        <div className="max-w-4xl mx-auto flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik pertanyaan Anda… (Enter untuk kirim, Shift+Enter untuk baris baru)"
            rows={1}
            className="resize-none min-h-[42px] max-h-36 overflow-y-auto leading-relaxed flex-1"
            style={{ height: 'auto' }}
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
            }}
            disabled={isLoading}
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-[42px] w-[42px] shrink-0"
          >
            {isLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </Button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground mt-2">
          AI Assistant dapat membuat kesalahan. Verifikasi informasi penting dengan tenaga kesehatan berwenang.
        </p>
      </div>
    </div>
  );
}
