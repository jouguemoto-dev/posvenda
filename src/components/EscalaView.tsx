import React, { useState, useEffect, useMemo } from 'react';
import { 
  Cloud, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Edit, 
  Save, 
  X, 
  Download, 
  Palette,
  Users,
  Calendar,
  Check,
  AlertCircle,
  ClipboardList,
  Wrench
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  serverTimestamp,
  setDoc
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Obra, Servico } from '../types';

interface Team {
  id: string;
  name: string;
}

interface ScheduleData {
  [day: string]: {
    [teamId: string]: {
      text: string;
      color: string;
    }
  }
}

const DAYS = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo'
];

const COLORS = [
  { name: 'Azul', bg: '#3b82f6', text: '#ffffff', isDark: true },
  { name: 'Verde', bg: '#22c55e', text: '#ffffff', isDark: true },
  { name: 'Amarelo', bg: '#eab308', text: '#000000', isDark: false },
  { name: 'Laranja', bg: '#f97316', text: '#ffffff', isDark: true },
  { name: 'Vermelho', bg: '#ef4444', text: '#ffffff', isDark: true },
  { name: 'Roxo', bg: '#a855f7', text: '#ffffff', isDark: true },
  { name: 'Preto', bg: '#1e2f3e', text: '#ffffff', isDark: true },
  { name: 'Branco', bg: '#ffffff', text: '#1e2f3e', isDark: false },
];

const BASE_DATE = new Date('2026-04-06T00:00:00');

interface EscalaViewProps {
  onBack?: () => void;
  obras?: Obra[];
  servicos?: Servico[];
}

