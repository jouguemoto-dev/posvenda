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
  Wrench,
  UserPlus
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
  order?: number;
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

const BASE_DATE = new Date(2026, 3, 6); // April 6, 2026 is a Monday

interface EscalaViewProps {
  onBack?: () => void;
  obras?: Obra[];
  servicos?: Servico[];
}

export default function EscalaView({ onBack, obras = [], servicos = [] }: EscalaViewProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [schedule, setSchedule] = useState<ScheduleData>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState<{id: string, name: string} | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<{id: string, name: string} | null>(null);
  const [toasts, setToasts] = useState<{id: number, message: string}[]>([]);
  const [activeCell, setActiveCell] = useState<{day: string, teamId: string} | null>(null);
  const [addingClientTo, setAddingClientTo] = useState<{day: string, teamId: string} | null>(null);

  const todayStr = useMemo(() => {
    const d = new Date();
    // Use local date parts to ensure it matches the local view
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const calculateInitialOffset = () => {
    try {
      const now = new Date();
      // Set to midnight local time
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Calculate how many days since BASE_DATE
      const diffTime = today.getTime() - BASE_DATE.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      // Return the number of full weeks
      return Math.floor(diffDays / 7);
    } catch (e) {
      return 0;
    }
  };

  const [weekOffset, setWeekOffset] = useState(calculateInitialOffset());

  // Firestore Listeners
  useEffect(() => {
    const qTeams = query(collection(db, 'teams'), orderBy('name'));
    const unsubscribeTeams = onSnapshot(qTeams, (snapshot) => {
      const teamsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Team));
      // Sort by order field, then by name
      teamsData.sort((a, b) => {
        const orderA = a.order ?? 999;
        const orderB = b.order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
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

  const moveTeam = async (index: number, direction: 'left' | 'right') => {
    const newTeams = [...teams];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newTeams.length) return;

    [newTeams[index], newTeams[targetIndex]] = [newTeams[targetIndex], newTeams[index]];

    try {
      const updates = newTeams.map((team, idx) => 
        updateDoc(doc(db, 'teams', team.id), { order: idx })
      );
      await Promise.all(updates);
      addToast("Equipes reordenadas!");
    } catch (e) {
      console.error("Error reordering teams", e);
      addToast("Erro ao reordenar.");
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
      const fullDate = weekDatesFull[i];
      const dailyObras = obras.filter(o => {
        const oDate = (o.dataObra || '').split('T')[0];
        const isExactDate = oDate === fullDate;
        return isExactDate;
      });
      const dailyServicos = servicos.filter(s => {
        const sDate = (s.dataServico || '').split('T')[0];
        const isExactDate = sDate === fullDate;
        return isExactDate;
      });
      
      let dayText = `${day} (${weekDates[i]})`;
      
      return [
        dayText,
        ...teams.map(team => {
          const manualText = schedule[day]?.[team.id]?.text || '';
          // Clean up manual text from auto-synced entries to avoid redundancy
          const filteredLines = manualText.split('\n').filter(line => {
            const trimmed = line.trim();
            return !trimmed.startsWith('Cliente:') && 
                   !trimmed.startsWith('• [OBRA]') && 
                   !trimmed.startsWith('• [SERVIÇO]');
          });
          return filteredLines.join('\n');
        })
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
    <div className="min-h-full bg-[#eef2f7] p-4 md:p-6 font-sans text-base text-[#1e2f3e]">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
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
            title="Semana Anterior"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="px-4 text-center min-w-[200px] border-x border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Semana</p>
            <p className="font-bold text-[#1e2f3e]">{weekRange}</p>
          </div>
          <button 
            onClick={() => setWeekOffset(prev => prev + 1)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-[#1e2f3e]"
            title="Próxima Semana"
          >
            <ChevronRight size={24} />
          </button>
          
          <button 
            onClick={() => setWeekOffset(calculateInitialOffset())}
            className="ml-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
          >
            Hoje
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
                <th className="p-4 text-left font-bold border-r border-white/10 w-48 text-sm">Dia / Data</th>
                {teams.map((team, tIdx) => (
                  <th key={team.id} className="p-4 text-center font-bold border-r border-white/10 min-w-[220px] text-sm relative group/header">
                    <div className="flex items-center justify-center gap-3">
                      <button 
                        onClick={() => moveTeam(tIdx, 'left')}
                        className={`p-1.5 hover:bg-white/20 rounded-lg transition-all ${tIdx === 0 ? 'opacity-0 cursor-default' : 'opacity-0 group-hover/header:opacity-100'}`}
                        disabled={tIdx === 0}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      
                      <span className="truncate max-w-[120px]">{team.name}</span>
                      
                      <button 
                        onClick={() => moveTeam(tIdx, 'right')}
                        className={`p-1.5 hover:bg-white/20 rounded-lg transition-all ${tIdx === teams.length - 1 ? 'opacity-0 cursor-default' : 'opacity-0 group-hover/header:opacity-100'}`}
                        disabled={tIdx === teams.length - 1}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </th>
                ))}
                {teams.length === 0 && (
                  <th className="p-3 text-center italic text-white/50">Nenhuma equipe cadastrada</th>
                )}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, dayIdx) => {
                const isToday = weekDatesFull[dayIdx] === todayStr;
                return (
                  <tr key={day} className={`border-b border-slate-200 last:border-0 ${isToday ? 'bg-indigo-50/40' : ''}`}>
                    <td className={`p-4 border-r border-slate-200 w-48 min-w-[180px] transition-colors ${isToday ? 'bg-indigo-100/50' : 'bg-slate-50'}`}>
                      <div className="mb-2">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-[#1e2f3e] text-sm">{day}</p>
                          {isToday && (
                            <span className="px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full uppercase tracking-tight">Hoje</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 font-medium">{weekDates[dayIdx]}</p>
                      </div>
                    </td>
                  {teams.map(team => {
                    const cellData = schedule[day]?.[team.id] || { text: '', color: '#ffffff' };
                    const colorObj = COLORS.find(c => c.bg === cellData.color);
                    const isDark = colorObj?.isDark;
                    const fullDate = weekDatesFull[dayIdx];

                    // Match automatically scheduled items
                    const matchingObras = obras.filter(o => {
                      const obraEquipe = (o.equipe || '').trim().toLowerCase();
                      const teamName = team.name.trim().toLowerCase();
                      const isTeamMatch = obraEquipe === teamName;
                      if (!isTeamMatch) return false;
                      
                      const oDate = (o.dataObra || '').split('T')[0];
                      const isExactDate = oDate === fullDate;
                      
                      return isExactDate;
                    });

                    const matchingServicos = servicos.filter(s => {
                      const equipeS = (s.equipeServico || '').trim().toLowerCase();
                      const equipeI = (s.equipeInstalou || '').trim().toLowerCase();
                      const teamName = team.name.trim().toLowerCase();
                      
                      const isTeamMatch = equipeS === teamName || equipeI === teamName;
                      if (!isTeamMatch) return false;
                      
                      const sDate = (s.dataServico || '').split('T')[0];
                      const isExactDate = sDate === fullDate;
                      
                      return isExactDate;
                    });

                    return (
                      <td 
                        key={team.id} 
                        className="p-2 border-r border-slate-200 relative group min-h-[120px] align-top"
                        style={{ backgroundColor: cellData.color }}
                      >
                        <textarea 
                          value={cellData.text.split('\n').filter(line => {
                            const trimmed = line.trim();
                            return !trimmed.startsWith('Cliente:') && 
                                   !trimmed.startsWith('• [OBRA]') && 
                                   !trimmed.startsWith('• [SERVIÇO]');
                          }).join('\n')} 
                          onChange={(e) => {
                            // When user changes text manually, we keep their changes
                            // But we filter out the auto-synced part to avoid redundancy in the view state if any remains
                            updateCell(day, team.id, e.target.value);
                          }}
                          placeholder="..."
                          className={`w-full h-20 p-2 bg-transparent resize-none outline-none font-medium text-sm transition-colors ${isDark ? 'text-white placeholder:text-white/40' : 'text-[#1e2f3e] placeholder:text-slate-300'}`}
                        />

                        {/* Automatic Items Display */}
                        { (matchingObras.length > 0 || matchingServicos.length > 0) && (
                          <div className="mt-2 space-y-2 px-1 pb-2">
                            {matchingObras.map(o => (
                              <div key={o.firebaseId || o.id} className={`text-[11px] font-bold py-2 px-3 rounded-xl flex flex-col shadow-sm border transition-all hover:scale-[1.02] ${isDark ? 'bg-white/10 text-white border-white/20' : 'bg-white text-indigo-700 border-indigo-100'}`}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <ClipboardList size={12} className="opacity-70" />
                                    <span className="uppercase tracking-widest text-[9px] opacity-60">Obra</span>
                                  </div>
                                </div>
                                <span className="font-bold truncate mb-1 text-sm">{o.cliente}</span>
                                <div className="flex items-center justify-between text-[11px] opacity-70 mt-1">
                                  <span className="font-medium">{o.equipe}</span>
                                  {o.quantidadePlacas > 0 && (
                                    <span className="bg-indigo-50 px-1.5 py-0.5 rounded-md font-black italic">{o.quantidadePlacas} pl</span>
                                  )}
                                </div>
                              </div>
                            ))}
                            {matchingServicos.map(s => (
                              <div key={s.firebaseId || s.id} className={`text-[11px] font-bold py-2 px-3 rounded-xl flex flex-col shadow-sm border transition-all hover:scale-[1.02] ${isDark ? 'bg-white/10 text-white border-white/20' : 'bg-white text-blue-700 border-blue-100'}`}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <Wrench size={12} className="opacity-70" />
                                    <span className="uppercase tracking-widest text-[9px] opacity-60">Serviço</span>
                                  </div>
                                </div>
                                <span className="font-bold truncate mb-1 text-sm">{s.cliente}</span>
                                <div className="flex items-center justify-between text-[11px] opacity-70 mt-1">
                                  <span className="font-medium">{s.equipeServico || s.equipeInstalou || '---'}</span>
                                  {s.servico && (
                                    <span className="bg-blue-50 px-1.5 py-0.5 rounded-md font-black truncate ml-2 text-[10px] uppercase">{s.servico}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Cell Actions Menu */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-1">
                          <button 
                            onClick={() => setAddingClientTo(addingClientTo?.day === day && addingClientTo?.teamId === team.id ? null : {day, teamId: team.id})}
                            className={`p-1.5 rounded-lg shadow-md border ${isDark ? 'bg-white/20 border-white/30 text-white' : 'bg-white border-slate-200 text-slate-400'}`}
                            title="Adicionar Cliente"
                          >
                            <UserPlus size={14} />
                          </button>

                          <button 
                            onClick={() => setActiveCell(activeCell?.day === day && activeCell?.teamId === team.id ? null : {day, teamId: team.id})}
                            className={`p-1.5 rounded-lg shadow-md border ${isDark ? 'bg-white/20 border-white/30 text-white' : 'bg-white border-slate-200 text-slate-400'}`}
                          >
                            <Palette size={14} />
                          </button>
                          
                          <AnimatePresence>
                            {addingClientTo?.day === day && addingClientTo?.teamId === team.id && (
                              <motion.div 
                                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                                className="absolute right-0 mt-8 bg-white p-2 rounded-xl shadow-2xl border border-slate-200 w-48 max-h-64 overflow-y-auto z-20"
                              >
                                <p className="text-[10px] font-bold text-slate-400 uppercase px-2 mb-1">Clientes Ativos</p>
                                {Array.from(new Set([
                                  ...obras.map(o => o.cliente),
                                  ...servicos.map(s => s.cliente)
                                ])).filter(Boolean).sort().map(clientName => (
                                  <button 
                                    key={clientName}
                                    onClick={() => {
                                      const currentText = cellData.text ? cellData.text + '\n' : '';
                                      updateCell(day, team.id, currentText + clientName, cellData.color);
                                      setAddingClientTo(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 rounded-lg text-slate-700 font-medium"
                                  >
                                    {clientName}
                                  </button>
                                ))}
                              </motion.div>
                            )}

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
              );
            })}
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
