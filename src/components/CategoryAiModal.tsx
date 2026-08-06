import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Bot, User, BookOpen, RefreshCw, HelpCircle, Tags } from 'lucide-react';
import { Category } from '../types';
import { useSidebar } from '../lib/sidebar-context';
import { useModalEsc, getModalOverlayClass } from '../lib/use-modal-esc';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

interface CategoryAiModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
}

export const CategoryAiModal: React.FC<CategoryAiModalProps> = ({
  isOpen,
  onClose,
  categories,
}) => {
  const { sidebarHidden } = useSidebar();
  const [activeTab, setActiveTab] = useState<'chat' | 'classifier'>('chat');
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'ai',
      text: 'Halo! Saya **Asisten AI Kategori Buku** KangenBukuIndo. 📚\n\nSaya dapat membantu Anda menentukan kategori yang paling cocok untuk buku baru, memberikan saran pengelompokan genre, atau mengusulkan kategori baru jika belum ada di sistem.',
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  useModalEsc(isOpen, onClose, isLoading);

  // Form states for Book Classifier tab
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookDescription, setBookDescription] = useState('');
  const [classificationResult, setClassificationResult] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  if (!isOpen) return null;

  const categoryNames = categories.map((c) => c.name);

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = textToSend || inputMessage;
    if (!prompt.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      text: prompt,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/category-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          categories: categoryNames,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Terjadi kesalahan pada AI Server.');
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: data.response || 'Tidak ada respon dari AI.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        text: `⚠️ **Gagal memproses**: ${err.message || 'Koneksi bermasalah.'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClassifyBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!bookTitle && !bookDescription) || isLoading) return;

    setIsLoading(true);
    setClassificationResult(null);

    try {
      const res = await fetch('/api/category-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Rekomendasikan kategori paling tepat dari daftar kategori yang ada untuk buku ini:`,
          categories: categoryNames,
          bookInfo: {
            title: bookTitle,
            author: bookAuthor,
            description: bookDescription,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menganalisis buku.');
      }

      setClassificationResult(data.response);
    } catch (err: any) {
      setClassificationResult(`⚠️ Error: ${err.message || 'Gagal terhubung ke AI.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    'Rekomendasikan kategori untuk novel sejarah/biografi',
    'Kategori apa saja yang saat ini ada di catalog?',
    'Bagaimana cara mengelompokkan buku anak & komik?',
    'Saran kategori baru untuk komik manga & webtoon',
  ];

  return (
    <div className={getModalOverlayClass(sidebarHidden, 'z-50')}>
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 w-[92%] max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[620px] max-h-[90vh] my-auto">
        
        {/* Header */}
        <div className="px-6 py-4 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shadow-inner">
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base flex items-center gap-2 text-white">
                AI Asisten Kategori Buku
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold px-2 py-0.5 rounded-full">
                  Gemini 3.6 Flash
                </span>
              </h3>
              <p className="text-xs text-neutral-400 font-medium">
                Tanya Jawab & Rekomendasi Kategori Katalog
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-6 pt-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`pb-2.5 px-4 font-semibold text-xs transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'chat'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <Bot className="w-4 h-4" />
            Chat Tanya Kategori
          </button>
          <button
            onClick={() => setActiveTab('classifier')}
            className={`pb-2.5 px-4 font-semibold text-xs transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'classifier'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Cek Kategori Buku Baru
          </button>
        </div>

        {/* Tab 1: Chat Tanya Kategori */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0 bg-neutral-50/50 dark:bg-neutral-900/50">
            {/* Active Categories Badge Bar */}
            <div className="px-6 py-2 bg-neutral-100 dark:bg-neutral-950/80 border-b border-neutral-200/60 dark:border-neutral-800/60 flex items-center gap-2 overflow-x-auto text-[11px] text-neutral-600 dark:text-neutral-400">
              <Tags className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
              <span className="font-semibold shrink-0">Kategori Aktif ({categories.length}):</span>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {categories.length > 0 ? (
                  categories.map((c) => (
                    <span
                      key={c.id}
                      className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-2 py-0.5 rounded-md font-medium text-neutral-700 dark:text-neutral-300 whitespace-nowrap text-[10.5px]"
                    >
                      {c.name}
                    </span>
                  ))
                ) : (
                  <span className="italic text-neutral-400">Belum ada kategori</span>
                )}
              </div>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${
                    m.sender === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {m.sender === 'ai' && (
                    <div className="w-8 h-8 rounded-full bg-indigo-600/10 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[82%] rounded-2xl p-4 text-xs leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none shadow-md font-medium'
                        : 'bg-white dark:bg-neutral-800 border border-neutral-200/80 dark:border-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-bl-none shadow-sm whitespace-pre-wrap'
                    }`}
                  >
                    {m.text}
                  </div>

                  {m.sender === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-neutral-700 dark:text-neutral-300 shrink-0 mt-0.5 font-bold text-xs">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 justify-start items-center">
                  <div className="w-8 h-8 rounded-full bg-indigo-600/10 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                  </div>
                  <div className="bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl rounded-bl-none p-3.5 text-xs text-neutral-500 dark:text-neutral-400 italic flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                    Menganalisis pertanyaan dan kategori...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompts */}
            <div className="px-6 py-2 bg-neutral-100/70 dark:bg-neutral-950/40 border-t border-neutral-200/50 dark:border-neutral-800/50 flex gap-1.5 overflow-x-auto no-scrollbar">
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(qp)}
                  disabled={isLoading}
                  className="bg-white dark:bg-neutral-800 hover:bg-indigo-50 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700 hover:border-indigo-300 text-neutral-700 dark:text-neutral-300 hover:text-indigo-600 dark:hover:text-indigo-400 text-[11px] px-3 py-1 rounded-full whitespace-nowrap transition-all shadow-2xs font-medium"
                >
                  {qp}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-4 bg-white dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
              <input
                type="text"
                placeholder="Tanyakan rekomendasi atau klasifikasi kategori buku..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isLoading}
                className="flex-1 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-4 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputMessage.trim() || isLoading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 transition-all shadow-sm"
              >
                <Send className="w-4 h-4" />
                Kirim
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Cek Kategori Buku Baru */}
        {activeTab === 'classifier' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-5 bg-neutral-50/30 dark:bg-neutral-900/30">
            <div className="bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/50 rounded-xl p-4 flex gap-3 text-xs text-indigo-900 dark:text-indigo-200">
              <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Analisis Otomatis Kategori Buku</p>
                <p className="text-neutral-600 dark:text-neutral-400 text-[11px] leading-relaxed">
                  Masukkan judul, penulis, atau ringkasan sinopsis buku baru. AI akan membandingkannya dengan kategori yang aktif dan memberikan rekomendasi terbaik.
                </p>
              </div>
            </div>

            <form onSubmit={handleClassifyBook} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Judul Buku <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Bumi Manusia"
                  value={bookTitle}
                  onChange={(e) => setBookTitle(e.target.value)}
                  className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Penulis / Pengarang
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pramoedya Ananta Toer"
                  value={bookAuthor}
                  onChange={(e) => setBookAuthor(e.target.value)}
                  className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                  Deskripsi / Sinopsis / Catatan
                </label>
                <textarea
                  rows={3}
                  placeholder="Contoh: Kisah Minke, pemuda Jawa pada masa kolonial Hindia Belanda..."
                  value={bookDescription}
                  onChange={(e) => setBookDescription(e.target.value)}
                  className="w-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3.5 py-2 text-xs text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={(!bookTitle.trim() && !bookDescription.trim()) || isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Menganalisis Kategori...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Analisis Kategori Terbaik
                  </>
                )}
              </button>
            </form>

            {classificationResult && (
              <div className="mt-4 p-4 bg-white dark:bg-neutral-800 border border-indigo-200 dark:border-indigo-900/50 rounded-xl shadow-sm">
                <h4 className="font-bold text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4" />
                  Rekomendasi AI Kategori:
                </h4>
                <div className="text-xs text-neutral-800 dark:text-neutral-200 leading-relaxed whitespace-pre-wrap">
                  {classificationResult}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
