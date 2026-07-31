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
  Clock,
  AlertCircle,
  ClipboardList,
  Wrench,
  UserPlus,
  FileText,
  MapPin,
  Phone,
  DollarSign,
  Briefcase,
  Layers,
  LayoutDashboard,
  Hash,
  Activity,
  Zap,
  Copy,
  ExternalLink,
  User,
  CalendarClock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { generateObraGCalUrl, generateServicoGCalUrl } from '../lib/googleCalendar';
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

const formatDateBR = (dateStr: string | undefined | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '---';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

const getDayOfWeek = (dateStr: string | undefined | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const day = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
  return day.charAt(0).toUpperCase() + day.slice(1);
};

interface EscalaViewProps {
  onBack?: () => void;
  obras?: Obra[];
  servicos?: Servico[];
  onEditObra?: (obra: Obra) => void;
  onEditServico?: (servico: Servico) => void;
}

export default function EscalaView({ 
  onBack, 
  obras = [], 
  servicos = [],
  onEditObra,
  onEditServico
}: EscalaViewProps) {
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
  const [viewingTxt, setViewingTxt] = useState<{name: string, content: string} | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<{type: 'obra' | 'servico', item: Obra | Servico} | null>(null);
  const [tempDate, setTempDate] = useState('');
  const [tempTeam, setTempTeam] = useState('');
  const [isGCalModalOpen, setIsGCalModalOpen] = useState(false);

  useEffect(() => {
    if (selectedDetails) {
      const { type, item } = selectedDetails;
      const dateStr = type === 'obra' 
        ? (item as Obra).dataObra 
        : (item as Servico).dataServico;
      const datePart = dateStr ? dateStr.split('T')[0] : '';
      setTempDate(datePart);

      const teamName = type === 'obra'
        ? (item as Obra).equipe
        : (item as Servico).equipeServico;
      setTempTeam(teamName || '');
    } else {
      setTempDate('');
      setTempTeam('');
    }
  }, [selectedDetails]);

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

  const handleUpdateSchedule = async () => {
    if (!selectedDetails) return;
    const { type, item } = selectedDetails;
    if (!item.firebaseId) {
      addToast("Erro: ID no Firebase não encontrado.");
      return;
    }
    
    try {
      const docRef = doc(db, type === 'obra' ? 'obras' : 'servicos', item.firebaseId);
      if (type === 'obra') {
        await updateDoc(docRef, {
          dataObra: tempDate,
          equipe: tempTeam
        });
      } else {
        await updateDoc(docRef, {
          dataServico: tempDate,
          equipeServico: tempTeam
        });
      }
      addToast("Agendamento alterado com sucesso!");
      setSelectedDetails(null);
    } catch (e) {
      console.error("Erro ao alterar agendamento", e);
      addToast("Erro ao alterar agendamento.");
    }
  };

  const handleQuickStatusChangeObra = async (obra: Obra, newStatus: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const targetId = obra.firebaseId || (obra as any).id;
    if (!targetId) return;
    try {
      const docRef = doc(db, 'obras', targetId);
      await updateDoc(docRef, {
        situacao: newStatus,
        updatedAt: serverTimestamp()
      });
      addToast(`Status de "${obra.cliente}" alterado para "${newStatus}"`);
    } catch (err) {
      console.error("Erro ao alterar status da obra:", err);
      addToast("❌ Erro ao atualizar status da obra.");
    }
  };

  const handleQuickStatusChangeServico = async (servico: Servico, newStatus: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const targetId = servico.firebaseId || (servico as any).id;
    if (!targetId) return;
    try {
      const docRef = doc(db, 'servicos', targetId);
      await updateDoc(docRef, {
        situacao: newStatus,
        updatedAt: serverTimestamp()
      });
      addToast(`Status de "${servico.cliente}" alterado para "${newStatus}"`);
    } catch (err) {
      console.error("Erro ao alterar status do serviço:", err);
      addToast("❌ Erro ao atualizar status do serviço.");
    }
  };

  const handleDuplicateItem = async () => {
    if (!selectedDetails) return;
    const { type, item } = selectedDetails;
    
    try {
      const collectionName = type === 'obra' ? 'obras' : 'servicos';
      
      if (type === 'obra') {
        const originalObra = item as Obra;
        const duplicatedObra: Omit<Obra, 'firebaseId'> = {
          ...originalObra,
          id: Date.now(),
          numeroRegistro: originalObra.numeroRegistro + ' (Cópia)',
          dataObra: tempDate,
          equipe: tempTeam,
          createdAt: serverTimestamp() as any
        };
        // Clean firebaseId if it was in the spread
        delete (duplicatedObra as any).firebaseId;
        
        await addDoc(collection(db, collectionName), duplicatedObra);
      } else {
        const originalServico = item as Servico;
        const duplicatedServico: Omit<Servico, 'firebaseId'> = {
          ...originalServico,
          id: Date.now(),
          numeroRegistro: originalServico.numeroRegistro + ' (Cópia)',
          dataServico: tempDate,
          equipeServico: tempTeam,
          createdAt: serverTimestamp() as any
        };
        // Clean firebaseId if it was in the spread
        delete (duplicatedServico as any).firebaseId;
        
        await addDoc(collection(db, collectionName), duplicatedServico);
      }
      
      addToast("Agendamento duplicado com sucesso!");
      setSelectedDetails(null);
    } catch (e) {
      console.error("Erro ao duplicar agendamento", e);
      addToast("Erro ao duplicar agendamento.");
    }
  };

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
    <div className="h-screen flex flex-col bg-[#eef2f7] p-2 md:p-4 font-sans text-base text-[#1e2f3e] overflow-hidden">
      {/* Header */}
      <div className="flex-none flex flex-col md:flex-row justify-between items-center mb-4 gap-2">
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

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button 
            onClick={() => setIsGCalModalOpen(true)}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2.5 rounded-2xl font-bold shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 transition-all active:scale-95 text-xs sm:text-sm"
            title="Anexar escala semanal no Google Agenda"
          >
            <CalendarClock size={18} />
            Google Agenda
          </button>
          <button 
            onClick={() => setIsTeamModalOpen(true)}
            className="flex items-center gap-2 bg-white text-[#1e2f3e] px-4 py-2.5 rounded-2xl font-bold shadow-sm border border-slate-200 hover:bg-slate-50 transition-all text-xs sm:text-sm"
          >
            <Users size={18} />
            Gerenciar Equipes
          </button>
          <button 
            onClick={exportPDF}
            className="flex items-center gap-2 bg-[#2c7da0] text-white px-4 py-2.5 rounded-2xl font-bold shadow-lg shadow-[#2c7da0]/20 hover:bg-[#256a8a] transition-all text-xs sm:text-sm"
          >
            <Download size={18} />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="flex-1 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          <table className="w-full border-collapse table-fixed min-w-[1200px]">
            <thead className="sticky top-0 z-30">
              <tr className="bg-[#1e2f3e] text-white">
                <th className="p-2 text-left font-bold border-r border-white/10 w-28 text-xs">Dia / Data</th>
                {teams.map((team, tIdx) => (
                  <th key={team.id} className="p-2 text-center font-bold border-r border-white/10 text-xs relative group/header">
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
                    <td className={`p-2 border-r border-slate-200 w-28 transition-colors ${isToday ? 'bg-indigo-100/50' : 'bg-slate-50'}`}>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <p className="font-bold text-[#1e2f3e] text-xs">{day}</p>
                          {isToday && (
                            <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[8px] font-bold rounded-full uppercase tracking-tight">Hoje</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium">{weekDates[dayIdx]}</p>
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
                        className="p-1 border-r border-slate-200 relative group min-h-[80px] h-24 align-top overflow-hidden"
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
                          className={`w-full h-12 p-1 bg-transparent resize-none outline-none font-medium text-[10px] leading-tight transition-colors ${isDark ? 'text-white placeholder:text-white/40' : 'text-[#1e2f3e] placeholder:text-slate-300'}`}
                        />

                        {/* Automatic Items Display */}
                        { (matchingObras.length > 0 || matchingServicos.length > 0) && (
                          <div className="mt-1 space-y-1 px-0.5 pb-1 max-h-[calc(100%-3rem)] overflow-y-auto scrollbar-hide">
                            {matchingObras.map(o => (
                              <div 
                                key={o.firebaseId || o.id} 
                                onClick={() => setSelectedDetails({ type: 'obra', item: o })}
                                className={`text-[9px] font-bold py-1 px-1.5 rounded-lg flex flex-col shadow-sm border transition-all hover:scale-[1.02] cursor-pointer ${
                                  o.situacao === 'Em Espera' 
                                    ? 'bg-slate-100 text-slate-500 border-slate-200' 
                                    : o.situacao === 'Concluído'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 opacity-70'
                                    : isDark 
                                    ? 'bg-white/10 text-white border-white/20' 
                                    : 'bg-white text-indigo-700 border-indigo-100'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <div className="flex items-center gap-1">
                                    <ClipboardList size={10} className="opacity-70" />
                                    <span className="uppercase tracking-widest text-[7px] opacity-60">
                                      {o.situacao === 'Em Espera' ? 'Pausado' : o.situacao === 'Concluído' ? 'Check' : 'Obra'}
                                    </span>
                                  </div>
                                  {o.quantidadePlacas > 0 && (
                                    <span className="text-[9px] font-black italic opacity-90 text-indigo-900 bg-indigo-50/50 px-1 rounded">{o.quantidadePlacas} PL</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 overflow-hidden">
                                  <span 
                                    className={`font-bold truncate text-[10px] flex-1 cursor-pointer hover:text-indigo-600 transition-colors ${o.situacao === 'Concluído' ? 'line-through' : ''}`}
                                    title="Clique para ver detalhes organizados"
                                  >
                                    {o.cliente}
                                  </span>
                                  <div className="flex items-center gap-0.5 flex-none select-none">
                                    <button 
                                      onClick={(e) => handleQuickStatusChangeObra(o, o.situacao === 'Concluído' ? 'Em Andamento' : 'Concluído', e)}
                                      className={`px-1 py-0.5 rounded transition-all flex items-center gap-0.5 font-bold ${
                                        o.situacao === 'Concluído'
                                          ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200 ring-1 ring-emerald-300'
                                          : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-200 bg-white'
                                      }`}
                                      title={o.situacao === 'Concluído' ? 'Concluído ✓ (Clique para reabrir)' : 'Atalho: Marcar Agendamento como Concluído'}
                                    >
                                      <Check size={10} className={o.situacao === 'Concluído' ? 'stroke-[3]' : 'stroke-[2.5]'} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const url = generateObraGCalUrl(o, fullDate, team.name);
                                        if (url) window.open(url, '_blank');
                                      }}
                                      className="p-0.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50/80 rounded transition-colors"
                                      title="Anexar ao Google Agenda"
                                    >
                                      <CalendarClock size={10} />
                                    </button>
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        onEditObra?.(o); 
                                      }}
                                      className="p-0.5 text-indigo-500 hover:text-indigo-700 hover:bg-slate-100/50 rounded transition-colors"
                                      title="Editar Registro"
                                    >
                                      <Edit size={10} />
                                    </button>
                                    {o.txtFile && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setViewingTxt(o.txtFile || null); }}
                                        className="p-0.5 text-indigo-500 hover:text-indigo-700 hover:bg-slate-100/50 rounded transition-colors"
                                        title="Ver TXT"
                                      >
                                        <FileText size={10} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                            {matchingServicos.map(s => (
                              <div 
                                key={s.firebaseId || s.id} 
                                onClick={() => setSelectedDetails({ type: 'servico', item: s })}
                                className={`text-[9px] font-bold py-1 px-1.5 rounded-lg flex flex-col shadow-sm border transition-all hover:scale-[1.02] cursor-pointer ${
                                  s.situacao === 'Em Espera'
                                    ? 'bg-slate-100 text-slate-500 border-slate-200'
                                    : s.situacao === 'Concluído'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100 opacity-70'
                                    : isDark 
                                    ? 'bg-white/10 text-white border-white/20' 
                                    : 'bg-white text-blue-700 border-blue-100'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-0.5">
                                  <div className="flex items-center gap-1">
                                    <Wrench size={10} className="opacity-70" />
                                    <span className="uppercase tracking-widest text-[7px] opacity-60">
                                      {s.situacao === 'Em Espera' ? 'Pausado' : s.situacao === 'Concluído' ? 'Check' : 'Serviço'}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 overflow-hidden">
                                  <span 
                                    className={`font-bold truncate text-[10px] flex-1 cursor-pointer hover:text-blue-600 transition-colors ${s.situacao === 'Concluído' ? 'line-through' : ''}`}
                                    title="Clique para ver detalhes organizados"
                                  >
                                    {s.cliente}
                                  </span>
                                  <div className="flex items-center gap-0.5 flex-none select-none">
                                    <button 
                                      onClick={(e) => handleQuickStatusChangeServico(s, s.situacao === 'Concluído' ? 'Em Andamento' : 'Concluído', e)}
                                      className={`px-1 py-0.5 rounded transition-all flex items-center gap-0.5 font-bold ${
                                        s.situacao === 'Concluído'
                                          ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200 ring-1 ring-emerald-300'
                                          : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-200 bg-white'
                                      }`}
                                      title={s.situacao === 'Concluído' ? 'Concluído ✓ (Clique para reabrir)' : 'Atalho: Marcar Agendamento como Concluído'}
                                    >
                                      <Check size={10} className={s.situacao === 'Concluído' ? 'stroke-[3]' : 'stroke-[2.5]'} />
                                    </button>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const url = generateServicoGCalUrl(s, fullDate, team.name);
                                        if (url) window.open(url, '_blank');
                                      }}
                                      className="p-0.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50/80 rounded transition-colors"
                                      title="Anexar ao Google Agenda"
                                    >
                                      <CalendarClock size={10} />
                                    </button>
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        onEditServico?.(s); 
                                      }}
                                      className="p-0.5 text-blue-500 hover:text-blue-700 hover:bg-slate-100/50 rounded transition-colors"
                                      title="Editar Registro"
                                    >
                                      <Edit size={10} />
                                    </button>
                                    {s.txtFile && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setViewingTxt(s.txtFile || null); }}
                                        className="p-0.5 text-blue-500 hover:text-blue-700 hover:bg-slate-100/50 rounded transition-colors"
                                        title="Ver TXT"
                                      >
                                        <FileText size={10} />
                                      </button>
                                    )}
                                  </div>
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

      {/* Client Details Modal */}
      <AnimatePresence>
        {selectedDetails && (() => {
          const isObra = selectedDetails.type === 'obra';
          const obraItem = isObra ? (selectedDetails.item as Obra) : null;
          const servicoItem = !isObra ? (selectedDetails.item as Servico) : null;
          
          const item = selectedDetails.item;
          
          // Helper to get formatted full date
          const formatFullDateBR = (dateStr: string) => {
            if (!dateStr) return '---';
            try {
              const d = new Date(dateStr + 'T12:00:00'); // noon to avoid timezone shift
              if (isNaN(d.getTime())) return '---';
              const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' });
              const formattedDate = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
              return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${formattedDate}`;
            } catch (e) {
              return dateStr;
            }
          };

          // Currency Formatter
          const formatCurrency = (val: number | undefined) => {
            if (val === undefined || isNaN(val)) return 'R$ 0,00';
            return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          };

          // WhatsApp Copy generator
          const handleCopyScheduleText = () => {
            let text = '';
            if (isObra && obraItem) {
              text = `📋 *DADOS DO AGENDAMENTO (OBRA SOLAR)*\n\n` +
                     `👤 *Cliente:* ${obraItem.cliente}\n` +
                     `🔢 *Registro:* #${obraItem.numeroRegistro}\n` +
                     `📍 *Endereço:* ${obraItem.local || 'Não informado'}\n` +
                     `💼 *Vendedor:* ${obraItem.vendedor || '---'}\n` +
                     `🛠️ *Equipe Escala:* ${tempTeam || obraItem.equipe || '---'}\n` +
                     `📅 *Data Instalada:* ${tempDate ? formatFullDateBR(tempDate) : formatFullDateBR(obraItem.dataObra)}\n\n` +
                     `⚡ *ESPECIFICAÇÕES TÉCNICAS:*\n` +
                     `🔌 *Inversor:* ${obraItem.inversor || '---'}\n` +
                     `☀️ *Painéis:* ${obraItem.quantidadePlacas || 0} módulos\n` +
                     `📊 *Prioridade:* ${obraItem.prioridade || 'Média'}\n` +
                     `📈 *Situação:* ${obraItem.situacao || 'Pendente'}\n\n` +
                     `💰 *FINANCEIRO:*\n` +
                     `💵 *Receber:* ${formatCurrency(obraItem.valorReceber)}\n` +
                     `⚒️ *Mão de Obra:* ${formatCurrency(obraItem.valorMaoObra)}\n` +
                     `💳 *Forma de Pgto:* ${obraItem.formaPagamento || '---'}\n` +
                     (obraItem.observacoes ? `\n📝 *Anotações:* ${obraItem.observacoes}` : '');
            } else if (!isObra && servicoItem) {
              text = `📋 *DADOS DO AGENDAMENTO (SERVIÇO DE MANUTENÇÃO)*\n\n` +
                     `👤 *Cliente:* ${servicoItem.cliente}\n` +
                     `🔢 *Registro:* #${servicoItem.numeroRegistro}\n` +
                     `📍 *Endereço:* ${servicoItem.local || 'Não informado'}\n` +
                     `💼 *Vendedor:* ${servicoItem.vendedor || '---'}\n` +
                     `🛠️ *Equipe Serviço:* ${tempTeam || servicoItem.equipeServico || '---'}\n` +
                     `📅 *Data do Serviço:* ${tempDate ? formatFullDateBR(tempDate) : formatFullDateBR(servicoItem.dataServico)}\n\n` +
                     `⚡ *DETALHES DO SERVIÇO:*\n` +
                     `🔧 *Serviço:* ${servicoItem.servico || '---'}\n` +
                     `👷 *Instalado por:* ${servicoItem.equipeInstalou || '---'}\n` +
                     `📊 *Prioridade:* ${servicoItem.prioridade || 'Média'}\n` +
                     `📈 *Situação:* ${servicoItem.situacao || 'Pendente'}\n\n` +
                     `💰 *FINANCEIRO:*\n` +
                     `💵 *Valor:* ${formatCurrency(servicoItem.valor)}\n` +
                     `💳 *Forma de Pgto:* ${servicoItem.formaPagamento || '---'}\n` +
                     (servicoItem.observacao ? `\n📝 *Anotações:* ${servicoItem.observacao}` : '');
            }

            navigator.clipboard.writeText(text);
            addToast("Dados formatados e copiados para o WhatsApp!");
          };

          return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedDetails(null)}
                className="absolute inset-0"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="relative w-full max-w-4xl bg-slate-50 rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-slate-200 my-auto max-h-[92vh]"
              >
                {/* Visual Accent Header Banner */}
                <div className={`p-6 pb-5 text-white relative overflow-hidden shrink-0 ${isObra ? 'bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800' : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700'}`}>
                  {/* Abstract background graphics */}
                  <div className="absolute right-0 top-0 opacity-10 translate-x-20 -translate-y-20 select-none pointer-events-none">
                    {isObra ? <Zap size={300} /> : <Wrench size={300} />}
                  </div>

                  <div className="flex items-start justify-between relative z-10">
                    <div className="flex items-start gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 shadow-inner">
                        {isObra ? <Zap size={28} className="text-amber-300" /> : <Wrench size={28} className="text-emerald-100" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="text-[10px] uppercase font-black tracking-widest bg-white/20 px-2 py-0.5 rounded-md backdrop-blur-xs">
                            {isObra ? 'Energia Solar' : 'Manutenção'}
                          </span>
                          <span className="text-xs font-mono font-bold bg-black/25 px-2 py-0.5 rounded-md text-white/90">
                            REGISTRO #{item.numeroRegistro}
                          </span>
                        </div>
                        <h2 className="text-2xl font-black tracking-tight leading-none text-white drop-shadow-xs">
                          {item.cliente}
                        </h2>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={async () => {
                          const nextStatus = item.situacao === 'Concluído' ? 'Em Andamento' : 'Concluído';
                          if (isObra) {
                            await handleQuickStatusChangeObra(obraItem!, nextStatus);
                            setSelectedDetails({ type: 'obra', item: { ...obraItem!, situacao: nextStatus as any } });
                          } else {
                            await handleQuickStatusChangeServico(servicoItem!, nextStatus);
                            setSelectedDetails({ type: 'servico', item: { ...servicoItem!, situacao: nextStatus as any } });
                          }
                        }}
                        className={`flex items-center gap-1.5 font-black text-[11px] uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all active:scale-95 shadow-md ${
                          item.situacao === 'Concluído'
                            ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200 border border-emerald-300'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-white'
                        }`}
                        title="Atalho: Alternar para Concluído"
                      >
                        <Check size={14} className="stroke-[3]" />
                        {item.situacao === 'Concluído' ? 'Concluído ✓' : 'Marcar Concluído'}
                      </button>
                      <button 
                        onClick={() => {
                          if (isObra) {
                            onEditObra?.(obraItem!);
                          } else {
                            onEditServico?.(servicoItem!);
                          }
                          setSelectedDetails(null);
                        }}
                        className="flex items-center gap-1.5 bg-white text-indigo-700 hover:bg-slate-100 font-extrabold text-[11px] uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all active:scale-95 shadow-sm"
                        title="Editar Registro"
                      >
                        <Edit size={12} />
                        Editar Registro
                      </button>
                      <button 
                        onClick={() => setSelectedDetails(null)}
                        className="p-2 bg-white/15 hover:bg-white/25 active:scale-95 text-white/95 hover:text-white rounded-xl transition-all border border-white/5"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Main Body - 2 Columns Layout */}
                <div className="p-4 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 max-h-[calc(92vh-18rem)]">
                  
                  {/* COLUMN 1: Identificação, Informações Técnicas e Financeiras */}
                  <div className="lg:col-span-7 space-y-6">
                    
                    {/* Panel: Dados Gerais */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                        <Users size={16} className="text-slate-400" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Dados do Cliente & Contato</h3>
                      </div>

                      <div className="space-y-3.5">
                        <div className="flex items-start justify-between gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                          <div className="flex gap-2.5 min-w-0">
                            <MapPin size={18} className="text-indigo-500 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Endereço da Instalação</span>
                              <p className="text-xs font-bold text-slate-800 leading-normal break-words">
                                {item.local || 'Endereço não cadastrado'}
                              </p>
                            </div>
                          </div>
                          {item.local && (
                            <a 
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.local)}`}
                              target="_blank" 
                              rel="noreferrer"
                              className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-700 text-indigo-600 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all shadow-xs shrink-0 self-center border border-indigo-100/50"
                            >
                              <ExternalLink size={12} />
                              Rota Maps
                            </a>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
                              <User size={16} />
                            </div>
                            <div className="min-w-0">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Vendedor</span>
                              <span className="text-xs font-extrabold text-slate-700 truncate block">{item.vendedor || '---'}</span>
                            </div>
                          </div>

                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isObra ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {isObra ? <Zap size={16} /> : <Wrench size={16} />}
                            </div>
                            <div className="min-w-0">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Categoria</span>
                              <span className="text-xs font-extrabold text-slate-700 truncate block">
                                {isObra ? 'Instalação Solar' : 'Manutenção'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Badges for Status and Priority */}
                        <div className="grid grid-cols-2 gap-4 pt-1">
                          <div>
                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Alterar Status Rápido</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {['Em Andamento', 'Concluído', 'Em Espera', 'Pendente'].map((st) => (
                                <button
                                  key={st}
                                  onClick={async () => {
                                    if (isObra) {
                                      await handleQuickStatusChangeObra(obraItem!, st);
                                      setSelectedDetails({ type: 'obra', item: { ...obraItem!, situacao: st as any } });
                                    } else {
                                      await handleQuickStatusChangeServico(servicoItem!, st);
                                      setSelectedDetails({ type: 'servico', item: { ...servicoItem!, situacao: st as any } });
                                    }
                                  }}
                                  className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 ${
                                    item.situacao === st
                                      ? st === 'Concluído'
                                        ? 'bg-emerald-600 text-white shadow-sm font-black'
                                        : st === 'Em Andamento'
                                        ? 'bg-blue-600 text-white shadow-sm font-black'
                                        : st === 'Em Espera'
                                        ? 'bg-rose-600 text-white shadow-sm font-black'
                                        : 'bg-amber-600 text-white shadow-sm font-black'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                  }`}
                                >
                                  {item.situacao === st && <Check size={10} className="stroke-[3]" />}
                                  {st}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Prioridade</span>
                            <div className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-2 border ${
                              item.prioridade === 'Alta' ? 'bg-red-50 border-red-100 text-red-700' :
                              item.prioridade === 'Média' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                              'bg-slate-100 border-slate-200 text-slate-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                item.prioridade === 'Alta' ? 'bg-red-500' :
                                item.prioridade === 'Média' ? 'bg-amber-500' : 'bg-slate-400'
                              }`} />
                              <span>Prioridade {item.prioridade || 'Média'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Panel: Especificações Técnicas */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                        <Wrench size={16} className="text-slate-400" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Especificações Técnicas</h3>
                      </div>

                      {isObra ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Módulos Solares (Painéis)</span>
                            <div className="flex items-baseline gap-2 mt-2">
                              <span className="text-3xl font-black text-slate-900 leading-none">{(obraItem as Obra).quantidadePlacas || 0}</span>
                              <span className="text-xs font-bold text-slate-500">Unidades</span>
                            </div>
                            <div className="w-full bg-slate-200 h-1.5 rounded-full mt-3 overflow-hidden">
                              <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${Math.min(((obraItem as Obra).quantidadePlacas || 0) * 4, 100)}%` }} />
                            </div>
                          </div>

                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Inversor Solar</span>
                            <div className="mt-2 text-sm font-black text-slate-800">
                              {(obraItem as Obra).inversor || 'Não especificado'}
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium block mt-1">Homologado & Projetado</span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Serviço Solicitado</span>
                            <p className="text-sm font-bold text-slate-800 leading-relaxed mt-1">{(servicoItem as Servico).servico || 'Não especificado'}</p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Equipe Originária</span>
                              <p className="text-xs font-black text-slate-700 mt-1">{(servicoItem as Servico).equipeInstalou || 'Não cadastrada'}</p>
                            </div>
                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Equipe de Escala</span>
                              <p className="text-xs font-black text-indigo-600 mt-1">{tempTeam || (servicoItem as Servico).equipeServico || 'Não programada'}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Panel: Detalhes Financeiros */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                        <DollarSign size={16} className="text-slate-400" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Financeiro & Pagamento</h3>
                      </div>

                      <div className="bg-slate-50 p-5 rounded-2xl border border-dashed border-slate-200 relative overflow-hidden">
                        {/* Receipt style notches */}
                        <div className="absolute -top-1.5 left-0 right-0 flex justify-between px-4 select-none pointer-events-none">
                          {[...Array(12)].map((_, i) => (
                            <div key={i} className="w-3 h-3 bg-white rounded-full border border-slate-200/80 -mt-1.5" />
                          ))}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                          <div>
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor total bruto</span>
                            <span className="text-2xl font-black text-slate-900 block mt-1 tracking-tight">
                              {isObra && obraItem ? formatCurrency(obraItem.valorReceber) : servicoItem ? formatCurrency(servicoItem.valor) : '---'}
                            </span>
                          </div>

                          {isObra && obraItem ? (
                            <div>
                              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mão de Obra Fornecedores</span>
                              <span className="text-lg font-bold text-indigo-600 block mt-1.5">
                                {formatCurrency(obraItem.valorMaoObra)}
                              </span>
                            </div>
                          ) : (
                            <div>
                              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Situação Pagto</span>
                              <span className="text-xs font-black text-slate-700 bg-slate-200/70 px-2.5 py-1 rounded-md block mt-1.5 inline-block uppercase">
                                {item.situacaoPagamento || 'A Confirmar'}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="h-px bg-slate-200 my-4" />

                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <div>
                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Forma de Pagamento</span>
                            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wide block mt-0.5">
                              {item.formaPagamento || 'Não informada'}
                            </span>
                          </div>
                          {isObra && obraItem && (
                            <div className="text-right">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Situação Pagto</span>
                              <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wide block mt-0.5">
                                {obraItem.situacaoPagamento || 'A Confirmar'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* COLUMN 2: Cronograma, Alterações Rápidas e Share */}
                  <div className="lg:col-span-5 space-y-6">

                    {/* Panel: Cronograma Temporal */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
                      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                        <Calendar size={16} className="text-slate-400" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">Rastreamento Temporal</h3>
                      </div>

                      <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                        {isObra ? (
                          <>
                            {/* Step: Contrato */}
                            <div className="relative">
                              <span className={`absolute -left-[20px] top-1 w-[10px] h-[10px] rounded-full border-2 ${(obraItem as Obra).dataContrato ? 'bg-indigo-600 border-indigo-200' : 'bg-slate-300 border-white'}`} />
                              <div>
                                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Data do Contrato Assinado</span>
                                <p className="text-xs font-extrabold text-slate-700 mt-0.5">{formatFullDateBR((obraItem as Obra).dataContrato)}</p>
                              </div>
                            </div>
                            {/* Step: Chegada das placas */}
                            <div className="relative">
                              <span className={`absolute -left-[20px] top-1 w-[10px] h-[10px] rounded-full border-2 ${(obraItem as Obra).dataChegadaPlacas ? 'bg-indigo-500 border-indigo-200' : 'bg-slate-300 border-white'}`} />
                              <div>
                                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Chegada das Placas no Local</span>
                                <p className="text-xs font-extrabold text-slate-700 mt-0.5">{formatFullDateBR((obraItem as Obra).dataChegadaPlacas)}</p>
                              </div>
                            </div>
                            {/* Step: Agendamento Escala */}
                            <div className="relative">
                              <span className={`absolute -left-[20px] top-1.5 w-[10px] h-[10px] rounded-full border-2 ${(obraItem as Obra).dataObra ? 'bg-amber-500 border-amber-200' : 'bg-slate-300 border-white'}`} />
                              <div>
                                <span className="block text-[9px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">Agendado p/ Instalação <span className="px-1.5 py-0.2 bg-amber-100 text-amber-700 rounded text-[8px] font-black uppercase shadow-xs">Foco Escala</span></span>
                                <p className="text-xs font-black text-slate-800 mt-0.5">
                                  {tempDate ? formatFullDateBR(tempDate) : formatFullDateBR((obraItem as Obra).dataObra)}
                                </p>
                              </div>
                            </div>
                            {/* Step: Conclusão da Obra */}
                            <div className="relative">
                              <span className={`absolute -left-[20px] top-1 w-[10px] h-[10px] rounded-full border-2 ${(obraItem as Obra).dataConclusao ? 'bg-emerald-600 border-emerald-200 font-bold' : 'bg-slate-300 border-white'}`} />
                              <div>
                                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Conclusão de Auditoria / Homologação</span>
                                <p className="text-xs font-semibold text-slate-700 mt-0.5">{formatFullDateBR((obraItem as Obra).dataConclusao)}</p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Step: Abertura Atendimento */}
                            <div className="relative">
                              <span className={`absolute -left-[20px] top-1 w-[10px] h-[10px] rounded-full border-2 ${(servicoItem as Servico).dataAtendimento ? 'bg-teal-600 border-teal-200' : 'bg-slate-300 border-white'}`} />
                              <div>
                                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Data de Abertura / Cadastro</span>
                                <p className="text-xs font-extrabold text-slate-700 mt-0.5">{formatFullDateBR((servicoItem as Servico).dataAtendimento)}</p>
                              </div>
                            </div>
                            {/* Step: Agendamento Escala de Serviço */}
                            <div className="relative">
                              <span className={`absolute -left-[20px] top-1.5 w-[10px] h-[10px] rounded-full border-2 ${(servicoItem as Servico).dataServico ? 'bg-amber-500 border-amber-200' : 'bg-slate-300 border-white'}`} />
                              <div>
                                <span className="block text-[9px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">Agendado p/ Execução <span className="px-1.5 py-0.2 bg-amber-100 text-amber-700 rounded text-[8px] font-black uppercase shadow-xs">Foco Escala</span></span>
                                <p className="text-xs font-black text-slate-800 mt-0.5">
                                  {tempDate ? formatFullDateBR(tempDate) : formatFullDateBR((servicoItem as Servico).dataServico)}
                                </p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Panel: Alteração Rápida de Agendamento */}
                    <div className="bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100/80 shadow-xs space-y-4">
                      <div className="flex items-center gap-2 border-b border-indigo-100 pb-2.5">
                        <Clock size={16} className="text-indigo-500" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-indigo-700">Painel do Agendador</h4>
                      </div>

                      <div className="space-y-3.5">
                        <div>
                          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                            Ajustar Data da Execução
                          </label>
                          <input 
                            type="date" 
                            value={tempDate}
                            onChange={(e) => setTempDate(e.target.value)}
                            className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-xs"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                            Transferir para Equipe
                          </label>
                          <select 
                            value={tempTeam}
                            onChange={(e) => setTempTeam(e.target.value)}
                            className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-xs h-[42px]"
                          >
                            <option value="">Nenhuma equipe</option>
                            {teams.map(t => (
                              <option key={t.id} value={t.name}>{t.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 pt-1">
                          <button
                            onClick={handleUpdateSchedule}
                            className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] uppercase tracking-wider py-2.5 rounded-xl transition-all active:scale-95 shadow-md shadow-indigo-200"
                          >
                            <Save size={12} />
                            Reagendar
                          </button>
                          <button
                            onClick={handleDuplicateItem}
                            className="flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[10px] uppercase tracking-wider py-2.5 rounded-xl transition-all active:scale-95 shadow-md shadow-slate-200"
                          >
                            <Zap size={12} />
                            Duplicar
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Panel: Observações & WhatsApp Dispatcher */}
                    {(isObra ? obraItem?.observacoes : servicoItem?.observacao) && (
                      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3.5">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider border-l-2 border-amber-400 pl-2">Notas do Atendimento</span>
                        <p className="text-xs text-slate-600 leading-relaxed italic border-l border-slate-100 pl-2.5 max-h-[120px] overflow-y-auto break-words">
                          {isObra ? obraItem?.observacoes : servicoItem?.observacao}
                        </p>
                      </div>
                    )}

                    {/* Calendar & WhatsApp Quick Link Generators */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button 
                        onClick={() => {
                          const url = isObra && obraItem 
                            ? generateObraGCalUrl(obraItem, tempDate, tempTeam)
                            : servicoItem 
                            ? generateServicoGCalUrl(servicoItem, tempDate, tempTeam)
                            : '';
                          if (url) {
                            window.open(url, '_blank');
                            addToast("Abrindo Google Agenda...");
                          } else {
                            addToast("Informe uma data de agendamento.");
                          }
                        }}
                        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200 active:scale-[0.98]"
                      >
                        <CalendarClock size={18} />
                        Anexar no Google Agenda
                      </button>

                      <button 
                        onClick={handleCopyScheduleText}
                        className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-100 hover:shadow-emerald-200 active:scale-[0.98]"
                      >
                        <Copy size={16} />
                        Copiar Para WhatsApp
                      </button>
                    </div>

                  </div>
                </div>

                {/* Minimalist Footnotes / Actions */}
                <div className="p-4 bg-slate-100 flex items-center justify-between border-t border-slate-200 shrink-0 gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedDetails(null)}
                    className="px-5 h-11 rounded-xl text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-all font-bold text-xs uppercase tracking-wider"
                  >
                    Fechar Detalhes
                  </button>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (isObra) {
                          onEditObra?.(obraItem!);
                        } else {
                          onEditServico?.(servicoItem!);
                        }
                        setSelectedDetails(null);
                      }}
                      className="flex items-center gap-1.5 px-5 h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-indigo-100 uppercase tracking-wider active:scale-95"
                    >
                      <Edit size={14} />
                      Editar Ficha
                    </button>
                    
                    {item.txtFile && (
                      <button
                        onClick={() => {
                          setViewingTxt(item.txtFile || null);
                          setSelectedDetails(null);
                        }}
                        className="flex items-center gap-1.5 px-5 h-11 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-black transition-all shadow-md shadow-slate-200 uppercase tracking-wider active:scale-95"
                      >
                        <FileText size={14} />
                        Ficha Técnica .txt
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* TXT View Modal */}
      <AnimatePresence>
        {viewingTxt && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setViewingTxt(null)}
              className="absolute inset-0 bg-[#1e2f3e]/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 bg-indigo-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText size={24} />
                  <div>
                    <h2 className="text-xl font-bold leading-tight">{viewingTxt.name}</h2>
                    <p className="text-[10px] uppercase font-black tracking-widest opacity-70">Visualização de Documento</p>
                  </div>
                </div>
                <button onClick={() => setViewingTxt(null)} className="hover:bg-white/10 p-2 rounded-xl transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                <pre className="text-slate-700 font-mono text-sm leading-relaxed whitespace-pre-wrap p-4 bg-white rounded-2xl border border-slate-200 shadow-inner">
                  {viewingTxt.content}
                </pre>
              </div>

              <div className="p-4 bg-white border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => {
                    const blob = new Blob([viewingTxt.content], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = viewingTxt.name;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-all active:scale-95 border border-indigo-100"
                >
                  <Download size={18} />
                  Baixar Arquivo .txt
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Google Agenda Weekly Modal */}
      <AnimatePresence>
        {isGCalModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsGCalModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="p-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-white/15 rounded-2xl backdrop-blur-md">
                    <CalendarClock size={28} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black leading-tight">Anexar Escala no Google Agenda</h2>
                    <p className="text-xs text-blue-100 font-medium">
                      Semana: {formatDateBR(weekRange.startStr)} até {formatDateBR(weekRange.endStr)}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsGCalModalOpen(false)} 
                  className="hover:bg-white/10 p-2 rounded-xl transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto bg-slate-50 flex-1 space-y-4">
                {(() => {
                  const weekObras = obras.filter(o => o.dataObra && o.dataObra >= weekRange.startStr && o.dataObra <= weekRange.endStr);
                  const weekServicos = servicos.filter(s => s.dataServico && s.dataServico >= weekRange.startStr && s.dataServico <= weekRange.endStr);

                  const allItems = [
                    ...weekObras.map(o => ({ type: 'obra' as const, item: o, date: o.dataObra, team: o.equipe })),
                    ...weekServicos.map(s => ({ type: 'servico' as const, item: s, date: s.dataServico, team: s.equipeServico }))
                  ].sort((a, b) => a.date.localeCompare(b.date));

                  if (allItems.length === 0) {
                    return (
                      <div className="text-center py-12 bg-white rounded-2xl border border-slate-200/80 p-8">
                        <Calendar size={48} className="mx-auto text-slate-300 mb-3" />
                        <h3 className="text-base font-bold text-slate-700">Nenhum agendamento nesta semana</h3>
                        <p className="text-xs text-slate-400 mt-1">
                          Nenhuma obra ou serviço possui data agendada entre {formatDateBR(weekRange.startStr)} e {formatDateBR(weekRange.endStr)}.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                          {allItems.length} {allItems.length === 1 ? 'Agendamento Encontrado' : 'Agendamentos Encontrados'}
                        </span>
                        <button
                          onClick={() => {
                            allItems.forEach(({ type, item, date, team }) => {
                              const url = type === 'obra' 
                                ? generateObraGCalUrl(item as Obra, date, team)
                                : generateServicoGCalUrl(item as Servico, date, team);
                              if (url) window.open(url, '_blank');
                            });
                          }}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl font-bold text-xs transition-colors border border-blue-100"
                        >
                          <ExternalLink size={14} />
                          Abrir Todos no Google Agenda
                        </button>
                      </div>

                      {allItems.map(({ type, item, date, team }, idx) => {
                        const isObra = type === 'obra';
                        const url = isObra 
                          ? generateObraGCalUrl(item as Obra, date, team)
                          : generateServicoGCalUrl(item as Servico, date, team);

                        return (
                          <div 
                            key={idx} 
                            className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs hover:border-blue-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                  isObra ? 'bg-indigo-100 text-indigo-700' : 'bg-teal-100 text-teal-700'
                                }`}>
                                  {isObra ? 'Instalação Solar' : 'Serviço Manutenção'}
                                </span>
                                <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-md">
                                  {formatDateBR(date)} ({getDayOfWeek(date)})
                                </span>
                                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                                  Equipe: {team || 'Sem Equipe'}
                                </span>
                              </div>
                              <h4 className="text-sm font-black text-slate-900">{item.cliente}</h4>
                              <p className="text-xs text-slate-500 flex items-center gap-1">
                                <MapPin size={12} className="text-slate-400 shrink-0" />
                                {item.local || 'Sem endereço informado'}
                              </p>
                            </div>

                            <button
                              onClick={() => {
                                if (url) {
                                  window.open(url, '_blank');
                                  addToast(`Anexando ${item.cliente} no Google Agenda...`);
                                }
                              }}
                              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-200 transition-all active:scale-95 shrink-0"
                            >
                              <CalendarClock size={16} />
                              Anexar
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              <div className="p-4 bg-white border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setIsGCalModalOpen(false)}
                  className="px-6 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
