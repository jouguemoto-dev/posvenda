import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  CalendarClock, 
  ChevronRight, 
  X, 
  Calendar, 
  Users, 
  Sun, 
  MapPin, 
  Sparkles,
  ExternalLink,
  EyeOff,
  Eye,
  BellOff
} from 'lucide-react';
import { Obra } from '../types';
import { generateObraGCalUrl } from '../lib/googleCalendar';

interface Proactive3DaysAlertProps {
  obras: Obra[];
  onSelectObra?: (obra: Obra) => void;
  formatDateBR?: (dateStr: string | undefined | null) => string;
}

export default function Proactive3DaysAlert({ obras, onSelectObra, formatDateBR }: Proactive3DaysAlertProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Helper for date formatting
  const formatBR = (dateStr: string | undefined | null) => {
    if (formatDateBR) return formatDateBR(dateStr);
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '---';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  // Automatically check on initialization (and when obras change) for upcoming 3-day installations
  const upcomingInstallations = useMemo(() => {
    if (!obras || obras.length === 0) return [];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return obras.filter(obra => {
      if (!obra.dataObra || !/^\d{4}-\d{2}-\d{2}$/.test(obra.dataObra)) return false;
      if (obra.situacao === 'Concluído') return false;

      const [y, m, d] = obra.dataObra.split('-').map(Number);
      const obraDate = new Date(y, m - 1, d);
      obraDate.setHours(0, 0, 0, 0);

      const diffTime = obraDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      // Return true if scheduled for today (0), tomorrow (1), day 2 or day 3
      return diffDays >= 0 && diffDays <= 3;
    }).map(obra => {
      const [y, m, d] = obra.dataObra!.split('-').map(Number);
      const obraDate = new Date(y, m - 1, d);
      obraDate.setHours(0, 0, 0, 0);

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffTime = obraDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      let timingLabel = 'Em 3 dias';
      let badgeStyle = 'bg-blue-600 text-white';

      if (diffDays === 0) {
        timingLabel = '⚡ HOJE';
        badgeStyle = 'bg-red-500 text-white animate-pulse font-black shadow-md shadow-red-500/30';
      } else if (diffDays === 1) {
        timingLabel = '📌 AMANHÃ';
        badgeStyle = 'bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-400/20';
      } else if (diffDays === 2) {
        timingLabel = '📅 Em 2 dias';
        badgeStyle = 'bg-indigo-600 text-white font-bold';
      } else if (diffDays === 3) {
        timingLabel = '📅 Em 3 dias';
        badgeStyle = 'bg-blue-600 text-white font-bold';
      }

      return {
        obra,
        diffDays,
        timingLabel,
        badgeStyle
      };
    }).sort((a, b) => a.diffDays - b.diffDays);
  }, [obras]);

  if (upcomingInstallations.length === 0) {
    return null;
  }

  if (isDismissed) {
    return (
      <div className="my-3 flex items-center justify-between bg-slate-900/90 text-slate-300 px-4 py-2.5 rounded-2xl border border-indigo-900/50 shadow-md backdrop-blur-md">
        <div className="flex items-center gap-2.5 text-xs font-semibold">
          <BellOff size={16} className="text-amber-400" />
          <span>Alerta proativo ocultado ({upcomingInstallations.length} {upcomingInstallations.length === 1 ? 'obra próxima' : 'obras próximas'})</span>
        </div>
        <button
          onClick={() => setIsDismissed(false)}
          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
        >
          <Eye size={14} />
          <span>Mostrar Alerta</span>
        </button>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -15, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -15, scale: 0.98 }}
        className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white p-5 md:p-6 rounded-3xl shadow-2xl border-2 border-indigo-500/30 relative overflow-hidden my-4"
      >
        {/* Glow & Decorative Background Elements */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-indigo-800/40 pb-4 mb-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="bg-gradient-to-tr from-amber-500 to-orange-400 p-3 rounded-2xl text-slate-950 shadow-lg shadow-amber-500/20 shrink-0">
              <CalendarClock size={24} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full tracking-wider uppercase flex items-center gap-1">
                  <Sparkles size={10} /> Verificação Automática na Inicialização
                </span>
                <span className="bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {upcomingInstallations.length} {upcomingInstallations.length === 1 ? 'Instalação Próxima' : 'Instalações Próximas'}
                </span>
              </div>
              <h2 className="text-lg md:text-xl font-black tracking-tight text-white mt-1 flex items-center gap-2">
                🚨 ALERTA PROATIVO: Instalações Previstas para os Próximos 3 Dias
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center shrink-0">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="px-3 py-1.5 bg-indigo-900/60 hover:bg-indigo-800/80 text-indigo-200 text-xs font-semibold rounded-xl border border-indigo-700/50 transition-all"
            >
              {isMinimized ? 'Expandir Painel' : 'Minimizar'}
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700/90 text-slate-200 text-xs font-bold rounded-xl border border-slate-700/60 transition-all flex items-center gap-1.5 active:scale-95"
              title="Ocultar alerta proativo"
            >
              <EyeOff size={14} className="text-amber-400" />
              <span>Ocultar Alerta</span>
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="p-1.5 bg-slate-800/60 hover:bg-slate-700/80 text-slate-400 hover:text-white rounded-xl border border-slate-700/50 transition-all"
              title="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <div className="space-y-3 relative z-10">
            <p className="text-xs text-indigo-200 font-medium">
              O sistema verificou automaticamente e identificou as seguintes obras agendadas para os próximos 3 dias:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-3">
              {upcomingInstallations.map(({ obra, timingLabel, badgeStyle }) => {
                const gcalUrl = generateObraGCalUrl(obra);
                return (
                  <div 
                    key={obra.id || obra.firebaseId || obra.numeroRegistro}
                    className="bg-slate-800/80 hover:bg-slate-800/95 border border-indigo-500/20 rounded-2xl p-4 transition-all shadow-lg flex flex-col justify-between gap-3 group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-lg ${badgeStyle}`}>
                          {timingLabel}
                        </span>
                        <span className="text-[10px] text-indigo-300 font-bold bg-indigo-950/80 px-2 py-0.5 rounded-md border border-indigo-800/40">
                          #{obra.numeroRegistro}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-extrabold text-sm text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                          {obra.cliente}
                        </h3>
                        <p className="text-xs text-indigo-200/80 flex items-center gap-1.5 mt-0.5 font-medium">
                          <Calendar size={12} className="text-indigo-400 shrink-0" />
                          <span>{formatBR(obra.dataObra)}</span>
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-indigo-900/50 text-slate-300">
                        <div className="flex items-center gap-1.5">
                          <Sun size={13} className="text-amber-400 shrink-0" />
                          <span className="truncate font-semibold">{obra.quantidadePlacas || 0} placas</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users size={13} className="text-emerald-400 shrink-0" />
                          <span className="truncate font-semibold">{obra.equipe || 'Sem equipe'}</span>
                        </div>
                      </div>

                      {obra.local && (
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate pt-0.5">
                          <MapPin size={11} className="text-slate-500 shrink-0" />
                          <span className="truncate">{obra.local}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-indigo-900/50">
                      {gcalUrl && (
                        <a
                          href={gcalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
                          title="Anexar ao Google Agenda"
                        >
                          <CalendarClock size={14} />
                          <span>Google Agenda</span>
                          <ExternalLink size={10} className="opacity-70" />
                        </a>
                      )}
                      {onSelectObra && (
                        <button
                          onClick={() => onSelectObra(obra)}
                          className="bg-indigo-950 hover:bg-indigo-900 text-indigo-200 text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1 border border-indigo-800/60 transition-all active:scale-95"
                          title="Ver detalhes da obra"
                        >
                          <span>Detalhes</span>
                          <ChevronRight size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
