import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  X, 
  Copy, 
  Check, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Save, 
  MessageSquarePlus, 
  AlertCircle 
} from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

export interface ObservacaoModalData {
  cliente: string;
  tipo: 'Obra' | 'Serviço' | string;
  observacao: string;
  data?: string;
  firebaseId?: string;
  collectionName?: 'obras' | 'servicos' | string;
  onSave?: (newCombinedObs: string) => Promise<void> | void;
}

interface ObservacaoModalProps {
  data: ObservacaoModalData | null;
  onClose: () => void;
}

type FontSize = 'normal' | 'grande' | 'extra' | 'gigante';

const FONT_CLASSES: Record<FontSize, string> = {
  normal: 'text-lg sm:text-xl md:text-2xl leading-relaxed',
  grande: 'text-xl sm:text-2xl md:text-3xl leading-relaxed',
  extra: 'text-2xl sm:text-3xl md:text-4xl leading-snug font-semibold',
  gigante: 'text-3xl sm:text-4xl md:text-5xl leading-snug font-bold',
};

const FONT_LABELS: Record<FontSize, string> = {
  normal: '20px',
  grande: '26px',
  extra: '34px',
  gigante: '42px',
};

export function parseObservations(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items: string[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^([•\-\*]|\d+[\.\)])\s*/, '').trim();
    if (cleaned) {
      items.push(cleaned);
    }
  }
  return items.length > 0 ? items : (raw.trim() ? [raw.trim()] : []);
}

export function combineObservations(items: string[]): string {
  const valid = items.map(s => s.trim()).filter(Boolean);
  if (valid.length === 0) return '';
  if (valid.length === 1) return valid[0];
  return valid.map(item => `• ${item}`).join('\n');
}