export default function EscalaView({ onBack, obras = [], servicos = [] }: EscalaViewProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState<{id: string, name: string} | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<{id: string, name: string} | null>(null);
  const [toasts, setToasts] = useState<{id: number, message: string}[]>([]);
  const [activeCell, setActiveCell] = useState<{day: string, teamId: string} | null>(null);

  // Firestore Listeners
  useEffect(() => {
    const qTeams = query(collection(db, 'teams'), orderBy('name'));
    const unsubscribeTeams = onSnapshot(qTeams, (snapshot) => {
      const teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
      setTeams(teamsData);
    });

    const qSchedules = collection(db, 'schedules');
    const unsubscribeSchedules = onSnapshot(qSchedules, (snapshot) => {
      const currentScheduleDoc = snapshot.docs.find(doc => doc.id === `week_${weekOffset}`);
      if (currentScheduleDoc) {
        try {
          const parsedData = JSON.parse(currentScheduleDoc.data().data);
          setSchedule(parsedData);
        } catch (e) {
          console.error("Error parsing schedule data", e);
        }
      } else {
        setSchedule({});
      }
    });

    return () => {
      unsubscribeTeams();
      unsubscribeSchedules();
    };
  }, [weekOffset]);

  const addToast = (message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const handleSaveSchedule = async (newData: ScheduleData) => {
    setIsSyncing(true);
    try {
      await setDoc(doc(db, 'schedules', `week_${weekOffset}`), {
        weekOffset,
        data: JSON.stringify(newData),
        updatedAt: serverTimestamp()
      });
      addToast("Escala salva com sucesso!");
    } catch (e) {
      console.error("Error saving schedule", e);
      addToast("Erro ao salvar escala.");
    } finally {
      setIsSyncing(false);
    }
  };

  const updateCell = (day: string, teamId: string, text: string, color?: string) => {
    const newSchedule = { ...schedule };
    if (!newSchedule[day]) newSchedule[day] = {};
    if (!newSchedule[day][teamId]) newSchedule[day][teamId] = { text: '', color: '#ffffff' };
    
    if (text !== undefined) newSchedule[day][teamId].text = text;
    if (color !== undefined) newSchedule[day][teamId].color = color;

    setSchedule(newSchedule);
    handleSaveSchedule(newSchedule);
  };

  const weekDatesFull = useMemo(() => {
    const start = new Date(BASE_DATE);
    start.setDate(start.getDate() + (weekOffset * 7));
    return DAYS.map((_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    });
  }, [weekOffset]);

  const weekDates = useMemo(() => {
    const start = new Date(BASE_DATE);
    start.setDate(start.getDate() + (weekOffset * 7));
    return DAYS.map((_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    });
  }, [weekOffset]);

  const weekRange = useMemo(() => {
    const start = new Date(BASE_DATE);
    start.setDate(start.getDate() + (weekOffset * 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} a ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  }, [weekOffset]);

  const handleAddTeam = async () => {
    if (!newTeamName.trim()) return;
    try {
      if (editingTeam) {
        await updateDoc(doc(db, 'teams', editingTeam.id), { name: newTeamName });
        addToast("Equipe atualizada!");
      } else {
        await addDoc(collection(db, 'teams'), { name: newTeamName });
        addToast("Equipe adicionada!");
      }
      setNewTeamName('');
      setEditingTeam(null);
    } catch (e) {
      addToast("Erro ao processar equipe.");
    }
  };

  const handleDeleteTeam = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'teams', id));
      addToast("Equipe excluída!");
      setIsConfirmDeleteOpen(null);
    } catch (e) {
      addToast("Erro ao excluir equipe.");
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF('landscape');
    const title = "Escala Semanal de Trabalho";
    const period = `Período: ${weekRange}`;
    const timestamp = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;

    doc.setFontSize(18);
    doc.text(title, 14, 15);
    doc.setFontSize(12);
    doc.text(period, 14, 22);
    doc.text(timestamp, 14, 29);

    const head = [['Dia / Data', ...teams.map(t => t.name)]];
    const body = DAYS.map((day, i) => {
      return [
        `${day} (${weekDates[i]})`,
        ...teams.map(team => schedule[day]?.[team.id]?.text || '')
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: head,
      body: body,
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: '#1e2f3e', textColor: '#ffffff' },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index > 0) {
          const team = teams[data.column.index - 1];
          const day = DAYS[data.row.index];
          const cellData = schedule[day]?.[team.id];
          if (cellData?.color) {
            data.cell.styles.fillColor = cellData.color;
            const colorObj = COLORS.find(c => c.bg === cellData.color);
            if (colorObj?.isDark) {
              data.cell.styles.textColor = '#ffffff';
            } else {
              data.cell.styles.textColor = '#1e2f3e';
            }
          }
        }
      }
    });

    doc.save(`escala_${weekRange.replace(/ /g, '_')}.pdf`);
  };

  return (
    <div className="min-h-full bg-[#eef2f7] p-6 font-sans text-base">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex items-center gap-4">
          {onBack && (
            <button 
              onClick={onBack}
              className="p-2.5 bg-white text-slate-600 hover:text-indigo-600 rounded-xl border border-slate-200 shadow-sm transition-all hover:bg-indigo-50 active:scale-95"
              title="Voltar para o Menu"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          <div className="bg-[#1e2f3e] p-3 rounded-2xl text-white shadow-lg">
            <Calendar size={28} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1e2f3e]">Escala Semanal Cloud</h1>
            <div className="flex items-center gap-2 text-slate-500">
              <motion.div
                animate={isSyncing ? { rotate: 360 } : {}}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              >
                <Cloud size={16} className={isSyncing ? "text-[#2c7da0]" : "text-slate-400"} />
              </motion.div>
              <span className="text-sm font-medium">{isSyncing ? 'Sincronizando...' : 'Sincronizado'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
          <button 
            onClick={() => setWeekOffset(prev => prev - 1)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-[#1e2f3e]"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="px-4 text-center min-w-[200px]">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Semana</p>
            <p className="font-bold text-[#1e2f3e]">{weekRange}</p>
          </div>
          <button 
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-[#1e2f3e]"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsTeamModalOpen(true)}
            className="flex items-center gap-2 bg-white text-[#1e2f3e] px-5 py-2.5 rounded-2xl font-bold shadow-sm border border-slate-200 hover:bg-slate-50 transition-all"
          >
            <Users size={20} />
            Gerenciar Equipes
          </button>
          <button 
            onClick={exportPDF}
            className="flex items-center gap-2 bg-[#2c7da0] text-white px-5 py-2.5 rounded-2xl font-bold shadow-lg shadow-[#2c7da0]/20 hover:bg-[#256a8a] transition-all"
          >
            <Download size={20} />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#1e2f3e] text-white">
                <th className="p-6 text-left font-bold border-r border-white/10 w-48">Dia / Data</th>
                {teams.map(team => (
                  <th key={team.id} className="p-6 text-center font-bold border-r border-white/10 min-w-[200px]">
                    {team.name}
                  </th>
                ))}
                {teams.length === 0 && (
                  <th className="p-6 text-center italic text-white/50">Nenhuma equipe cadastrada</th>
                )}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, dayIdx) => (
                <tr key={day} className="border-b border-slate-100 last:border-0">
                  <td className="p-6 bg-slate-50 border-r border-slate-100">
                    <p className="font-bold text-[#1e2f3e]">{day}</p>
                    <p className="text-sm text-slate-400 font-medium">{weekDates[dayIdx]}</p>
                  </td>
                  {teams.map(team => {
                    const cellData = schedule[day]?.[team.id] || { text: '', color: '#ffffff' };
                    const colorObj = COLORS.find(c => c.bg === cellData.color);
                    const isDark = colorObj?.isDark;
                    const fullDate = weekDatesFull[dayIdx];

                    // Match automatically scheduled items
                    const matchingObras = obras.filter(o => o.dataObra === fullDate && o.equipe === team.name);
                    const matchingServicos = servicos.filter(s => s.dataServico === fullDate && s.equipeServico === team.name);

                    return (
                      <td 
                        key={team.id} 
                        className="p-2 border-r border-slate-100 relative group"
                        style={{ backgroundColor: cellData.color }}
                      >
                        <textarea 
                          value={cellData.text}
                          onChange={(e) => updateCell(day, team.id, e.target.value)}
                          placeholder="..."
                          className={`w-full h-24 p-2 bg-transparent resize-none outline-none font-medium transition-colors ${isDark ? 'text-white placeholder:text-white/30' : 'text-[#1e2f3e] placeholder:text-slate-300'}`}
                        />

                        {/* Automatic Items Display */}
                        {(matchingObras.length > 0 || matchingServicos.length > 0) && (
                          <div className="mt-2 space-y-1">
                            {matchingObras.map(o => (
                              <div key={o.id} className={`text-[10px] font-bold py-1 px-2 rounded-lg flex items-center gap-1.5 shadow-sm border ${isDark ? 'bg-white/10 text-white border-white/20' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                                <ClipboardList size={10} />
                                <span className="truncate">OBRA: {o.cliente}</span>
                              </div>
                            ))}
                            {matchingServicos.map(s => (
                              <div key={s.id} className={`text-[10px] font-bold py-1 px-2 rounded-lg flex items-center gap-1.5 shadow-sm border ${isDark ? 'bg-white/10 text-white border-white/20' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
                                <Wrench size={10} />
                                <span className="truncate">SERVIÇO: {s.cliente}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Color Palette Menu */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <button 
                            onClick={() => setActiveCell(activeCell?.day === day && activeCell?.teamId === team.id ? null : {day, teamId: team.id})}
                            className={`p-1.5 rounded-lg shadow-md border ${isDark ? 'bg-white/20 border-white/30 text-white' : 'bg-white border-slate-200 text-slate-400'}`}
                          >
                            <Palette size={14} />
                          </button>
                          
                          <AnimatePresence>
                            {activeCell?.day === day && activeCell?.teamId === team.id && (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                                className="absolute right-0 mt-2 bg-white p-2 rounded-xl shadow-2xl border border-slate-200 grid grid-cols-4 gap-1 w-32"
                              >
                                {COLORS.map(c => (
                                  <button 
                                    key={c.bg}
                                    onClick={() => {
                                      updateCell(day, team.id, cellData.text, c.bg);
                                      setActiveCell(null);
                                    }}
                                    className="w-6 h-6 rounded-md border border-slate-200 transition-transform hover:scale-110"
                                    style={{ backgroundColor: c.bg }}
                                    title={c.name}
                                  />
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team Management Modal */}
      <AnimatePresence>
        {isTeamModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTeamModalOpen(false)}
              className="absolute inset-0 bg-[#1e2f3e]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 bg-[#1e2f3e] text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Users size={24} />
                  <h2 className="text-xl font-bold">Gerenciar Equipes</h2>
                </div>
                <button onClick={() => setIsTeamModalOpen(false)} className="hover:bg-white/10 p-1 rounded-lg transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Nome da equipe..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-[#2c7da0] transition-all"
                  />
                  <button 
                    onClick={handleAddTeam}
                    className="bg-[#2c7da0] text-white p-2.5 rounded-xl hover:bg-[#256a8a] transition-all shadow-lg shadow-[#2c7da0]/20"
                  >
                    {editingTeam ? <Check size={24} /> : <Plus size={24} />}
                  </button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-2 scrollbar-hide">
                  {teams.map(team => (
                    <div key={team.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                      <span className="font-bold text-[#1e2f3e]">{team.name}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setEditingTeam(team); setNewTeamName(team.name); }}
                          className="p-2 text-slate-400 hover:text-[#2c7da0] hover:bg-white rounded-lg transition-all"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => setIsConfirmDeleteOpen({id: team.id, name: team.name})}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {teams.length === 0 && (
                    <p className="text-center text-slate-400 py-4 italic">Nenhuma equipe cadastrada.</p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {isConfirmDeleteOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#1e2f3e]/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="bg-red-50 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-red-500 mb-6">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-[#1e2f3e] mb-2">Excluir Equipe?</h3>
              <p className="text-slate-500 mb-8">Tem certeza que deseja excluir a equipe <span className="font-bold text-[#1e2f3e]">"{isConfirmDeleteOpen.name}"</span>? Esta ação não pode ser desfeita.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsConfirmDeleteOpen(null)}
                  className="flex-1 py-3 rounded-2xl font-bold text-slate-500 hover:bg-slate-100 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteTeam(isConfirmDeleteOpen.id)}
                  className="flex-1 py-3 rounded-2xl font-bold bg-red-500 text-white hover:bg-red-600 transition-all shadow-lg shadow-red-200"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toasts */}
      <div className="fixed bottom-6 right-6 z-[70] space-y-3">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div 
              key={toast.id}
              initial={{ opacity: 0, x: 20, y: 20 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-[#1e2f3e] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10"
            >
              <Check size={18} className="text-[#2c7da0]" />
              <span className="font-bold text-sm">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
