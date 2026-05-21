import React, { useState } from 'react';
import { X, Calendar, ArrowRight, Printer } from 'lucide-react';
import { motion } from 'motion/react';

interface PeriodoRelatorioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (startDate: string, endDate: string) => void;
}

export default function PeriodoRelatorioModal({
  isOpen,
  onClose,
  onConfirm
}: PeriodoRelatorioModalProps) {
  // Default to first day of current month and today
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const getFirstDayOfMonthStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  };

  const [startDate, setStartDate] = useState(getFirstDayOfMonthStr());
  const [endDate, setEndDate] = useState(getTodayStr());

  if (!isOpen) return null;

  // Shortcuts
  const applyPreset = (preset: 'este-mes' | 'mes-passado' | 'ultimos-30' | 'tudo') => {
    const today = new Date();
    if (preset === 'este-mes') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else if (preset === 'mes-passado') {
      const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);
    } else if (preset === 'ultimos-30') {
      const past30 = new Date();
      past30.setDate(today.getDate() - 30);
      setStartDate(past30.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else if (preset === 'tudo') {
      setStartDate('');
      setEndDate('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(startDate, endDate);
  };

  return (
    <div className="fixed inset-0 z-[300] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div 
          className="fixed inset-0 transition-opacity bg-slate-900/60 backdrop-blur-xs" 
          onClick={onClose} 
        />
        
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative z-50 inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-2xl rounded-3xl border border-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl">
                <Calendar size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  Período do Relatório
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Selecione o intervalo das obras
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 px-1.5 text-slate-400 hover:text-slate-650 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Range Presets */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => applyPreset('este-mes')}
                className="px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 bg-slate-50 border border-slate-150 rounded-xl text-center text-[11px] font-bold transition-all transition-colors active:scale-95 cursor-pointer"
              >
                Este Mês
              </button>
              <button
                type="button"
                onClick={() => applyPreset('mes-passado')}
                className="px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 bg-slate-50 border border-slate-150 rounded-xl text-center text-[11px] font-bold transition-all transition-colors active:scale-95 cursor-pointer"
              >
                Mês Passado
              </button>
              <button
                type="button"
                onClick={() => applyPreset('ultimos-30')}
                className="px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 bg-slate-50 border border-slate-150 rounded-xl text-center text-[11px] font-bold transition-all transition-colors active:scale-95 cursor-pointer"
              >
                Últimos 30 Dias
              </button>
              <button
                type="button"
                onClick={() => applyPreset('tudo')}
                className="px-3 py-1.5 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 bg-slate-50 border border-slate-150 rounded-xl text-center text-[11px] font-bold transition-all transition-colors active:scale-95 cursor-pointer"
              >
                Todo o Período
              </button>
            </div>

            {/* Manual Date Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Data Inicial
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-250 rounded-xl px-3 py-2 text-xs text-slate-700 font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Data Final
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-250 rounded-xl px-3 py-2 text-xs text-slate-700 font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all active:scale-98 cursor-pointer"
              >
                <Printer size={13} />
                <span>Gerar Relatório</span>
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
