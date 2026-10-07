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
  CalendarClock,
  Eye,
  EyeOff,
  Filter,
  Type,
  CreditCard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { generateObraGCalUrl, generateServicoGCalUrl } from '../lib/googleCalendar';
import ObservacaoModal, { ObservacaoModalData } from './ObservacaoModal';
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
import { Obra, Servico, getServicoTeams } from '../types';

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

/**
 * Normaliza e verifica se o agendamento está pendente ou em espera
 */
export const isStatusPendente = (situacao?: string | null): boolean => {
  if (!situacao) return true; // sem status definido é considerado pendente
  const s = situacao.trim().toLowerCase();
  return s === 'pendente' || s === 'em espera' || s === 'espera' || s === 'aguardando';
};

/**
 * Normaliza e verifica se o agendamento está em andamento / execução
 */
export const isStatusEmAndamento = (situacao?: string | null): boolean => {
  if (!situacao) return false;
  const s = situacao.trim().toLowerCase();
  return s === 'em andamento' || s === 'andamento' || s === 'execução' || s === 'execucao' || s === 'agendado';
};

/**
 * Normaliza e verifica se o agendamento está concluído (com ou sem acento, maiúsculas/minúsculas)
 */
export const isStatusConcluido = (situacao?: string | null): boolean => {
  if (!situacao) return false;
  const s = situacao.trim().toLowerCase();
  return s === 'concluído' || s === 'concluido' || s === 'finalizado' || s === 'concluida' || s === 'concluída';
};

/**
 * Determina automaticamente a cor de fundo da célula na escala semanal:
 * - Se houver agendamentos e TODOS estiverem 'Concluído' => Verde (#22c55e)
 * - Se houver agendamentos com 'Em Andamento' => Azul (#3b82f6)
 * - Se houver agendamentos com 'Pendente' / 'Em Espera' => Amarelo (#eab308)
 * - Caso não haja agendamentos => Usa cor manual escolhida ou branco (#ffffff)
 */
