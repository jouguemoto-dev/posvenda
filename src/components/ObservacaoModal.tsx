import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FileText, X, Copy, Check, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export interface ObservacaoModalData {
  cliente: string;
  tipo: 'Obra' | 'Serviço' | string;
  observacao: string;
  data?: string;
}

interface ObservacaoModalProps {
  data: ObservacaoModalData | null;
  onClose: () => void;
}

type FontSize = 'normal' | 'grande' | 'extra' | 'gigante';

const FONT_CLASSES: Record<FontSize, string> = {
  normal: 'text-xl sm:text-2xl md:text-3xl leading-relaxed',
  grande: 'text-2xl sm:text-3xl md:text-4xl leading-relaxed',
  extra: 'text-3xl sm:text-4xl md:text-5xl leading-snug font-semibold',
  gigante: 'text-4xl sm:text-5xl md:text-6xl leading-snug font-bold',
};

const FONT_LABELS: Record<FontSize, string> = {
  normal: '24px',
  grande: '32px',
  extra: '40px',
  gigante: '48px',
};

export default function ObservacaoModal({ data, onClose }: ObservacaoModalProps) {
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>('grande');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.key === '+' || e.key === '=') && (e.ctrlKey || e.metaKey || !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName))) {
        e.preventDefault();
        increaseFontSize();
      } else if (e.key === '-' && (e.ctrlKey || e.metaKey || !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName))) {
        e.preventDefault();
        decreaseFontSize();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, fontSize]);

  if (!data) return null;

  const increaseFontSize = () => {
    setFontSize(prev => {
      if (prev === 'normal') return 'grande';
      if (prev === 'grande') return 'extra';
      if (prev === 'extra') return 'gigante';
      return prev;
    });
  };

  const decreaseFontSize = () => {
    setFontSize(prev => {
      if (prev === 'gigante') return 'extra';
      if (prev === 'extra') return 'grande';
      if (prev === 'grande') return 'normal';
      return prev;
    });
  };

  const handleCopy = () => {
    if (data?.observacao) {
      navigator.clipboard.writeText(data.observacao);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border-2 border-amber-300 ring-4 ring-amber-500/10"
        >
          {/* Header minimalista com foco no cliente e tipo */}
          <div className="px-6 py-4 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white flex items-center justify-between shadow-sm shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-white/20 rounded-xl shrink-0 backdrop-blur-sm shadow-xs">
                <FileText size={22} className="stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase font-black tracking-widest bg-white/25 px-2 py-0.5 rounded-md shadow-2xs">
                    {data.tipo}
                  </span>
                  {data.data && (
                    <span className="text-[11px] font-bold text-amber-100 opacity-95">
                      • {data.data}
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-black truncate mt-0.5 tracking-tight text-white drop-shadow-xs">
                  {data.cliente}
                </h3>
              </div>
            </div>

            {/* Controles rápidos de zoom da fonte e fechar */}
            <div className="flex items-center gap-1.5 shrink-0 ml-3">
              <div className="hidden sm:flex items-center gap-1 bg-black/20 p-1 rounded-xl backdrop-blur-xs">
                <button
                  type="button"
                  onClick={decreaseFontSize}
                  disabled={fontSize === 'normal'}
                  className="p-1.5 text-white hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-transparent rounded-lg transition-all"
                  title="Diminuir tamanho da letra (-)"
                >
                  <ZoomOut size={16} />
                </button>
                <span className="text-[11px] font-mono font-black px-1.5 text-white/90 min-w-[36px] text-center select-none">
                  {FONT_LABELS[fontSize]}
                </span>
                <button
                  type="button"
                  onClick={increaseFontSize}
                  disabled={fontSize === 'gigante'}
                  className="p-1.5 text-white hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-transparent rounded-lg transition-all"
                  title="Aumentar tamanho da letra (+)"
                >
                  <ZoomIn size={16} />
                </button>
                {fontSize !== 'grande' && (
                  <button
                    type="button"
                    onClick={() => setFontSize('grande')}
                    className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-all"
                    title="Restaurar tamanho padrão"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-white/85 hover:text-white hover:bg-white/25 rounded-xl transition-colors ml-1"
                title="Fechar janela (Esc)"
              >
                <X size={22} className="stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Área principal: APENAS A OBSERVAÇÃO COM LETRA MAIOR */}
          <div className="p-6 sm:p-10 overflow-y-auto bg-amber-50/30 flex-1 flex flex-col justify-center min-h-[220px]">
            <div className="bg-white p-6 sm:p-10 rounded-2xl border-2 border-amber-200/90 shadow-sm relative">
              <div className="flex items-center justify-between gap-2 mb-4 pb-2 border-b border-amber-100">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-2xs">
                    Observação
                  </span>
                  <span className="text-xs text-slate-400 font-bold">
                    Texto em destaque e ampliado
                  </span>
                </div>
                {/* Indicador mobile de tamanho */}
                <div className="flex sm:hidden items-center gap-1">
                  <button
                    onClick={decreaseFontSize}
                    disabled={fontSize === 'normal'}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold disabled:opacity-40"
                  >
                    A-
                  </button>
                  <button
                    onClick={increaseFontSize}
                    disabled={fontSize === 'gigante'}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-bold disabled:opacity-40"
                  >
                    A+
                  </button>
                </div>
              </div>

              {/* Texto com letra grande, nítida e espaçada */}
              <p className={`${FONT_CLASSES[fontSize]} text-slate-900 font-medium whitespace-pre-wrap select-text break-words tracking-normal selection:bg-amber-200`}>
                {data.observacao || 'Nenhuma observação registrada.'}
              </p>
            </div>
          </div>

          {/* Rodapé com atalhos de copiar e fechar */}
          <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all active:scale-95 border border-slate-200"
            >
              {copied ? <Check size={16} className="text-emerald-600 stroke-[3]" /> : <Copy size={16} />}
              <span>{copied ? 'Copiado para área de transferência!' : 'Copiar Texto da Observação'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-amber-500/25 transition-all active:scale-95"
            >
              Fechar (Esc)
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