export default function ObservacaoModal({ data, onClose }: ObservacaoModalProps) {
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>('grande');
  const [obsList, setObsList] = useState<string[]>([]);
  const [newObsText, setNewObsText] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (data?.observacao !== undefined) {
      setObsList(parseObservations(data.observacao));
    } else {
      setObsList([]);
    }
    setNewObsText('');
    setIsAdding(false);
    setStatusMsg(null);
  }, [data]);

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

  const persistChanges = async (updatedList: string[]) => {
    const combined = combineObservations(updatedList);
    setIsSaving(true);
    try {
      if (data.onSave) {
        await data.onSave(combined);
      } else if (data.firebaseId && data.collectionName) {
        const fieldName = data.collectionName === 'obras' ? 'observacoes' : 'observacao';
        await updateDoc(doc(db, data.collectionName, data.firebaseId), {
          [fieldName]: combined,
          updatedAt: serverTimestamp()
        });
      }
      setObsList(updatedList);
      data.observacao = combined;
      setStatusMsg({ text: 'Observações atualizadas com sucesso!', type: 'success' });
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      console.error('Erro ao salvar observação:', err);
      setStatusMsg({ text: 'Erro ao salvar. Verifique sua conexão.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddObservation = async () => {
    const trimmed = newObsText.trim();
    if (!trimmed) return;

    const updated = [...obsList, trimmed];
    await persistChanges(updated);
    setNewObsText('');
    setIsAdding(false);
  };

  const handleRemoveObservation = async (index: number) => {
    const updated = obsList.filter((_, idx) => idx !== index);
    await persistChanges(updated);
  };

  const handleCopy = () => {
    const textToCopy = combineObservations(obsList);
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
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
          className="absolute inset-0 bg-slate-950/75 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative modal-responsive w-[95vw] sm:w-[90vw] max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] border-2 border-amber-300 ring-4 ring-amber-500/10"
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
                  <span className="text-[10px] font-black bg-amber-900/40 px-2 py-0.5 rounded text-amber-100">
                    {obsList.length} {obsList.length === 1 ? 'observação' : 'observações'}
                  </span>
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
                  className="p-1.5 text-white hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-transparent rounded-lg transition-all cursor-pointer"
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
                  className="p-1.5 text-white hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-transparent rounded-lg transition-all cursor-pointer"
                  title="Aumentar tamanho da letra (+)"
                >
                  <ZoomIn size={16} />
                </button>
                {fontSize !== 'grande' && (
                  <button
                    type="button"
                    onClick={() => setFontSize('grande')}
                    className="p-1.5 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-all cursor-pointer"
                    title="Restaurar tamanho padrão"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-white/85 hover:text-white hover:bg-white/25 rounded-xl transition-colors ml-1 cursor-pointer"
                title="Fechar janela (Esc)"
              >
                <X size={22} className="stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* Feedback Toast Banner */}
          {statusMsg && (
            <div className={`px-4 py-2 text-xs font-bold text-center transition-all ${
              statusMsg.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
            }`}>
              {statusMsg.text}
            </div>
          )}

          {/* Área principal: LISTA DE OBSERVAÇÕES E AÇÃO DE COLOCAR MAIS DE UMA */}
          <div className="p-4 sm:p-6 overflow-y-auto bg-amber-50/30 flex-1 space-y-4">
            
            {/* Header com botão de Ação para adicionar mais uma observação */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-2xs">
                  Lista de Observações
                </span>
                <span className="text-xs text-slate-500 font-bold">
                  Texto em destaque ampliado
                </span>
              </div>

              {/* Botão de Ação: Colocar Mais de Uma Observação */}
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl shadow-sm hover:shadow transition-all active:scale-95 cursor-pointer"
              >
                <Plus size={15} className="stroke-[3]" />
                <span>+ Adicionar Mais Uma Observação</span>
              </button>
            </div>

            {/* Painel expansível para cadastrar nova observação */}
            {isAdding && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-4 bg-white rounded-2xl border-2 border-amber-400 shadow-md space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-1 bg-amber-100 text-amber-800 rounded-lg">
                      <MessageSquarePlus size={16} />
                    </span>
                    <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                      Nova Observação ({obsList.length + 1}ª)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsAdding(false); setNewObsText(''); }}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>

                <textarea
                  autoFocus
                  rows={3}
                  value={newObsText}
                  onChange={(e) => setNewObsText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleAddObservation();
                    }
                  }}
                  placeholder="Escreva aqui a nova observação para este lançamento..."
                  className="w-full p-3 bg-amber-50/50 border border-amber-200 rounded-xl text-sm font-medium text-slate-900 outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 resize-none"
                />

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400 font-medium">
                    Pressione <kbd className="bg-slate-100 px-1 py-0.5 rounded border border-slate-200 font-mono text-[9px]">Ctrl + Enter</kbd> para salvar
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setIsAdding(false); setNewObsText(''); }}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!newObsText.trim() || isSaving}
                      onClick={handleAddObservation}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white text-xs font-black rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Save size={13} />
                      <span>{isSaving ? 'Salvando...' : 'Salvar Observação'}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Lista dos cards de observações individuais */}
            {obsList.length === 0 ? (
              <div className="p-8 bg-white rounded-2xl border-2 border-dashed border-amber-200 text-center space-y-3">
                <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center mx-auto">
                  <FileText size={24} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800">Nenhuma observação registrada</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Clique no botão acima para adicionar a primeira observação deste cliente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-xl shadow-sm transition-all active:scale-95 cursor-pointer"
                >
                  <Plus size={14} className="stroke-[3]" />
                  <span>Adicionar Observação Agora</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {obsList.map((obs, idx) => (
                  <div
                    key={idx}
                    className="p-5 sm:p-6 bg-white rounded-2xl border-2 border-amber-200/90 shadow-sm relative group hover:border-amber-300 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-amber-100">
                      <div className="flex items-center gap-2">
                        <span className="bg-amber-400 text-amber-950 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded shadow-2xs">
                          Observação #{idx + 1}
                        </span>
                        {obsList.length > 1 && (
                          <span className="text-[10px] text-slate-400 font-bold">
                            Item {idx + 1} de {obsList.length}
                          </span>
                        )}
                      </div>

                      {/* Ações por item (Copiar individual e Excluir) */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(obs);
                            setStatusMsg({ text: `Observação #${idx + 1} copiada!`, type: 'success' });
                            setTimeout(() => setStatusMsg(null), 2000);
                          }}
                          className="p-1 text-slate-400 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="Copiar apenas esta observação"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveObservation(idx)}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Excluir esta observação"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Texto com letra grande, nítida e espaçada */}
                    <p className={`${FONT_CLASSES[fontSize]} text-slate-900 font-medium whitespace-pre-wrap select-text break-words tracking-normal selection:bg-amber-200`}>
                      {obs}
                    </p>
                  </div>
                ))}

                {/* Botão sutil no final da lista para adicionar mais uma */}
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="w-full py-2.5 px-4 bg-white hover:bg-amber-50 text-amber-800 border-2 border-dashed border-amber-300 hover:border-amber-400 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs active:scale-[0.99]"
                >
                  <Plus size={15} className="stroke-[3]" />
                  <span>+ Colocar Mais Uma Observação</span>
                </button>
              </div>
            )}
          </div>

          {/* Rodapé com atalhos de copiar e fechar */}
          <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              disabled={obsList.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 font-bold text-xs rounded-xl transition-all active:scale-95 border border-slate-200 cursor-pointer disabled:cursor-not-allowed"
            >
              {copied ? <Check size={16} className="text-emerald-600 stroke-[3]" /> : <Copy size={16} />}
              <span>{copied ? 'Copiado para área de transferência!' : 'Copiar Todas as Observações'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md shadow-amber-500/25 transition-all active:scale-95 cursor-pointer"
            >
              Fechar (Esc)
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