export const getAutoCellColor = (
  obrasList: Obra[],
  servicosList: Servico[],
  manualColor?: string
): { color: string; isAuto: boolean } => {
  const allItems = [...obrasList, ...servicosList];
  if (allItems.length > 0) {
    const allConcluido = allItems.every(i => isStatusConcluido(i.situacao));
    if (allConcluido) {
      return { color: '#22c55e', isAuto: true }; // Verde automático para agendamentos concluídos
    }
    const hasEmAndamento = allItems.some(i => isStatusEmAndamento(i.situacao));
    if (hasEmAndamento) {
      return { color: '#3b82f6', isAuto: true }; // Azul automático para agendamentos em andamento
    }
    // Pendentes e em espera ficam amarelo automático
    return { color: '#eab308', isAuto: true }; // Amarelo automático para agendamentos pendentes
  }
  return { color: manualColor || '#ffffff', isAuto: false };
};

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
  // Estado local sincronizado para resposta visual imediata (otimista) na escala
  const [localObras, setLocalObras] = useState<Obra[]>(obras);
  const [localServicos, setLocalServicos] = useState<Servico[]>(servicos);

  useEffect(() => {
    setLocalObras(obras);
  }, [obras]);

  useEffect(() => {
    setLocalServicos(servicos);
  }, [servicos]);

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
  const [viewingObs, setViewingObs] = useState<ObservacaoModalData | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<{type: 'obra' | 'servico', item: Obra | Servico} | null>(null);
  const [tempDate, setTempDate] = useState('');
  const [tempTeam, setTempTeam] = useState('');
  const [isGCalModalOpen, setIsGCalModalOpen] = useState(false);
  // Tamanho da letra da escala: padrão 'normal' (1x) e organizado
  const [fontSizeLevel, setFontSizeLevel] = useState<'normal' | 'large' | 'xlarge'>('normal');

  const fontConfig = useMemo(() => {
    if (fontSizeLevel === 'large') {
      return {
        cardPadding: 'p-1.5 rounded-xl',
        clientName: 'text-[13px] font-black leading-snug',
        serviceBadge: 'text-[10px] font-black px-1.5 py-0.5 rounded',
        statusSelect: 'text-[9.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded',
        placasBadge: 'text-[9.5px] font-black italic px-1.5 py-0.2 rounded',
        concluirBtn: 'px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider',
        checkIconSize: 11,
        actionIconSize: 12,
        actionBtnPadding: 'p-1',
        obsTag: 'text-[11px] uppercase font-black px-2 py-0.5 rounded shadow-2xs',
        obsText: 'text-[13.5px] font-black leading-snug',
        obsBox: 'mt-1 flex items-center gap-2 px-2.5 py-1 rounded-lg',
        textarea: 'text-[11px] font-medium h-6 min-h-[22px]',
        cellMinHeight: 'min-h-[85px]',
        dayText: 'text-sm font-bold',
        dateText: 'text-[11px] font-medium',
        adminDayBadge: 'text-[9px] font-bold px-1.5 py-0.5',
        adminIconSize: 9,
      };
    }
    if (fontSizeLevel === 'xlarge') {
      return {
        cardPadding: 'p-2 rounded-xl',
        clientName: 'text-[14.5px] font-black leading-snug',
        serviceBadge: 'text-[11.5px] font-black px-2 py-0.5 rounded',
        statusSelect: 'text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded',
        placasBadge: 'text-[11px] font-black italic px-2 py-0.5 rounded',
        concluirBtn: 'px-2.5 py-1 rounded font-bold text-[10px] uppercase tracking-wider',
        checkIconSize: 13,
        actionIconSize: 14,
        actionBtnPadding: 'p-1.5',
        obsTag: 'text-[12px] uppercase font-black px-2.5 py-0.5 rounded shadow-2xs',
        obsText: 'text-[15px] font-black leading-snug',
        obsBox: 'mt-1.5 flex items-center gap-2 px-3 py-1.5 rounded-lg',
        textarea: 'text-[12px] font-medium h-7 min-h-[26px]',
        cellMinHeight: 'min-h-[100px]',
        dayText: 'text-base font-black',
        dateText: 'text-xs font-bold',
        adminDayBadge: 'text-[10px] font-black px-2 py-0.5',
        adminIconSize: 10,
      };
    }
    // Padrão: 'normal' (1x - limpo, legível e organizado)
    return {
      cardPadding: 'p-1.5 rounded-xl',
      clientName: 'text-[11.5px] font-black leading-snug',
      serviceBadge: 'text-[9px] font-black px-1.5 py-0.2 rounded',
      statusSelect: 'text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded',
      placasBadge: 'text-[8.5px] font-black italic px-1.5 py-0.2 rounded',
      concluirBtn: 'px-1.5 py-0.5 rounded font-bold text-[8.5px] uppercase tracking-wider',
      checkIconSize: 10,
      actionIconSize: 11,
      actionBtnPadding: 'p-1',
      obsTag: 'text-[9.5px] uppercase font-black px-1.5 py-0.5 rounded shadow-2xs',
      obsText: 'text-[12px] font-black leading-snug',
      obsBox: 'mt-1 flex items-center gap-1.5 px-2 py-1 rounded-lg',
      textarea: 'text-[10px] font-medium h-5 min-h-[20px]',
      cellMinHeight: 'min-h-[80px]',
      dayText: 'text-xs font-bold',
      dateText: 'text-[10px] font-medium',
      adminDayBadge: 'text-[8px] font-black px-1.5 py-0.5',
      adminIconSize: 8,
    };
  }, [fontSizeLevel]);

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

  // Estado para ocultar equipes que não têm agendamento automático na semana atual
  const [hideEmptyTeams, setHideEmptyTeams] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('escala_hide_teams_without_auto');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const toggleHideEmptyTeams = () => {
    setHideEmptyTeams(prev => {
      const next = !prev;
      try {
        localStorage.setItem('escala_hide_teams_without_auto', JSON.stringify(next));
      } catch (e) {
        console.error("Error saving hideEmptyTeams preference", e);
      }
      return next;
    });
  };

  // Contagem de agendamentos automáticos de cada equipe nesta semana (obras e serviços)
  const teamScheduleCounts = useMemo(() => {
    const datesSet = new Set(weekDatesFull);
    const counts: Record<string, number> = {};

    teams.forEach(t => {
      const tName = t.name.trim().toLowerCase();
      let count = 0;
      localObras.forEach(o => {
        const datePart = (o.dataObra || '').split('T')[0];
        if (datesSet.has(datePart) && (o.equipe || '').trim().toLowerCase() === tName) {
          count++;
        }
      });
      localServicos.forEach(s => {
        const datePart = (s.dataServico || '').split('T')[0];
        if (datesSet.has(datePart)) {
          const sTeams = getServicoTeams(s);
          if (sTeams.some(st => st.trim().toLowerCase() === tName)) {
            count++;
          }
        }
      });
      counts[t.id] = count;
    });

    return counts;
  }, [teams, weekDatesFull, localObras, localServicos]);

  // Equipes visíveis na escala conforme o filtro de agendamento automático
  const visibleTeams = useMemo(() => {
    if (!hideEmptyTeams) return teams;
    return teams.filter(t => (teamScheduleCounts[t.id] || 0) > 0);
  }, [teams, hideEmptyTeams, teamScheduleCounts]);

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

    // Atualização otimista imediata para mudança instantânea da cor (Azul / Verde) na UI
    setLocalObras(prev => prev.map(o => {
      if (o.firebaseId === targetId || String(o.id) === String(targetId)) {
        return { ...o, situacao: newStatus as any };
      }
      return o;
    }));

    try {
      const docRef = doc(db, 'obras', targetId);
      await updateDoc(docRef, {
        situacao: newStatus,
        updatedAt: serverTimestamp()
      });
      addToast(`Status de "${obra.cliente}" alterado para "${newStatus}"`);
    } catch (err) {
      console.error("Erro ao alterar status da obra:", err);
      setLocalObras(obras);
      addToast("❌ Erro ao atualizar status da obra.");
    }
  };

  const handleQuickStatusChangeServico = async (servico: Servico, newStatus: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const targetId = servico.firebaseId || (servico as any).id;
    if (!targetId) return;

    // Atualização otimista imediata para mudança instantânea da cor (Azul / Verde) na UI
    setLocalServicos(prev => prev.map(s => {
      if (s.firebaseId === targetId || String(s.id) === String(targetId)) {
        return { ...s, situacao: newStatus as any };
      }
      return s;
    }));

    try {
      const docRef = doc(db, 'servicos', targetId);
      await updateDoc(docRef, {
        situacao: newStatus,
        updatedAt: serverTimestamp()
      });
      addToast(`Status de "${servico.cliente}" alterado para "${newStatus}"`);
    } catch (err) {
      console.error("Erro ao alterar status do serviço:", err);
      setLocalServicos(servicos);
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

  const moveVisibleTeam = async (teamId: string, direction: 'left' | 'right') => {
    const vIndex = visibleTeams.findIndex(t => t.id === teamId);
    if (vIndex === -1) return;
    const targetVIndex = direction === 'left' ? vIndex - 1 : vIndex + 1;
    if (targetVIndex < 0 || targetVIndex >= visibleTeams.length) return;

    const targetTeamId = visibleTeams[targetVIndex].id;
    const indexA = teams.findIndex(t => t.id === teamId);
    const indexB = teams.findIndex(t => t.id === targetTeamId);
    if (indexA === -1 || indexB === -1) return;

    const newTeams = [...teams];
    [newTeams[indexA], newTeams[indexB]] = [newTeams[indexB], newTeams[indexA]];

    setTeams(newTeams);

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
    try {
      const targetTeams = visibleTeams.length > 0 ? visibleTeams : teams;
      if (targetTeams.length === 0) {
        addToast("Nenhuma equipe cadastrada para exportar.");
        return;
      }

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();

      // Top Header Bar
      doc.setFillColor(30, 47, 62); // #1e2f3e
      doc.rect(0, 0, pageWidth, 22, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("CBC ENERGIAS RENOVÁVEIS - ESCALA SEMANAL DE TRABALHO", 14, 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(203, 213, 225); // slate-300
      doc.text(`Período: ${weekRange}  |  Equipes Ativas: ${targetTeams.length}`, 14, 18);

      const timestamp = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
      doc.text(timestamp, pageWidth - 14, 18, { align: 'right' });

      const head = [['Dia / Data', ...targetTeams.map(t => t.name)]];
      const body = DAYS.map((day, i) => {
        const fullDate = weekDatesFull[i];
        let dayText = `${day}\n(${weekDates[i]})`;

        return [
          dayText,
          ...targetTeams.map(team => {
            const teamName = team.name.trim().toLowerCase();
            const cellItems: string[] = [];

            // 1. Manual Text entered by user (excluding automated prefix relics)
            const manualText = schedule[day]?.[team.id]?.text || '';
            const filteredManual = manualText
              .split('\n')
              .map(l => l.trim())
              .filter(l => {
                return l.length > 0 && 
                  !l.startsWith('Cliente:') && 
                  !l.startsWith('• [OBRA]') && 
                  !l.startsWith('• [SERVIÇO]') &&
                  !l.startsWith('• [ADMIN]') &&
                  !l.startsWith('• [ATEND. ADMIN]');
              });

            if (filteredManual.length > 0) {
              cellItems.push(filteredManual.join('\n'));
            }

            // 2. Matching Obras
            const matchingObras = localObras.filter(o => {
              const obraEquipe = (o.equipe || '').trim().toLowerCase();
              return obraEquipe === teamName && (o.dataObra || '').split('T')[0] === fullDate;
            });

            matchingObras.forEach(o => {
              let obraDesc = `• [OBRA] ${o.cliente}`;
              if (o.quantidadePlacas > 0) obraDesc += ` (${o.quantidadePlacas} PL)`;
              if (o.formaPagamento) obraDesc += ` [Pgto: ${o.formaPagamento}]`;
              if (o.situacao && o.situacao !== 'Em Andamento') obraDesc += ` [${o.situacao}]`;
              if (o.observacoes) obraDesc += `\n  Obs: ${o.observacoes}`;
              cellItems.push(obraDesc);
            });

            // 3. Matching Serviços (including Atendimento Administrativo and multiple teams)
            const matchingServicos = localServicos.filter(s => {
              const sDate = (s.dataServico || '').split('T')[0];
              if (sDate !== fullDate) return false;
              const sTeams = getServicoTeams(s);
              return sTeams.some(st => st.trim().toLowerCase() === teamName);
            });

            matchingServicos.forEach(s => {
              const isAdm = s.tipoAtendimento === 'Administrativo';
              const tag = isAdm ? '[ATEND. ADMIN]' : '[SERVIÇO]';
              const sTeams = getServicoTeams(s);
              let servDesc = `• ${tag} ${s.cliente}`;
              if (sTeams.length > 1) {
                servDesc += ` [Equipes: ${sTeams.join(' + ')}]`;
              }
              if (s.servico) servDesc += ` (${s.servico})`;
              if (s.formaPagamento) servDesc += ` [Pgto: ${s.formaPagamento}]`;
              if (s.situacao && s.situacao !== 'Em Andamento') servDesc += ` [${s.situacao}]`;
              if (s.observacao) servDesc += `\n  Obs: ${s.observacao}`;
              cellItems.push(servDesc);
            });

            return cellItems.length > 0 ? cellItems.join('\n\n') : '-';
          })
        ];
      });

      const colCount = targetTeams.length + 1;
      const fontSize = colCount > 9 ? 6 : colCount > 6 ? 7 : 8;

      autoTable(doc, {
        startY: 26,
        head: head,
        body: body,
        theme: 'grid',
        styles: { 
          fontSize: fontSize, 
          cellPadding: 2,
          valign: 'top',
          overflow: 'linebreak',
          lineColor: [226, 232, 240], // slate-200
          lineWidth: 0.2
        },
        headStyles: { 
          fillColor: [30, 47, 62], 
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle',
          fontSize: fontSize + 0.5
        },
        columnStyles: {
          0: { 
            cellWidth: 26, 
            fontStyle: 'bold', 
            fillColor: [248, 250, 252], 
            textColor: [30, 47, 62],
            halign: 'center' 
          }
        },
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.column.index > 0) {
            const team = targetTeams[data.column.index - 1];
            if (!team) return;
            const day = DAYS[data.row.index];
            const fullDate = weekDatesFull[data.row.index];
            const teamName = team.name.trim().toLowerCase();

            const matchingObras = localObras.filter(o => {
              const obraEquipe = (o.equipe || '').trim().toLowerCase();
              return obraEquipe === teamName && (o.dataObra || '').split('T')[0] === fullDate;
            });
            const matchingServicos = localServicos.filter(s => {
              const sDate = (s.dataServico || '').split('T')[0];
              if (sDate !== fullDate) return false;
              const sTeams = getServicoTeams(s);
              return sTeams.some(st => st.trim().toLowerCase() === teamName);
            });

            const cellData = schedule[day]?.[team.id];
            const autoColorInfo = getAutoCellColor(matchingObras, matchingServicos, cellData?.color);
            const cellColor = autoColorInfo.color;

            if (cellColor && cellColor !== '#ffffff') {
              data.cell.styles.fillColor = cellColor;
              const colorObj = COLORS.find(c => c.bg.toLowerCase() === cellColor.toLowerCase());
              if (colorObj?.isDark || cellColor === '#3b82f6' || cellColor === '#22c55e') {
                data.cell.styles.textColor = '#ffffff';
              } else {
                data.cell.styles.textColor = '#1e2f3e';
              }
            } else {
              // Highlight lightly if cell contains administrative appointment
              const cellText = String(data.cell.raw || '');
              if (cellText.includes('[ATEND. ADMIN]')) {
                data.cell.styles.fillColor = [250, 245, 255]; // light purple bg
              }
            }
          }
        }
      });

      const sanitizedRange = weekRange.replace(/[/\\?%*:|"<> ]/g, '_');
      doc.save(`escala_semanal_${sanitizedRange}.pdf`);
      addToast("Escala Semanal exportada para PDF com sucesso!");
    } catch (err: any) {
      console.error("Erro ao gerar PDF da escala:", err);
      addToast(`Erro ao exportar PDF: ${err?.message || 'Falha inesperada'}`);
    }
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
          {/* Botão de Ocultar Equipes Sem Agendamento Automático */}
          <button
            onClick={toggleHideEmptyTeams}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl font-bold shadow-sm transition-all text-xs sm:text-sm border active:scale-95 cursor-pointer ${
              hideEmptyTeams
                ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-amber-500/20 ring-2 ring-amber-400/40'
                : 'bg-white hover:bg-slate-50 text-[#1e2f3e] border-slate-200'
            }`}
            title={hideEmptyTeams 
              ? `Filtro ativo: ${teams.length - visibleTeams.length} equipes sem agendamento automático estão ocultas nesta semana. Clique para exibir todas.` 
              : "Clique para ocultar equipes que não têm agendamento automático nesta semana"}
          >
            {hideEmptyTeams ? (
              <>
                <EyeOff size={18} className="stroke-[2.5]" />
                <span>Ocultar s/ Agendamento</span>
                <span className="bg-amber-700/70 text-white text-[10px] px-2 py-0.5 rounded-full font-black">
                  {teams.length - visibleTeams.length} ocultas
                </span>
              </>
            ) : (
              <>
                <Eye size={18} className="text-slate-500" />
                <span>Ocultar s/ Agendamento</span>
                {teams.length - visibleTeams.length > 0 && (
                  <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                    {teams.length - visibleTeams.length} vazias
                  </span>
                )}
              </>
            )}
          </button>

          {/* Controle de Tamanho da Letra (1x, 2x, 2.5x) */}
          <div className="flex items-center bg-white rounded-2xl border border-slate-200 shadow-sm p-1 gap-1">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 px-2 flex items-center gap-1">
              <Type size={14} className="text-indigo-600" />
              Fonte:
            </span>
            <button
              onClick={() => setFontSizeLevel('normal')}
              className={`px-2.5 py-1.5 rounded-xl font-black text-xs transition-all ${
                fontSizeLevel === 'normal'
                  ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Tamanho Normal (1x)"
            >
              1x
            </button>
            <button
              onClick={() => setFontSizeLevel('large')}
              className={`px-2.5 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1 ${
                fontSizeLevel === 'large'
                  ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Tamanho 2x Maior"
            >
              2x
            </button>
            <button
              onClick={() => setFontSizeLevel('xlarge')}
              className={`px-2.5 py-1.5 rounded-xl font-black text-xs transition-all ${
                fontSizeLevel === 'xlarge'
                  ? 'bg-purple-600 text-white shadow-xs ring-2 ring-purple-300'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
              title="Tamanho Extra Grande (2.5x)"
            >
              2.5x
            </button>
          </div>

          {/* Indicador Automático de Cores da Escala */}
          <div className="flex items-center bg-white rounded-2xl border border-slate-200 shadow-sm px-3 py-1.5 gap-2 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-amber-700 font-extrabold" title="Status Pendente deixa o dia/coluna amarelo automático">
              <span className="w-2.5 h-2.5 rounded-full bg-[#eab308] shadow-2xs"></span>
              Pendente (Amarelo)
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1.5 text-blue-700 font-extrabold" title="Status Em Andamento deixa o dia/coluna azul automático">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] shadow-2xs"></span>
              Em Andamento (Azul)
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1.5 text-emerald-700 font-extrabold" title="Status Concluído deixa o dia/coluna verde automático">
              <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] shadow-2xs"></span>
              Concluído (Verde)
            </span>
          </div>

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

      {/* Banner Informativo quando equipes estiverem ocultadas */}
      {hideEmptyTeams && (
        <div className="flex-none mb-2 bg-amber-50/90 border border-amber-200 px-3.5 py-1.5 rounded-xl flex items-center justify-between text-xs text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <EyeOff size={14} className="text-amber-700 shrink-0" />
            <span>
              {visibleTeams.length > 0 ? (
                <>
                  Exibindo <strong>{visibleTeams.length}</strong> de {teams.length} equipes com agendamentos automáticos na semana ({weekRange}).{' '}
                  <span className="text-amber-700 font-medium">({teams.length - visibleTeams.length} {teams.length - visibleTeams.length === 1 ? 'equipe sem agendamento ocultada' : 'equipes sem agendamento ocultadas'})</span>
                </>
              ) : (
                <>
                  Nenhuma equipe possui agendamentos automáticos de obras ou serviços na semana de <strong>{weekRange}</strong>.
                </>
              )}
            </span>
          </div>
          <button
            onClick={toggleHideEmptyTeams}
            className="text-amber-800 hover:text-amber-950 font-bold underline text-xs cursor-pointer shrink-0 ml-3"
          >
            Mostrar todas as equipes
          </button>
        </div>
      )}

      {/* Main Table */}
      <div className="flex-1 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-auto flex-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          <table className={`w-full border-collapse table-fixed ${visibleTeams.length > 5 ? 'min-w-[1350px]' : visibleTeams.length > 3 ? 'min-w-[980px]' : 'min-w-full'}`}>
            <thead className="sticky top-0 z-30">
              <tr className="bg-[#1e2f3e] text-white">
                <th className="p-2.5 text-left font-bold border-r border-white/10 w-32 text-xs sm:text-sm">Dia / Data</th>
                {visibleTeams.map((team, vIdx) => (
                  <th key={team.id} className="p-2.5 text-center font-bold border-r border-white/10 text-xs sm:text-sm relative group/header">
                    <div className="flex items-center justify-center gap-3">
                      <button 
                        onClick={() => moveVisibleTeam(team.id, 'left')}
                        className={`p-1.5 hover:bg-white/20 rounded-lg transition-all ${vIdx === 0 ? 'opacity-0 cursor-default' : 'opacity-0 group-hover/header:opacity-100'}`}
                        disabled={vIdx === 0}
                        title="Mover equipe para a esquerda"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      
                      <div className="flex flex-col items-center min-w-0">
                        <span className="truncate max-w-[140px] font-black text-sm">{team.name}</span>
                        {teamScheduleCounts[team.id] > 0 && (
                          <span className="text-[11px] font-bold text-amber-300 opacity-90 tracking-wide">
                            {teamScheduleCounts[team.id]} {teamScheduleCounts[team.id] === 1 ? 'agendamento' : 'agendamentos'}
                          </span>
                        )}
                      </div>
                      
                      <button 
                        onClick={() => moveVisibleTeam(team.id, 'right')}
                        className={`p-1.5 hover:bg-white/20 rounded-lg transition-all ${vIdx === visibleTeams.length - 1 ? 'opacity-0 cursor-default' : 'opacity-0 group-hover/header:opacity-100'}`}
                        disabled={vIdx === visibleTeams.length - 1}
                        title="Mover equipe para a direita"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </th>
                ))}
                {visibleTeams.length === 0 && (
                  <th className="p-4 text-center italic text-white/70 font-normal">
                    {teams.length === 0 
                      ? 'Nenhuma equipe cadastrada' 
                      : (
                        <span>
                          Nenhuma equipe possui agendamentos automáticos nesta semana.{' '}
                          <button 
                            onClick={toggleHideEmptyTeams}
                            className="underline text-amber-300 hover:text-amber-200 font-bold ml-1 cursor-pointer"
                          >
                            Exibir todas as equipes
                          </button>
                        </span>
                      )
                    }
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, dayIdx) => {
                const isToday = weekDatesFull[dayIdx] === todayStr;
                return (
                  <tr key={day} className={`border-b border-slate-200 last:border-0 ${isToday ? 'bg-indigo-50/40' : ''}`}>
                    <td className={`p-2.5 border-r border-slate-200 w-32 transition-colors ${isToday ? 'bg-indigo-100/50' : 'bg-slate-50'}`}>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <p className={`font-black text-[#1e2f3e] ${fontConfig.dayText}`}>{day}</p>
                          {isToday && (
                            <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full uppercase tracking-tight">Hoje</span>
                          )}
                        </div>
                        <p className={`font-semibold text-slate-500 ${fontConfig.dateText}`}>{weekDates[dayIdx]}</p>
                      </div>

                      {/* Atendimentos Administrativos do Dia Visíveis */}
                      {(() => {
                        const fullDate = weekDatesFull[dayIdx];
                        const dayAdminServicos = localServicos.filter(s => {
                          const sDate = (s.dataServico || '').split('T')[0];
                          return sDate === fullDate && s.tipoAtendimento === 'Administrativo';
                        });
                        if (dayAdminServicos.length === 0) return null;
                        return (
                          <div className="mt-1.5 space-y-1">
                            {dayAdminServicos.map(as => (
                              <div
                                key={as.firebaseId || as.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDetails({ type: 'servico', item: as });
                                }}
                                className={`rounded bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 font-black cursor-pointer truncate shadow-2xs flex items-center gap-1 transition-all ${fontConfig.adminDayBadge}`}
                                title={`Atendimento Administrativo: ${as.cliente} - ${as.servico || 'Sem descrição'}`}
                              >
                                <Briefcase size={fontConfig.adminIconSize} className="shrink-0 text-purple-700" />
                                <span className="truncate">{as.cliente}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                  {visibleTeams.length === 0 && (
                    <td className="p-3 text-center text-slate-400 italic text-xs bg-slate-50/40">
                      Sem agendamentos nesta data
                    </td>
                  )}
                  {visibleTeams.map(team => {
                    const cellData = schedule[day]?.[team.id] || { text: '', color: '#ffffff' };
                    const fullDate = weekDatesFull[dayIdx];

                    // Match automatically scheduled items
                    const matchingObras = localObras.filter(o => {
                      const obraEquipe = (o.equipe || '').trim().toLowerCase();
                      const teamName = team.name.trim().toLowerCase();
                      const isTeamMatch = obraEquipe === teamName;
                      if (!isTeamMatch) return false;
                      
                      const oDate = (o.dataObra || '').split('T')[0];
                      const isExactDate = oDate === fullDate;
                      
                      return isExactDate;
                    });

                    const matchingServicos = localServicos.filter(s => {
                      const sDate = (s.dataServico || '').split('T')[0];
                      if (sDate !== fullDate) return false;
                      const teamName = team.name.trim().toLowerCase();
                      const sTeams = getServicoTeams(s);
                      return sTeams.some(st => st.trim().toLowerCase() === teamName);
                    });

                    // Automatic status-based color calculation:
                    // - Em Andamento / Pendente => Azul (#3b82f6)
                    // - Concluído => Verde (#22c55e)
                    const autoColorInfo = getAutoCellColor(matchingObras, matchingServicos, cellData.color);
                    const cellColor = autoColorInfo.color;
                    const colorObj = COLORS.find(c => c.bg.toLowerCase() === cellColor.toLowerCase());
                    const isDark = colorObj ? colorObj.isDark : (cellColor === '#3b82f6' || cellColor === '#22c55e' || cellColor === '#1e2f3e');

                    const cleanManualText = cellData.text.split('\n').filter(line => {
                      const trimmed = line.trim();
                      return !trimmed.startsWith('Cliente:') && 
                             !trimmed.startsWith('• [OBRA]') && 
                             !trimmed.startsWith('• [SERVIÇO]');
                    }).join('\n').trim();
                    const hasItems = matchingObras.length > 0 || matchingServicos.length > 0;

                    return (
                      <td 
                        key={team.id} 
                        className={`p-1.5 border-r border-slate-200 relative group ${fontConfig.cellMinHeight} align-top transition-colors duration-300`}
                        style={{ backgroundColor: cellColor }}
                      >
                        <textarea 
                          value={cleanManualText} 
                          onChange={(e) => {
                            // When user changes text manually, we keep their changes
                            // But we filter out the auto-synced part to avoid redundancy in the view state if any remains
                            updateCell(day, team.id, e.target.value, cellColor);
                          }}
                          placeholder={hasItems ? "" : "..."}
                          className={`w-full ${
                            hasItems && !cleanManualText 
                              ? 'h-3.5 min-h-[14px] opacity-0 group-hover:opacity-60 focus:opacity-100 transition-opacity' 
                              : fontConfig.textarea
                          } p-0.5 bg-transparent resize-none outline-none leading-tight transition-colors ${
                            isDark 
                              ? 'text-white placeholder:text-white/40' 
                              : cellColor === '#eab308' 
                              ? 'text-amber-950 placeholder:text-amber-900/40 font-semibold' 
                              : 'text-[#1e2f3e] placeholder:text-slate-300'
                          }`}
                        />

                        {/* Automatic Items Display */}
                        { (matchingObras.length > 0 || matchingServicos.length > 0) && (
                          <div className="mt-1 space-y-1.5 px-0.5 pb-1">
                            {matchingObras.map(o => {
                              const concluido = isStatusConcluido(o.situacao);
                              return (
                              <div 
                                key={o.firebaseId || o.id} 
                                onClick={() => setSelectedDetails({ type: 'obra', item: o })}
                                className={`font-bold ${fontConfig.cardPadding} flex flex-col shadow-xs border transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ${
                                  o.situacao === 'Em Espera' 
                                    ? 'bg-slate-50 text-slate-600 border-slate-200' 
                                    : concluido
                                    ? (cellColor === '#22c55e' ? 'bg-white/25 text-emerald-950 border-white/35 backdrop-blur-xs' : 'bg-emerald-50/70 text-emerald-900 border-emerald-200') 
                                    : isDark 
                                    ? 'bg-white/15 text-white border-white/25 backdrop-blur-xs' 
                                    : cellColor === '#eab308'
                                    ? 'bg-white/95 text-amber-950 border-amber-300 shadow-xs'
                                    : 'bg-white text-slate-800 border-slate-200/90'
                                }`}
                              >
                                {/* Linha 1: Status & Placas */}
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <div className="flex items-center gap-1 min-w-0">
                                    <ClipboardList size={11} className={`${isDark && !concluido ? 'text-white/80' : cellColor === '#eab308' ? 'text-amber-800' : 'text-indigo-600'} opacity-80 shrink-0`} />
                                    <select
                                      value={concluido ? 'Concluído' : (o.situacao || 'Em Andamento')}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => handleQuickStatusChangeObra(o, e.target.value, e)}
                                      className={`${fontConfig.statusSelect} outline-none cursor-pointer transition-all shadow-2xs ${
                                        concluido
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold'
                                          : o.situacao === 'Em Espera'
                                          ? 'bg-slate-200 text-slate-700 border-slate-300 font-extrabold'
                                          : o.situacao === 'Pendente'
                                          ? 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold'
                                          : isDark
                                          ? 'bg-white text-blue-800 border-blue-200 font-extrabold'
                                          : 'bg-blue-100 text-blue-800 border-blue-300 font-extrabold'
                                      }`}
                                      title="Alterar status deste agendamento de obra"
                                    >
                                      <option value="Em Andamento">Em Andamento</option>
                                      <option value="Concluído">Concluído</option>
                                      <option value="Pendente">Pendente</option>
                                      <option value="Em Espera">Em Espera</option>
                                    </select>
                                  </div>
                                  {o.quantidadePlacas > 0 && (
                                    <span className={`${fontConfig.placasBadge} ${
                                      cellColor === '#22c55e' || isDark
                                        ? 'text-white bg-white/20 border-white/30 font-extrabold'
                                        : cellColor === '#eab308'
                                        ? 'text-amber-950 bg-amber-100 border-amber-300 font-extrabold'
                                        : 'text-indigo-950 bg-indigo-50 border-indigo-200/70'
                                    } border shrink-0`}>
                                      {o.quantidadePlacas} PL
                                    </span>
                                  )}
                                </div>

                                {/* Linha 2: Nome do Cliente + Badges integrados (sem espaço vazio) */}
                                <div className="my-0.5 flex items-center gap-1.5 flex-wrap">
                                  <span 
                                    className={`font-black ${fontConfig.clientName} cursor-pointer transition-colors ${
                                      concluido 
                                        ? (cellColor === '#22c55e' ? 'line-through opacity-85 text-emerald-950 font-black' : 'line-through opacity-60 text-slate-500 font-black') 
                                        : isDark 
                                        ? 'text-white font-black' 
                                        : cellColor === '#eab308'
                                        ? 'text-amber-950 font-black'
                                        : 'text-slate-900 font-black hover:text-indigo-600'
                                    }`}
                                    title={o.cliente}
                                  >
                                    {o.cliente}
                                  </span>

                                  <span 
                                    className={`inline-flex items-center gap-1 ${fontConfig.serviceBadge} font-black tracking-wide border shadow-2xs ${
                                      concluido
                                        ? 'bg-emerald-900/90 text-emerald-100 border-emerald-700/60'
                                        : cellColor === '#3b82f6'
                                        ? 'bg-amber-300 text-amber-950 border-amber-400 font-black shadow-xs ring-1 ring-amber-400/50'
                                        : cellColor === '#eab308'
                                        ? 'bg-indigo-900 text-white border-indigo-700 font-black shadow-xs'
                                        : isDark
                                        ? 'bg-amber-300 text-amber-950 border-amber-400 font-black'
                                        : 'bg-indigo-600 text-white border-indigo-700 font-black shadow-xs'
                                    }`}
                                    title={`Tipo de Serviço: Instalação Solar ${o.inversor ? `• ${o.inversor}` : ''}`}
                                  >
                                    <Zap size={9} className="shrink-0 stroke-[2.5]" />
                                    <span className="truncate max-w-[130px]">Obra Solar</span>
                                  </span>

                                  {o.inversor && (
                                    <span 
                                      className={`text-[8.5px] font-black truncate max-w-[95px] px-1.5 py-0.2 rounded border ${
                                        cellColor === '#22c55e' || isDark
                                          ? 'bg-white/20 text-white border-white/30 font-bold'
                                          : cellColor === '#eab308'
                                          ? 'bg-amber-100 text-amber-950 border-amber-300 font-bold'
                                          : 'bg-slate-100 text-slate-700 border-slate-200 font-bold'
                                      }`} 
                                      title={`Inversor: ${o.inversor}`}
                                    >
                                      {o.inversor}
                                    </span>
                                  )}

                                  {o.formaPagamento && (
                                    <span 
                                      className={`inline-flex items-center gap-1 ${fontConfig.serviceBadge} font-black tracking-wide border shadow-2xs ${
                                        concluido
                                          ? 'bg-emerald-950 text-emerald-100 border-emerald-700/60'
                                          : cellColor === '#3b82f6'
                                          ? 'bg-emerald-300 text-emerald-950 border-emerald-400 font-black shadow-xs ring-1 ring-emerald-400/50'
                                          : cellColor === '#eab308'
                                          ? 'bg-emerald-800 text-white border-emerald-700 font-black shadow-xs ring-1 ring-emerald-600/40'
                                          : isDark
                                          ? 'bg-emerald-300 text-emerald-950 border-emerald-400 font-black shadow-xs'
                                          : 'bg-emerald-50 text-emerald-900 border-emerald-300 font-extrabold shadow-2xs'
                                      }`}
                                      title={`Forma de Pagamento: ${o.formaPagamento}${o.situacaoPagamento ? ` (${o.situacaoPagamento})` : ''}`}
                                    >
                                      <CreditCard size={9} className="shrink-0 stroke-[2.5]" />
                                      <span className="truncate max-w-[120px]">{o.formaPagamento}</span>
                                      {o.situacaoPagamento && (
                                        <span className="opacity-80 text-[7px] uppercase font-bold">• {o.situacaoPagamento}</span>
                                      )}
                                    </span>
                                  )}
                                </div>

                                {/* Linha 3: Barra de Ações (Concluir à esquerda, ícones à direita) */}
                                <div className="flex items-center justify-between gap-1 mt-1 pt-1 border-t border-slate-100/30 select-none">
                                  <button 
                                    onClick={(e) => handleQuickStatusChangeObra(o, concluido ? 'Em Andamento' : 'Concluído', e)}
                                    className={`transition-all flex items-center gap-1 shadow-2xs ${fontConfig.concluirBtn} ${
                                      concluido
                                        ? 'text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 font-extrabold'
                                        : isDark
                                        ? 'text-slate-800 bg-white hover:bg-slate-100 border border-white/40 font-extrabold'
                                        : cellColor === '#eab308'
                                        ? 'text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 font-extrabold'
                                        : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 bg-slate-50'
                                    }`}
                                    title={concluido ? 'Agendamento Concluído ✓ (Clique para reabrir)' : 'Marcar como Concluído'}
                                  >
                                    <Check size={fontConfig.checkIconSize} className={concluido ? 'stroke-[3] text-emerald-700' : 'stroke-[2.5]'} />
                                    <span>{concluido ? 'Concluído' : 'Concluir'}</span>
                                  </button>
                                  <div className="flex items-center gap-0.5">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const url = generateObraGCalUrl(o, fullDate, team.name);
                                        if (url) window.open(url, '_blank');
                                      }}
                                      className={`p-1 rounded transition-colors ${
                                        isDark ? 'text-white/80 hover:text-white hover:bg-white/10' : cellColor === '#22c55e' ? 'text-emerald-900/70 hover:text-emerald-900 hover:bg-emerald-100/50' : cellColor === '#eab308' ? 'text-amber-900/80 hover:text-amber-950 hover:bg-amber-200/50' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                                      }`}
                                      title="Anexar ao Google Agenda"
                                    >
                                      <CalendarClock size={fontConfig.actionIconSize} />
                                    </button>
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        onEditObra?.(o); 
                                      }}
                                      className={`p-1 rounded transition-colors ${
                                        isDark ? 'text-white/80 hover:text-white hover:bg-white/10' : cellColor === '#22c55e' ? 'text-emerald-900/70 hover:text-emerald-900 hover:bg-emerald-100/50' : cellColor === '#eab308' ? 'text-amber-900/80 hover:text-amber-950 hover:bg-amber-200/50' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
                                      }`}
                                      title="Editar Registro"
                                    >
                                      <Edit size={fontConfig.actionIconSize} />
                                    </button>
                                    {o.txtFile && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setViewingTxt(o.txtFile || null); }}
                                        className={`p-1 rounded transition-colors ${
                                          isDark ? 'text-white/80 hover:text-white hover:bg-white/10' : cellColor === '#22c55e' ? 'text-emerald-900/70 hover:text-emerald-900 hover:bg-emerald-100/50' : cellColor === '#eab308' ? 'text-amber-900/80 hover:text-amber-950 hover:bg-amber-200/50' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
                                        }`}
                                        title="Ver TXT"
                                      >
                                        <FileText size={fontConfig.actionIconSize} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Linha 4: Observações com letra maior e mais legível */}
                                {o.observacoes && (
                                  <div 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingObs({
                                        cliente: o.cliente,
                                        tipo: 'Obra',
                                        observacao: o.observacoes,
                                        data: o.dataObra ? formatDateBR(o.dataObra) : undefined
                                      });
                                    }}
                                    className={`${fontConfig.obsBox} ${
                                      cellColor === '#22c55e' || isDark
                                        ? 'bg-amber-100 text-amber-950 border-amber-300 font-bold'
                                        : 'bg-amber-100/90 text-amber-950 border-amber-300 font-bold'
                                    } border leading-snug shadow-2xs cursor-pointer hover:bg-amber-200 transition-colors`} 
                                    title={`Observação: ${o.observacoes}`}
                                  >
                                    <span className={`bg-amber-300 text-amber-950 ${fontConfig.obsTag} shrink-0 tracking-wider font-black`}>
                                      OBS
                                    </span>
                                    <span className={`line-clamp-2 flex-1 ${fontConfig.obsText}`}>{o.observacoes}</span>
                                  </div>
                                )}
                              </div>
                            );
                            })}
                            {matchingServicos.map(s => {
                              const isAdm = s.tipoAtendimento === 'Administrativo';
                              const sTeams = getServicoTeams(s);
                              const hasMultipleTeams = sTeams.length > 1;
                              const concluido = isStatusConcluido(s.situacao);
                              return (
                              <div 
                                key={s.firebaseId || s.id} 
                                onClick={() => setSelectedDetails({ type: 'servico', item: s })}
                                className={`font-bold ${fontConfig.cardPadding} flex flex-col shadow-xs border transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer ${
                                  s.situacao === 'Em Espera'
                                    ? 'bg-slate-50 text-slate-600 border-slate-200'
                                    : concluido
                                    ? (cellColor === '#22c55e' ? 'bg-white/25 text-emerald-950 border-white/35 backdrop-blur-xs' : 'bg-emerald-50/70 text-emerald-900 border-emerald-200')
                                    : isDark 
                                    ? (isAdm ? 'bg-purple-950/70 text-purple-200 border-purple-500/50' : 'bg-white/15 text-white border-white/25 backdrop-blur-xs')
                                    : cellColor === '#eab308'
                                    ? 'bg-white/95 text-amber-950 border-amber-300 shadow-xs'
                                    : isAdm
                                    ? 'bg-purple-50/80 text-purple-950 border-purple-300 ring-1 ring-purple-400/30'
                                    : 'bg-white text-slate-800 border-slate-200/90'
                                }`}
                              >
                                {/* Linha 1: Status & Tags (Admin / Equipes) */}
                                <div className="flex items-center justify-between gap-1 mb-1">
                                  <div className="flex items-center gap-1 min-w-0">
                                    {isAdm ? (
                                      <Briefcase size={11} className={`${isDark && !concluido ? 'text-purple-300' : 'text-purple-600'} shrink-0`} />
                                    ) : (
                                      <Wrench size={11} className={`${isDark && !concluido ? 'text-white/80' : cellColor === '#eab308' ? 'text-amber-800' : 'text-blue-600'} opacity-80 shrink-0`} />
                                    )}
                                    {isAdm && (
                                      <span className="text-[7.5px] font-black uppercase tracking-wider bg-purple-200 text-purple-900 px-1 py-0.2 rounded shrink-0">
                                        ADMIN
                                      </span>
                                    )}
                                    <select
                                      value={concluido ? 'Concluído' : (s.situacao || 'Em Andamento')}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => handleQuickStatusChangeServico(s, e.target.value, e)}
                                      className={`${fontConfig.statusSelect} outline-none cursor-pointer transition-all shadow-2xs ${
                                        concluido
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-extrabold'
                                          : s.situacao === 'Em Espera'
                                          ? 'bg-slate-200 text-slate-700 border-slate-300 font-extrabold'
                                          : s.situacao === 'Pendente'
                                          ? 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold'
                                          : isAdm
                                          ? 'bg-purple-100 text-purple-900 border-purple-300 font-extrabold'
                                          : isDark
                                          ? 'bg-white text-blue-800 border-blue-200 font-extrabold'
                                          : 'bg-blue-100 text-blue-800 border-blue-300 font-extrabold'
                                      }`}
                                      title="Alterar status deste agendamento"
                                    >
                                      <option value="Em Andamento">Em Andamento</option>
                                      <option value="Concluído">Concluído</option>
                                      <option value="Pendente">Pendente</option>
                                      <option value="Em Espera">Em Espera</option>
                                    </select>
                                  </div>
                                  {hasMultipleTeams && (
                                    <span 
                                      className={`text-[8px] font-black uppercase tracking-wider px-1 py-0.2 rounded border shrink-0 ${
                                        cellColor === '#22c55e' || isDark
                                          ? 'bg-white/25 text-emerald-950 border-white/40 font-extrabold'
                                          : cellColor === '#eab308'
                                          ? 'bg-amber-100 text-amber-950 border-amber-300 font-extrabold'
                                          : 'bg-indigo-100/90 text-indigo-900 border-indigo-200'
                                      }`} 
                                      title={`Equipes neste serviço: ${sTeams.join(' + ')}`}
                                    >
                                      +{sTeams.length}eq
                                    </span>
                                  )}
                                </div>

                                {/* Linha 2: Nome do Cliente + Serviço e Pagamento integrados (sem espaço vazio) */}
                                <div className="my-0.5 flex items-center gap-1.5 flex-wrap">
                                  <span 
                                    className={`font-black ${fontConfig.clientName} cursor-pointer transition-colors ${
                                      concluido
                                        ? (cellColor === '#22c55e' ? 'line-through opacity-85 text-emerald-950 font-black' : 'line-through opacity-60 text-slate-500 font-black')
                                        : isDark
                                        ? 'text-white font-black'
                                        : cellColor === '#eab308'
                                        ? 'text-amber-950 font-black'
                                        : (isAdm ? 'hover:text-purple-700 text-purple-950 font-black' : 'hover:text-blue-600 text-slate-900 font-black')
                                    }`}
                                    title={s.cliente}
                                  >
                                    {s.cliente}
                                  </span>

                                  {s.servico && (
                                    <span 
                                      className={`inline-flex items-center gap-1 ${fontConfig.serviceBadge} font-black tracking-wide border shadow-2xs ${
                                        concluido
                                          ? 'bg-emerald-950 text-emerald-100 border-emerald-700/60'
                                          : cellColor === '#3b82f6' // Célula Azul (Em Andamento) => Badge em Amarelo Ouro / Âmbar vibrante
                                          ? 'bg-amber-300 text-amber-950 border-amber-400 font-black shadow-xs ring-1 ring-amber-400/60'
                                          : cellColor === '#eab308' // Célula Amarela (Pendente) => Badge em Índigo / Roxo vibrante
                                          ? 'bg-indigo-900 text-white border-indigo-700 font-black shadow-xs ring-1 ring-indigo-500/40'
                                          : isDark
                                          ? 'bg-amber-300 text-amber-950 border-amber-400 font-black shadow-xs'
                                          : isAdm
                                          ? 'bg-purple-700 text-white border-purple-800 font-black shadow-xs'
                                          : 'bg-indigo-600 text-white border-indigo-700 font-black shadow-xs'
                                      }`}
                                      title={`Serviço: ${s.servico || (isAdm ? 'Atendimento Administrativo' : 'Serviço Técnico')}`}
                                    >
                                      {isAdm ? (
                                        <Briefcase size={9} className="shrink-0 stroke-[2.5]" />
                                      ) : (
                                        <Wrench size={9} className="shrink-0 stroke-[2.5]" />
                                      )}
                                      <span className="truncate max-w-[140px] font-black">
                                        {s.servico || (isAdm ? 'Atend. Administrativo' : 'Serviço')}
                                      </span>
                                    </span>
                                  )}

                                  {s.formaPagamento && (
                                    <span 
                                      className={`inline-flex items-center gap-1 ${fontConfig.serviceBadge} font-black tracking-wide border shadow-2xs ${
                                        concluido
                                          ? 'bg-emerald-950 text-emerald-100 border-emerald-700/60'
                                          : cellColor === '#3b82f6'
                                          ? 'bg-emerald-300 text-emerald-950 border-emerald-400 font-black shadow-xs ring-1 ring-emerald-400/50'
                                          : cellColor === '#eab308'
                                          ? 'bg-emerald-800 text-white border-emerald-700 font-black shadow-xs ring-1 ring-emerald-600/40'
                                          : isDark
                                          ? 'bg-emerald-300 text-emerald-950 border-emerald-400 font-black shadow-xs'
                                          : 'bg-emerald-50 text-emerald-900 border-emerald-300 font-extrabold shadow-2xs'
                                      }`}
                                      title={`Forma de Pagamento: ${s.formaPagamento}${s.situacaoPagamento ? ` (${s.situacaoPagamento})` : ''}`}
                                    >
                                      <CreditCard size={9} className="shrink-0 stroke-[2.5]" />
                                      <span className="truncate max-w-[120px]">{s.formaPagamento}</span>
                                      {s.situacaoPagamento && (
                                        <span className="opacity-80 text-[7px] uppercase font-bold">• {s.situacaoPagamento}</span>
                                      )}
                                    </span>
                                  )}
                                </div>

                                {/* Linha 3: Barra de Ações (Concluir à esquerda, ícones à direita) */}
                                <div className="flex items-center justify-between gap-1 mt-1 pt-1 border-t border-slate-100/30 select-none">
                                  <button 
                                    onClick={(e) => handleQuickStatusChangeServico(s, concluido ? 'Em Andamento' : 'Concluído', e)}
                                    className={`transition-all flex items-center gap-1 shadow-2xs ${fontConfig.concluirBtn} ${
                                      concluido
                                        ? 'text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 font-extrabold'
                                        : isDark
                                        ? 'text-slate-800 bg-white hover:bg-slate-100 border border-white/40 font-extrabold'
                                        : cellColor === '#eab308'
                                        ? 'text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 font-extrabold'
                                        : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 bg-slate-50'
                                    }`}
                                    title={concluido ? 'Agendamento Concluído ✓ (Clique para reabrir)' : 'Marcar como Concluído'}
                                  >
                                    <Check size={fontConfig.checkIconSize} className={concluido ? 'stroke-[3] text-emerald-700' : 'stroke-[2.5]'} />
                                    <span>{concluido ? 'Concluído' : 'Concluir'}</span>
                                  </button>

                                  <div className="flex items-center gap-0.5">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const url = generateServicoGCalUrl(s, fullDate, team.name);
                                        if (url) window.open(url, '_blank');
                                      }}
                                      className={`p-1 rounded transition-colors ${
                                        isDark ? 'text-white/80 hover:text-white hover:bg-white/10' : cellColor === '#22c55e' ? 'text-emerald-900/70 hover:text-emerald-900 hover:bg-emerald-100/50' : cellColor === '#eab308' ? 'text-amber-900/80 hover:text-amber-950 hover:bg-amber-200/50' : (isAdm ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-100/80' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50/80')
                                      }`}
                                      title="Anexar ao Google Agenda"
                                    >
                                      <CalendarClock size={fontConfig.actionIconSize} />
                                    </button>
                                    <button 
                                      onClick={(e) => { 
                                        e.stopPropagation(); 
                                        onEditServico?.(s); 
                                      }}
                                      className={`p-1 rounded transition-colors ${
                                        isDark ? 'text-white/80 hover:text-white hover:bg-white/10' : cellColor === '#22c55e' ? 'text-emerald-900/70 hover:text-emerald-900 hover:bg-emerald-100/50' : cellColor === '#eab308' ? 'text-amber-900/80 hover:text-amber-950 hover:bg-amber-200/50' : (isAdm ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-100/50' : 'text-slate-400 hover:text-blue-700 hover:bg-slate-100/50')
                                      }`}
                                      title="Editar Serviço"
                                    >
                                      <Edit size={fontConfig.actionIconSize} />
                                    </button>
                                    {s.txtFile && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); setViewingTxt(s.txtFile || null); }}
                                        className={`p-1 rounded transition-colors ${
                                          isDark ? 'text-white/80 hover:text-white hover:bg-white/10' : cellColor === '#22c55e' ? 'text-emerald-900/70 hover:text-emerald-900 hover:bg-emerald-100/50' : cellColor === '#eab308' ? 'text-amber-900/80 hover:text-amber-950 hover:bg-amber-200/50' : (isAdm ? 'text-purple-600 hover:text-purple-800 hover:bg-purple-100/50' : 'text-slate-400 hover:text-blue-700 hover:bg-slate-100/50')
                                        }`}
                                        title="Ver TXT"
                                      >
                                        <FileText size={fontConfig.actionIconSize} />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Linha 4: Observações com letra maior e mais legível */}
                                {s.observacao && (
                                  <div 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingObs({
                                        cliente: s.cliente,
                                        tipo: isAdm ? 'Atendimento Administrativo' : 'Agendamento de Serviço',
                                        observacao: s.observacao,
                                        data: s.dataServico ? formatDateBR(s.dataServico) : undefined
                                      });
                                    }}
                                    className={`${fontConfig.obsBox} ${
                                      cellColor === '#22c55e' || isDark
                                        ? 'bg-amber-100 text-amber-950 border-amber-300 font-bold'
                                        : 'bg-amber-100/90 text-amber-950 border-amber-300 font-bold'
                                    } border leading-snug shadow-2xs cursor-pointer hover:bg-amber-200 transition-colors`} 
                                    title={`Observação: ${s.observacao}`}
                                  >
                                    <span className={`bg-amber-300 text-amber-950 ${fontConfig.obsTag} shrink-0 tracking-wider font-black`}>
                                      OBS
                                    </span>
                                    <span className={`line-clamp-2 flex-1 ${fontConfig.obsText}`}>{s.observacao}</span>
                                  </div>
                                )}
                              </div>
                            );
                            })}
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
                                  ...localObras.map(o => o.cliente),
                                  ...localServicos.map(s => s.cliente)
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
              className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-4 py-2.5 bg-[#1e2f3e] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={18} />
                  <h2 className="text-base font-bold">Gerenciar Equipes</h2>
                </div>
                <button onClick={() => setIsTeamModalOpen(false)} className="hover:bg-white/10 p-1 rounded-lg transition-colors">
                  <X size={18} />
                </button>
              </div>
              
              <div className="p-3.5 space-y-3 text-xs">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Nome da equipe..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[#2c7da0] transition-all"
                  />
                  <button 
                    onClick={handleAddTeam}
                    className="bg-[#2c7da0] text-white p-2 rounded-lg hover:bg-[#256a8a] transition-all shadow-xs"
                  >
                    {editingTeam ? <Check size={18} /> : <Plus size={18} />}
                  </button>
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 scrollbar-hide">
                  {teams.map(team => (
                    <div key={team.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 group">
                      <span className="font-bold text-[#1e2f3e] text-xs">{team.name}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setEditingTeam(team); setNewTeamName(team.name); }}
                          className="p-1.5 text-slate-400 hover:text-[#2c7da0] hover:bg-white rounded-md transition-all"
                        >
                          <Edit size={14} />
                        </button>
                        <button 
                          onClick={() => setIsConfirmDeleteOpen({id: team.id, name: team.name})}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-md transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {teams.length === 0 && (
                    <p className="text-center text-slate-400 py-3 italic text-xs">Nenhuma equipe cadastrada.</p>
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
              const sTeams = getServicoTeams(servicoItem);
              const teamsStr = tempTeam || (sTeams.length > 0 ? sTeams.join(' + ') : servicoItem.equipeServico) || '---';
              text = `📋 *DADOS DO AGENDAMENTO (SERVIÇO DE MANUTENÇÃO)*\n\n` +
                     `👤 *Cliente:* ${servicoItem.cliente}\n` +
                     `🔢 *Registro:* #${servicoItem.numeroRegistro}\n` +
                     `📍 *Endereço:* ${servicoItem.local || 'Não informado'}\n` +
                     `💼 *Vendedor:* ${servicoItem.vendedor || '---'}\n` +
                     `🛠️ *Equipe${sTeams.length > 1 ? 's' : ''} Serviço:* ${teamsStr}\n` +
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
                          const nextStatus = isStatusConcluido(item.situacao) ? 'Em Andamento' : 'Concluído';
                          if (isObra) {
                            await handleQuickStatusChangeObra(obraItem!, nextStatus);
                            setSelectedDetails({ type: 'obra', item: { ...obraItem!, situacao: nextStatus as any } });
                          } else {
                            await handleQuickStatusChangeServico(servicoItem!, nextStatus);
                            setSelectedDetails({ type: 'servico', item: { ...servicoItem!, situacao: nextStatus as any } });
                          }
                        }}
                        className={`flex items-center gap-1.5 font-black text-[11px] uppercase tracking-wider px-3.5 py-2 rounded-xl transition-all active:scale-95 shadow-md ${
                          isStatusConcluido(item.situacao)
                            ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200 border border-emerald-300'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-white'
                        }`}
                        title="Atalho: Alternar para Concluído"
                      >
                        <Check size={14} className="stroke-[3]" />
                        {isStatusConcluido(item.situacao) ? 'Concluído ✓' : 'Marcar Concluído'}
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
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isObra ? 'bg-indigo-100 text-indigo-700' : servicoItem?.tipoAtendimento === 'Administrativo' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {isObra ? <Zap size={16} /> : servicoItem?.tipoAtendimento === 'Administrativo' ? <Briefcase size={16} /> : <Wrench size={16} />}
                            </div>
                            <div className="min-w-0">
                              <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Categoria</span>
                              <span className="text-xs font-extrabold text-slate-700 truncate block">
                                {isObra ? 'Instalação Solar' : servicoItem?.tipoAtendimento === 'Administrativo' ? 'Atendimento Administrativo' : 'Atendimento Técnico'}
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
                              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                {getServicoTeams(servicoItem as Servico).length > 1 ? 'Equipes de Escala (Múltiplas)' : 'Equipe de Escala'}
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {tempTeam ? (
                                  <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-xs font-black text-indigo-700">
                                    {tempTeam}
                                  </span>
                                ) : getServicoTeams(servicoItem as Servico).length > 0 ? (
                                  getServicoTeams(servicoItem as Servico).map(t => (
                                    <span key={t} className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-xs font-black text-indigo-700">
                                      {t}
                                    </span>
                                  ))
                                ) : (
                                  <p className="text-xs font-black text-indigo-600">Não programada</p>
                                )}
                              </div>
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

                        <div className="flex flex-wrap justify-between items-center gap-3">
                          <div className="flex-1 min-w-[200px]">
                            <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Forma de Pagamento</span>
                            <div className="flex items-center gap-2">
                              <select
                                value={item.formaPagamento || ''}
                                onChange={async (e) => {
                                  const newPayment = e.target.value;
                                  const targetId = item.firebaseId || (item as any).id;
                                  if (!targetId) return;

                                  if (isObra) {
                                    setLocalObras(prev => prev.map(o => (o.firebaseId === targetId || String(o.id) === String(targetId)) ? { ...o, formaPagamento: newPayment } : o));
                                    setSelectedDetails(prev => prev ? { ...prev, item: { ...prev.item, formaPagamento: newPayment } } : null);
                                    try {
                                      await updateDoc(doc(db, 'obras', targetId), { formaPagamento: newPayment, updatedAt: serverTimestamp() });
                                      addToast(`Forma de pagamento atualizada para "${newPayment}"`);
                                    } catch (err) {
                                      console.error(err);
                                      addToast("Erro ao atualizar forma de pagamento.");
                                    }
                                  } else {
                                    setLocalServicos(prev => prev.map(s => (s.firebaseId === targetId || String(s.id) === String(targetId)) ? { ...s, formaPagamento: newPayment } : s));
                                    setSelectedDetails(prev => prev ? { ...prev, item: { ...prev.item, formaPagamento: newPayment } } : null);
                                    try {
                                      await updateDoc(doc(db, 'servicos', targetId), { formaPagamento: newPayment, updatedAt: serverTimestamp() });
                                      addToast(`Forma de pagamento atualizada para "${newPayment}"`);
                                    } catch (err) {
                                      console.error(err);
                                      addToast("Erro ao atualizar forma de pagamento.");
                                    }
                                  }
                                }}
                                className="text-xs font-black text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer w-full max-w-[240px] shadow-2xs"
                              >
                                <option value="">Selecione a forma de pagamento</option>
                                {['À Vista', 'PIX', 'Financiamento', 'Cartão de Crédito', 'Cartão de Débito', 'Boleto', 'Cheque', 'Outros'].map(p => (
                                  <option key={p} value={p}>{p}</option>
                                ))}
                              </select>
                            </div>
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

                      <div className="space-y-2">
                        <div>
                          <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">
                            Ajustar Data da Execução
                          </label>
                          <input 
                            type="date" 
                            value={tempDate}
                            onChange={(e) => setTempDate(e.target.value)}
                            className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-xs"
                          />
                        </div>

                        <div>
                          <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block mb-0.5">
                            Transferir para Equipe
                          </label>
                          <select 
                            value={tempTeam}
                            onChange={(e) => setTempTeam(e.target.value)}
                            className="w-full text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-xs h-8"
                          >
                            <option value="">Nenhuma equipe</option>
                            {teams.map(t => (
                              <option key={t.id} value={t.name}>{t.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-0.5">
                          <button
                            onClick={handleUpdateSchedule}
                            className="flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10px] uppercase tracking-wider py-1.5 rounded-lg transition-all active:scale-95 shadow-xs"
                          >
                            <Save size={11} />
                            Reagendar
                          </button>
                          <button
                            onClick={handleDuplicateItem}
                            className="flex items-center justify-center gap-1 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[10px] uppercase tracking-wider py-1.5 rounded-lg transition-all active:scale-95 shadow-xs"
                          >
                            <Zap size={11} />
                            Duplicar
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Panel: Observações Destacadas */}
                    {(isObra ? obraItem?.observacoes : servicoItem?.observacao) && (
                      <div 
                        onClick={() => {
                          setViewingObs({
                            cliente: item.cliente,
                            tipo: isObra ? 'Obra' : 'Agendamento de Serviço',
                            observacao: (isObra ? obraItem?.observacoes : servicoItem?.observacao) || '',
                            data: (isObra ? obraItem?.dataObra : servicoItem?.dataServico) ? formatDateBR(isObra ? obraItem!.dataObra : servicoItem!.dataServico) : undefined
                          });
                        }}
                        className="bg-amber-50/90 p-4 rounded-2xl border-2 border-amber-300 shadow-sm space-y-2 cursor-pointer hover:bg-amber-100/90 hover:border-amber-400 transition-all group"
                        title="Clique para abrir apenas a observação com letra maior"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="bg-amber-500 text-white p-1 rounded-lg shadow-xs">
                              <FileText size={14} className="stroke-[2.5]" />
                            </span>
                            <span className="text-[11px] font-black text-amber-900 uppercase tracking-wider">
                              {isObra ? 'Observações da Obra' : 'Observações do Agendamento de Serviço'}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-md group-hover:bg-amber-300 transition-colors">
                            Clique para ampliar
                          </span>
                        </div>
                        <p className="text-xs text-amber-950 font-semibold leading-relaxed bg-white/95 p-3 rounded-xl border border-amber-200/90 whitespace-pre-wrap break-words max-h-[140px] overflow-y-auto shadow-2xs">
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
                      className={`flex items-center gap-1.5 px-4 h-11 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all shadow-md active:scale-95 ${
                        item.situacao === 'Concluído'
                          ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-emerald-200 ring-2 ring-emerald-400'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                      }`}
                      title={item.situacao === 'Concluído' ? 'Agendamento Concluído ✓ (Clique para reabrir)' : 'Atalho: Marcar Agendamento como Concluído'}
                    >
                      <Check size={16} className="stroke-[3]" />
                      <span>{item.situacao === 'Concluído' ? 'Concluído ✓' : 'Atalho: Concluir'}</span>
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
                  const weekObras = localObras.filter(o => o.dataObra && o.dataObra >= weekRange.startStr && o.dataObra <= weekRange.endStr);
                  const weekServicos = localServicos.filter(s => s.dataServico && s.dataServico >= weekRange.startStr && s.dataServico <= weekRange.endStr);

                  const allItems = [
                    ...weekObras.map(o => ({ type: 'obra' as const, item: o, date: o.dataObra, team: o.equipe })),
                    ...weekServicos.map(s => ({ 
                      type: 'servico' as const, 
                      item: s, 
                      date: s.dataServico, 
                      team: getServicoTeams(s).length > 0 ? getServicoTeams(s).join(', ') : (s.equipeServico || 'Sem Equipe')
                    }))
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
                                  isObra 
                                    ? 'bg-indigo-100 text-indigo-700' 
                                    : (item as Servico).tipoAtendimento === 'Administrativo'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-teal-100 text-teal-700'
                                }`}>
                                  {isObra 
                                    ? 'Instalação Solar' 
                                    : (item as Servico).tipoAtendimento === 'Administrativo'
                                    ? 'Atendimento Administrativo'
                                    : 'Serviço Manutenção'}
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

      {/* Observação Ampliada Modal */}
      <ObservacaoModal 
        data={viewingObs} 
        onClose={() => setViewingObs(null)} 
      />
    </div>
  );
}
