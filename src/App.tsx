/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Clipboard,
  ClipboardList, 
  Plus, 
  Trash2, 
  Edit, 
  Check,
  Filter, 
  Download, 
  Upload, 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  Play,
  AlertCircle,
  Search,
  FileText,
  Save,
  X,
  Calendar,
  User as UserIcon,
  MapPin,
  Users,
  DollarSign,
  FileSpreadsheet,
  FileJson,
  Eye,
  LogIn,
  LogOut,
  Settings,
  Wallet,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Printer,
  Activity,
  Cpu,
  Wrench,
  Cloud,
  ChevronLeft,
  Palette,
  Trash,
  ArrowUp,
  ArrowDown,
  Database,
  PlusCircle,
  ShieldCheck,
  Table,
  AlertTriangle,
  Bell,
  Volume2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Obra, Servico, Situacao, Prioridade, Filtros, User, UserRole, Vendedor, Equipe, Inversor, FormaPagamento, TeamMember, Schedule, Lembrete } from './types';
import { auth, db, googleProvider, signInWithPopup, signOut } from './firebase';
import EscalaView from './components/EscalaView';
import PosVendaView from './components/PosVendaView';
import NotebookView from './components/NotebookView';
import MobilePWAInstall from './components/MobilePWAInstall';
import PeriodoRelatorioModal from './components/PeriodoRelatorioModal';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp,
  getDocFromServer,
  getDocs,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

const normalizeDate = (dateInput: any): string => {
  if (!dateInput || dateInput === 'N/A' || dateInput === '---') return '';
  
  // If it's already a JS Date object (from xlsx with cellDates: true)
  if (dateInput instanceof Date) {
    if (!isNaN(dateInput.getTime())) {
      // To avoid timezone shift when converting to ISO, we use local components
      const y = dateInput.getFullYear();
      const m = String(dateInput.getMonth() + 1).padStart(2, '0');
      const d = String(dateInput.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return '';
  }

  // If it's already YYYY-MM-DD
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }

  // Handle DD/MM/YYYY
  if (typeof dateInput === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) {
    const [d, m, y] = dateInput.split('/');
    return `${y}-${m}-${d}`;
  }

  // Handle DD-MM-YYYY
  if (typeof dateInput === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(dateInput)) {
    const [d, m, y] = dateInput.split('-');
    return `${y}-${m}-${d}`;
  }

  // Handle Excel serial dates (if xlsx returns them as numbers)
  if (typeof dateInput === 'number') {
    // Excel base date is Dec 30, 1899
    const date = new Date(Math.round((dateInput - 25569) * 86400 * 1000));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Try standard JS parsing as fallback
  try {
    const d = new Date(dateInput);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch (e) {
    // ignore
  }

  return '';
};

const formatDateBR = (dateStr: string | undefined | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '---';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

const getDayOfWeek = (dateStr: string | undefined | null): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
};

const getDaysDiff = (dateStr: string | undefined | null): number => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return 0;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dateObj.setHours(0, 0, 0, 0);
  const diffTime = Math.abs(today.getTime() - dateObj.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

const USERS: User[] = [
  { id: '1', name: 'Administrador', role: 'Admin' },
  { id: '2', name: 'Gerente', role: 'Manager' },
  { id: '3', name: 'Operador', role: 'Worker' },
];

export default function App() {
  // State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User>(USERS[0]);
  const [activeTab, setActiveTab] = useState<'obras' | 'servicos' | 'escala' | 'posvenda' | 'notebook'>('obras');
  const [obras, setObras] = useState<Obra[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [inversores, setInversores] = useState<Inversor[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<FormaPagamento[]>([]);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPayrollOpen, setIsPayrollOpen] = useState(false);
  const [isServicoFormOpen, setIsServicoFormOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // States for Alarms & Reminders
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [isLembreteModalOpen, setIsLembreteModalOpen] = useState(false);
  const [isLembretesHubOpen, setIsLembretesHubOpen] = useState(false);
  const [lembreteFormData, setLembreteFormData] = useState<Partial<Lembrete>>({
    titulo: '',
    dataAlarme: new Date().toISOString().split('T')[0],
    descricao: '',
    importante: false,
    concluido: false
  });
  const [editingLembreteId, setEditingLembreteId] = useState<string | null>(null);
  const [showLembretesBanner, setShowLembretesBanner] = useState(true);
  const [hasPlayedTodayChime, setHasPlayedTodayChime] = useState(false);
  
  const [obraToDelete, setObraToDelete] = useState<number | null>(null);
  const [servicoToDelete, setServicoToDelete] = useState<number | null>(null);
  const [selectedObra, setSelectedObra] = useState<Obra | null>(null);
  const [selectedServico, setSelectedServico] = useState<any | null>(null);
  const [importText, setImportText] = useState('');
  const parsedPreviewRows = useMemo(() => {
    if (!importText.trim()) return [];
    const lines = importText.trim().split('\n');
    const list: any[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.includes('Situação') || line.includes('Registro') || line.includes('Cliente')) continue;
      
      let cols = line.split('\t');
      if (cols.length <= 1) cols = line.split(';');
      if (cols.length <= 1) cols = line.split(',');
      
      if (activeTab === 'obras') {
        list.push({
          situacao: cols[0] || 'Pendente',
          prioridade: cols[1] || 'Média',
          cliente: cols[2] || 'Importado',
          vendedor: cols[3] || '',
          local: cols[4] || '',
          qtdPlacas: cols[7] || '0',
          dataObra: cols[9] || ''
        });
      } else {
        list.push({
          situacao: cols[0] || 'Pendente',
          prioridade: cols[1] || 'Média',
          dataAtendimento: cols[2] || '',
          cliente: cols[3] || 'Importado',
          local: cols[4] || '',
          servico: cols[7] || '',
          valor: cols[8] || '0'
        });
      }
      if (list.length >= 8) break; // limit to 8 rows for preview
    }
    return list;
  }, [importText, activeTab]);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoServicoId, setEditandoServicoId] = useState<number | null>(null);
  const [editingPayment, setEditingPayment] = useState<{ id: string; type: 'obra' | 'servico' } | null>(null);
  const [viewingTxt, setViewingTxt] = useState<{name: string, content: string} | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({
    situacao: '',
    prioridade: '',
    cliente: '',
    vendedor: '',
    equipe: ''
  });
  const [filtrosArquivados, setFiltrosArquivados] = useState({
    cliente: '',
    vendedor: ''
  });
  const [showArchivedServicos, setShowArchivedServicos] = useState(false);
  const [showArchivedObras, setShowArchivedObras] = useState(false);
  const [isSelectPeriodModalOpen, setIsSelectPeriodModalOpen] = useState(false);
  const [hideScheduledObras, setHideScheduledObras] = useState(false);
  const [hideUnscheduledObras, setHideUnscheduledObras] = useState(false);
  const [hideScheduledServicos, setHideScheduledServicos] = useState(false);
  const [hideUnscheduledServicos, setHideUnscheduledServicos] = useState(false);

  const [sortConfig, setSortConfig] = useState<{ key: keyof Obra; direction: 'asc' | 'desc' }>({
    key: 'id',
    direction: 'asc'
  });

  const [sortConfigServicos, setSortConfigServicos] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'id',
    direction: 'asc'
  });

  const handleSort = (key: keyof Obra) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSortServicos = (key: string) => {
    setSortConfigServicos(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Form State
  const [formData, setFormData] = useState<Partial<Obra>>({
    situacao: 'Pendente',
    prioridade: 'Média',
    cliente: '',
    vendedor: '',
    local: '',
    dataChegadaPlacas: '',
    dataContrato: new Date().toISOString().split('T')[0],
    quantidadePlacas: 0,
    valorMaoObra: 60,
    dataObra: '',
    dataConclusao: '',
    equipe: '',
    inversor: '',
    formaPagamento: '',
    situacaoPagamento: '',
    observacoes: '',
    txtFile: undefined
  });

  const [servicoFormData, setServicoFormData] = useState<Partial<any>>({
    situacao: 'Pendente',
    prioridade: 'Média',
    cliente: '',
    vendedor: '',
    local: '',
    dataAtendimento: new Date().toISOString().split('T')[0],
    equipeServico: '',
    servico: '',
    valor: 0,
    equipeInstalou: '',
    dataServico: '',
    formaPagamento: '',
    situacaoPagamento: '',
    observacao: ''
  });

  const [equipeOutros, setEquipeOutros] = useState('');
  const [equipeServicoOutros, setEquipeServicoOutros] = useState('');
  const [equipeInstalouOutros, setEquipeInstalouOutros] = useState('');
  const [valorMaoObraOutros, setValorMaoObraOutros] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States for inline spreadsheet editing
  const [editingCell, setEditingCell] = useState<{ id: number; field: string; type: 'obra' | 'servico' } | null>(null);
  const [tempDate, setTempDate] = useState<string>('');

  const renderEditableCell = (
    id: number,
    field: string,
    type: 'obra' | 'servico',
    currentValue: string,
    cellType: 'vendedor' | 'equipe' | 'date',
    displayValue?: React.ReactNode
  ) => {
    const isEditing = editingCell?.id === id && editingCell?.field === field && editingCell?.type === type;

    if (isEditing) {
      if (cellType === 'vendedor') {
        const filteredVendedores = vendedores.filter(v => v.ativo);
        if (currentValue && !filteredVendedores.some(v => v.nome === currentValue)) {
          filteredVendedores.push({ id: 'current', nome: currentValue, ativo: true } as any);
        }
        return (
          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
            <select
              autoFocus
              value={currentValue || ''}
              onBlur={() => setEditingCell(null)}
              onChange={(e) => {
                const val = e.target.value;
                if (type === 'obra') {
                  updateObraQuick(id, field as any, val);
                } else {
                  updateServicoQuick(id, field, val);
                }
                setEditingCell(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] bg-white border border-indigo-400 rounded-lg px-2 py-1 outline-none font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Selecione</option>
              {filteredVendedores.map(v => (
                <option key={v.id} value={v.nome}>{v.nome}</option>
              ))}
            </select>
          </td>
        );
      } else if (cellType === 'equipe') {
        const filteredEquipes = equipes.filter(eq => eq.ativo);
        if (currentValue && !filteredEquipes.some(eq => eq.nome === currentValue)) {
          filteredEquipes.push({ id: 'current', nome: currentValue, ativo: true } as any);
        }
        return (
          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
            <select
              autoFocus
              value={currentValue || ''}
              onBlur={() => setEditingCell(null)}
              onChange={(e) => {
                const val = e.target.value;
                if (type === 'obra') {
                  updateObraQuick(id, field as any, val);
                } else {
                  updateServicoQuick(id, field, val);
                }
                setEditingCell(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] bg-white border border-indigo-400 rounded-lg px-2 py-1 outline-none font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Selecione</option>
              {filteredEquipes.map(eq => (
                <option key={eq.id} value={eq.nome}>{eq.nome}</option>
              ))}
            </select>
          </td>
        );
      } else if (cellType === 'date') {
        return (
          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1">
              <input
                type="date"
                autoFocus
                value={tempDate}
                onChange={(e) => setTempDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (type === 'obra') {
                      updateObraQuick(id, field as any, tempDate);
                    } else {
                      updateServicoQuick(id, field, tempDate);
                    }
                    setEditingCell(null);
                  } else if (e.key === 'Escape') {
                    setEditingCell(null);
                  }
                }}
                className="text-[10px] bg-white border border-indigo-400 rounded-lg px-2 py-1 outline-none font-bold text-slate-800 max-w-[110px]"
              />
              <button
                type="button"
                onClick={() => {
                  if (type === 'obra') {
                    updateObraQuick(id, field as any, tempDate);
                  } else {
                    updateServicoQuick(id, field, tempDate);
                  }
                  setEditingCell(null);
                }}
                className="p-1 text-emerald-600 hover:text-emerald-800 bg-emerald-50 rounded"
                title="Salvar"
              >
                <Check size={10} />
              </button>
            </div>
          </td>
        );
      }
    }

    const textValue = currentValue || '---';
    const displayElement = displayValue || (
      <span className="text-[10px] font-semibold text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-1 group-hover/cell:border-slate-200">
        {textValue}
        <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 transition-opacity whitespace-nowrap text-indigo-500" />
      </span>
    );

    return (
      <td
        className="px-3 py-3 group/cell"
        onClick={(e) => {
          e.stopPropagation();
          setEditingCell({ id, field, type });
          if (cellType === 'date') {
            setTempDate(currentValue || '');
          }
        }}
      >
        {displayElement}
      </td>
    );
  };

  // States for client autocomplete from existing Obras
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const matchingObras = useMemo(() => {
    const term = (servicoFormData.cliente || '').trim().toLowerCase();
    if (!term) {
      // If no input, return last 10 obras for quick select
      return obras.slice(-10).reverse();
    }
    return obras.filter(obra => 
      obra.cliente?.toLowerCase().includes(term) ||
      obra.numeroRegistro?.toLowerCase().includes(term) ||
      obra.local?.toLowerCase().includes(term)
    ).slice(0, 15);
  }, [obras, servicoFormData.cliente]);

  const selectObraForServico = (obra: Obra) => {
    setServicoFormData(prev => ({
      ...prev,
      cliente: obra.cliente || '',
      local: obra.local || '',
      vendedor: obra.vendedor || '',
      formaPagamento: obra.formaPagamento || '',
      situacaoPagamento: obra.situacaoPagamento || ''
    }));
    setShowClientSuggestions(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowClientSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
      if (user) {
        // Default role for authenticated users if not already set
        // In a real app, you'd fetch this from a 'users' collection
        if (user.email === 'jouguemoto@gmail.com') {
          setCurrentUser({ id: user.uid, name: user.displayName || 'Admin', role: 'Admin' });
        } else {
          setCurrentUser({ id: user.uid, name: user.displayName || 'User', role: 'Worker' });
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    if (isAuthReady) testConnection();
  }, [isAuthReady]);

  // Firestore Listener
  useEffect(() => {
    if (!isAuthReady || !user) {
      setObras([]);
      return;
    }

    const q = query(collection(db, 'obras'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const obrasData = snapshot.docs.map(doc => ({
        ...doc.data(),
        firebaseId: doc.id, // Store doc ID for updates/deletes
      })) as any[];
      setObras(obrasData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'obras');
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // Firestore Listener for Servicos
  useEffect(() => {
    if (!isAuthReady || !user) {
      setServicos([]);
      return;
    }

    const q = query(collection(db, 'servicos'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const servicosData = snapshot.docs.map(doc => ({
        ...doc.data(),
        firebaseId: doc.id,
      })) as any[];
      setServicos(servicosData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'servicos');
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // Firestore Listener for Lembretes
  useEffect(() => {
    if (!isAuthReady || !user) {
      setLembretes([]);
      return;
    }

    const q = query(collection(db, 'lembretes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lembretesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lembrete[];
      setLembretes(lembretesData);
    }, (error) => {
      console.error("Erro ao escutar lembretes: ", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // Listeners for Config Collections
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const unsubVendedores = onSnapshot(collection(db, 'vendedores'), (snapshot) => {
      setVendedores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendedor)));
    });

    const unsubEquipes = onSnapshot(collection(db, 'equipes'), (snapshot) => {
      setEquipes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Equipe)));
    });

    const unsubInversores = onSnapshot(collection(db, 'inversores'), (snapshot) => {
      setInversores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inversor)));
    });

    const unsubFormasPagamento = onSnapshot(collection(db, 'formasPagamento'), (snapshot) => {
      setFormasPagamento(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FormaPagamento)));
    });

    return () => {
      unsubVendedores();
      unsubEquipes();
      unsubInversores();
      unsubFormasPagamento();
    };
  }, [isAuthReady, user]);

  // Derived Values
  const stats = useMemo(() => {
    const total = obras.length;
    const ativas = obras.filter(o => o.situacao === 'Em Andamento' || o.situacao === 'Pendente').length;
    const emEspera = obras.filter(o => o.situacao === 'Em Espera').length;
    const concluidas = obras.filter(o => o.situacao === 'Concluído').length;
    const valorTotal = obras.reduce((sum, o) => sum + o.valorReceber, 0);
    return { total, ativas, concluidas, emEspera, valorTotal };
  }, [obras]);

  const filteredObras = useMemo(() => {
    return obras.filter(obra => {
      if (filtros.situacao && obra.situacao !== filtros.situacao) return false;
      if (filtros.prioridade && obra.prioridade !== filtros.prioridade) return false;
      if (filtros.cliente && !obra.cliente.toLowerCase().includes(filtros.cliente.toLowerCase())) return false;
      if (filtros.vendedor && !obra.vendedor.toLowerCase().includes(filtros.vendedor.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA = a[key] ?? '';
      let valB = b[key] ?? '';

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [obras, filtros, sortConfig]);

  const activeObras = useMemo(() => filteredObras.filter(o => o.situacao !== 'Concluído'), [filteredObras]);
  const scheduledObras = useMemo(() => {
    if (hideScheduledObras) return [];
    return activeObras.filter(o => o.dataObra && o.dataObra !== '');
  }, [activeObras, hideScheduledObras]);

  const unscheduledObras = useMemo(() => {
    if (hideUnscheduledObras) return [];
    return activeObras.filter(o => !o.dataObra || o.dataObra === '');
  }, [activeObras, hideUnscheduledObras]);
  
  const archivedObras = useMemo(() => {
    return obras.filter(o => {
      if (o.situacao !== 'Concluído') return false;
      if (filtrosArquivados.cliente && !o.cliente.toLowerCase().includes(filtrosArquivados.cliente.toLowerCase())) return false;
      if (filtrosArquivados.vendedor && !o.vendedor.toLowerCase().includes(filtrosArquivados.vendedor.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      const { key, direction } = sortConfig;
      let valA = a[key] ?? '';
      let valB = b[key] ?? '';

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [obras, filtrosArquivados, sortConfig]);

  const filteredServicos = useMemo(() => {
    return servicos.filter(servico => {
      if (filtros.situacao && servico.situacao !== filtros.situacao) return false;
      if (filtros.prioridade && servico.prioridade !== filtros.prioridade) return false;
      if (filtros.cliente && !servico.cliente.toLowerCase().includes(filtros.cliente.toLowerCase())) return false;
      if (filtros.vendedor && !servico.vendedor.toLowerCase().includes(filtros.vendedor.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      const { key, direction } = sortConfigServicos;
      let valA = a[key] ?? '';
      let valB = b[key] ?? '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [servicos, filtros, sortConfigServicos]);

  const activeServicos = useMemo(() => {
    return filteredServicos
      .filter(s => s.situacao !== 'Concluído');
  }, [filteredServicos]);

  const scheduledServicosList = useMemo(() => {
    if (hideScheduledServicos) return [];
    return activeServicos.filter(s => s.dataServico && s.dataServico !== '');
  }, [activeServicos, hideScheduledServicos]);

  const unscheduledServicosList = useMemo(() => {
    if (hideUnscheduledServicos) return [];
    return activeServicos.filter(s => !s.dataServico || s.dataServico === '');
  }, [activeServicos, hideUnscheduledServicos]);

  const inProgressServicos = useMemo(() => {
    return activeServicos.filter(s => s.situacao === 'Em Andamento');
  }, [activeServicos]);

  const pendingServicos = useMemo(() => {
    return activeServicos.filter(s => s.situacao === 'Pendente');
  }, [activeServicos]);
  
  const archivedServicos = useMemo(() => {
    return servicos.filter(s => {
      if (s.situacao !== 'Concluído') return false;
      if (filtrosArquivados.cliente && !s.cliente.toLowerCase().includes(filtrosArquivados.cliente.toLowerCase())) return false;
      if (filtrosArquivados.vendedor && !s.vendedor.toLowerCase().includes(filtrosArquivados.vendedor.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      const { key, direction } = sortConfigServicos;
      let valA = a[key as keyof Servico] ?? '';
      let valB = b[key as keyof Servico] ?? '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [servicos, filtrosArquivados, sortConfigServicos]);

  // Alarms and Reminders logic
  const localTodayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const alarmesDeHoje = useMemo(() => {
    // 1. General custom alerts for today
    const listLembretes = lembretes
      .filter(l => l.dataAlarme === localTodayStr && !l.concluido)
      .map(l => ({
        id: l.id || '',
        tipo: 'lembrete' as const,
        titulo: l.titulo,
        descricao: l.descricao,
        importante: l.importante,
        itemOriginal: l
      }));

    return listLembretes;
  }, [lembretes, localTodayStr]);

  const playAlarmChime = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioCtx = new AudioContextClass();
      
      const playTone = (freq: number, startTime: number, duration: number) => {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.frequency.setValueAtTime(freq, startTime);
        osc.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = audioCtx.currentTime;
      playTone(659.25, now, 0.6); // E5
      playTone(880.00, now + 0.25, 0.8); // A5
    } catch (e) {
      console.warn("AudioContext playback blocked or failed:", e);
    }
  };

  useEffect(() => {
    if (alarmesDeHoje.length > 0 && !hasPlayedTodayChime) {
      playAlarmChime();
      setHasPlayedTodayChime(true);
    }
  }, [alarmesDeHoje, hasPlayedTodayChime]);

  const handleSaveLembrete = async () => {
    if (!lembreteFormData.titulo) {
      alert("Por favor, preencha o campo de lembrete!");
      return;
    }

    const item = {
      titulo: lembreteFormData.titulo,
      dataAlarme: lembreteFormData.dataAlarme || localTodayStr,
      descricao: lembreteFormData.descricao || '',
      importante: !!lembreteFormData.importante,
      concluido: !!lembreteFormData.concluido,
      createdAt: serverTimestamp(),
      createdBy: user?.uid || ''
    };

    try {
      if (editingLembreteId) {
        await updateDoc(doc(db, 'lembretes', editingLembreteId), item);
      } else {
        await addDoc(collection(db, 'lembretes'), item);
      }
      setIsLembreteModalOpen(false);
      setEditingLembreteId(null);
      setLembreteFormData({
        titulo: '',
        dataAlarme: localTodayStr,
        descricao: '',
        importante: false,
        concluido: false
      });
    } catch (error) {
      console.error("Erro ao salvar lembrete: ", error);
    }
  };

  const handleDeleteLembrete = async (id: string) => {
    if (confirm("Tem certeza que quer excluir este lembrete/alarme?")) {
      try {
        await deleteDoc(doc(db, 'lembretes', id));
      } catch (error) {
        console.error("Erro ao excluir lembrete: ", error);
      }
    }
  };

  const handleToggleLembreteConcluido = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'lembretes', id), {
        concluido: !currentStatus
      });
    } catch (e) {
      console.error("Erro ao alternar conclusao: ", e);
    }
  };

  const valorReceberCalculado = useMemo(() => {
    const valorUnitario = formData.valorMaoObra === 0 ? parseFloat(valorMaoObraOutros) || 0 : formData.valorMaoObra || 0;
    return (formData.quantidadePlacas || 0) * valorUnitario;
  }, [formData.quantidadePlacas, formData.valorMaoObra, valorMaoObraOutros]);

  const diasCorridos = useMemo(() => {
    return getDaysDiff(formData.dataContrato);
  }, [formData.dataContrato]);

  const diasCorridosServico = useMemo(() => {
    return getDaysDiff(servicoFormData.dataAtendimento);
  }, [servicoFormData.dataAtendimento]);

  // Permissions Helpers
  const canCreate = currentUser.role === 'Admin' || currentUser.role === 'Manager';
  const canDelete = currentUser.role === 'Admin';
  const canImport = currentUser.role === 'Admin';
  const canExport = currentUser.role === 'Admin' || currentUser.role === 'Manager';
  const canEditAllFields = currentUser.role === 'Admin' || currentUser.role === 'Manager';
  const canEditStatusAndObs = true; // Everyone can edit these if they can edit at all

  // Selection Handlers
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (items: { id: number }[]) => {
    const allIds = items.map(o => o.id);
    const areAllSelected = allIds.every(id => selectedIds.has(id));
    
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (areAllSelected) {
        allIds.forEach(id => next.delete(id));
      } else {
        allIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const bulkDelete = () => {
    if (!canDelete || selectedIds.size === 0) return;
    setIsBulkDeleteMode(true);
    setIsDeleteModalOpen(true);
  };

  const syncToWeeklySchedule = async (dateStr: string, teamName: string, clientName: string, extraInfo?: string) => {
    if (!dateStr || !teamName || !clientName) return;

    try {
      const teamsSnapshot = await getDocs(collection(db, 'teams'));
      let teamDoc = teamsSnapshot.docs.find(doc => 
        doc.data().name.trim().toLowerCase() === teamName.trim().toLowerCase()
      );
      
      if (!teamDoc) {
        // Auto-create team if it doesn't exist in the schedule view
        await addDoc(collection(db, 'teams'), { 
          name: teamName.trim(),
          createdAt: serverTimestamp(),
          order: teamsSnapshot.docs.length // Put at the end
        });
        console.log(`Equipe "${teamName}" criada automaticamente na escala.`);
      }

      // REMOVED: Redundant text sync logic. 
      // EscalaView now uses automatic cards which is much cleaner and avoids duplication.
    } catch (error) {
      console.error("Error syncing to weekly schedule:", error);
    }
  };

  const bulkUpdateStatus = async (newStatus: Situacao) => {
    const idsToUpdate = Array.from(selectedIds);
    try {
      for (const id of idsToUpdate) {
        const obra = obras.find(o => o.id === id);
        if (obra?.firebaseId) {
          const updateData: any = { situacao: newStatus };
          if (newStatus === 'Concluído') {
            updateData.dataConclusao = new Date().toISOString().split('T')[0];
          }
          await updateDoc(doc(db, 'obras', obra.firebaseId), updateData);
        }
      }
      setSelectedIds(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'obras');
    }
  };

  const bulkExportXLS = () => {
    const selectedObras = obras.filter(o => selectedIds.has(o.id));
    const data = selectedObras.map(o => ({
      'Registro': o.numeroRegistro,
      'Situação': o.situacao,
      'Prioridade': o.prioridade,
      'Cliente': o.cliente,
      'Vendedor': o.vendedor,
      'Local': o.local,
      'Data Contrato': o.dataContrato,
      'Chegada Placas': o.dataChegadaPlacas,
      'Qtd Placas': o.quantidadePlacas,
      'Vlr Mão Obra': o.valorMaoObra,
      'Total': o.valorReceber,
      'Data Obra': o.dataObra,
      'Data Conclusão': o.dataConclusao,
      'Equipe': o.equipe,
      'Inversor': o.inversor,
      'Forma Pagamento': o.formaPagamento,
      'Observações': o.observacoes
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Obras Selecionadas");
    XLSX.writeFile(wb, `Obras_Selecionadas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const bulkExportPDF = () => {
    const selectedObras = obras.filter(o => selectedIds.has(o.id));
    if (selectedObras.length === 0) return;

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header - CBC Energias Renováveis
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, pageWidth, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("CBC ENERGIAS RENOVÁVEIS - RELATÓRIO DE OBRAS", 14, 16);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 16, { align: 'right' });

    const tableColumn = ["Reg", "Situação", "Cliente", "Vendedor", "Local", "Equipe", "Data Obra", "Valor"];
    const tableRows: any[] = [];

    selectedObras.forEach(o => {
      const obraData = [
        o.numeroRegistro,
        o.situacao,
        o.cliente,
        o.vendedor,
        o.local,
        o.equipe,
        formatDateBR(o.dataObra),
        `R$ ${o.valorReceber.toLocaleString('pt-BR')}`
      ];
      tableRows.push(obraData);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      theme: 'striped',
      headStyles: { fillColor: [14, 165, 233] },
      styles: { fontSize: 8 }
    });

    doc.save(`Relatorio_Obras_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTxtFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
      alert('Por favor, selecione um arquivo .txt');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFormData(prev => ({
        ...prev,
        txtFile: {
          name: file.name,
          content: content
        }
      }));
    };
    reader.readAsText(file);
  };

  const handleServicoInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setServicoFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const valorMaoObraFinal = formData.valorMaoObra === 0 ? parseFloat(valorMaoObraOutros) || 0 : formData.valorMaoObra || 0;
    
    const finalEquipe = formData.equipe === 'Outros' ? equipeOutros : formData.equipe;
    const obraData = {
      numeroRegistro: editandoId 
        ? obras.find(o => o.id === editandoId)?.numeroRegistro || String(Date.now()).slice(-3)
        : String(obras.length + 1).padStart(3, '0'),
      situacao: formData.situacao as Situacao,
      prioridade: formData.prioridade as Prioridade,
      cliente: formData.cliente || '',
      vendedor: formData.vendedor || '',
      local: formData.local || '',
      dataChegadaPlacas: formData.dataChegadaPlacas || '',
      dataContrato: formData.dataContrato || '',
      quantidadePlacas: Number(formData.quantidadePlacas) || 0,
      valorMaoObra: valorMaoObraFinal,
      valorReceber: valorReceberCalculado,
      dataObra: formData.dataObra || '',
      dataConclusao: (formData.situacao === 'Concluído' && !formData.dataConclusao) 
        ? new Date().toISOString().split('T')[0] 
        : (formData.dataConclusao || ''),
      equipe: finalEquipe || '',
      inversor: formData.inversor || '',
      formaPagamento: formData.formaPagamento || '',
      situacaoPagamento: formData.situacaoPagamento || '',
      observacoes: formData.observacoes || '',
      txtFile: formData.txtFile || null,
      updatedAt: serverTimestamp(),
    };

    try {
      if (editandoId) {
        const obraToUpdate = obras.find(o => o.id === editandoId);
        if (obraToUpdate?.firebaseId) {
          await updateDoc(doc(db, 'obras', obraToUpdate.firebaseId), obraData);
        }
      } else {
        await addDoc(collection(db, 'obras'), {
          ...obraData,
          id: Date.now(),
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      if (obraData.dataObra && obraData.equipe) {
        await syncToWeeklySchedule(obraData.dataObra, obraData.equipe, obraData.cliente, 'Obra');
      }
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'obras');
    }
  };

  const handleServicoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const finalEquipeServico = servicoFormData.equipeServico === 'Outros' ? equipeServicoOutros : servicoFormData.equipeServico;
    const finalEquipeInstalou = servicoFormData.equipeInstalou === 'Outros' ? equipeInstalouOutros : servicoFormData.equipeInstalou;
    const servicoData = {
      numeroRegistro: editandoServicoId 
        ? servicos.find(s => s.id === editandoServicoId)?.numeroRegistro || String(Date.now()).slice(-3)
        : String(servicos.length + 1).padStart(3, '0'),
      situacao: servicoFormData.situacao as Situacao,
      prioridade: servicoFormData.prioridade as Prioridade,
      cliente: servicoFormData.cliente || '',
      vendedor: servicoFormData.vendedor || '',
      local: servicoFormData.local || '',
      dataAtendimento: servicoFormData.dataAtendimento || '',
      equipeServico: finalEquipeServico || '',
      servico: servicoFormData.servico || '',
      valor: Number(servicoFormData.valor) || 0,
      equipeInstalou: finalEquipeInstalou || '',
      dataServico: servicoFormData.dataServico || '',
      formaPagamento: servicoFormData.formaPagamento || '',
      situacaoPagamento: servicoFormData.situacaoPagamento || '',
      observacao: servicoFormData.observacao || '',
      updatedAt: serverTimestamp(),
    };

    try {
      if (editandoServicoId) {
        const servicoToUpdate = servicos.find(s => s.id === editandoServicoId);
        if (servicoToUpdate?.firebaseId) {
          await updateDoc(doc(db, 'servicos', servicoToUpdate.firebaseId), servicoData);
        }
      } else {
        await addDoc(collection(db, 'servicos'), {
          ...servicoData,
          id: Date.now(),
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }
      const teamToSync = servicoData.equipeServico || servicoData.equipeInstalou;
      if (servicoData.dataServico && teamToSync) {
        await syncToWeeklySchedule(servicoData.dataServico, teamToSync, servicoData.cliente, servicoData.servico);
      }
      resetServicoForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'servicos');
    }
  };

  // Config Handlers
  const handleSaveConfig = async (collectionName: string, data: any, id?: string) => {
    try {
      if (id) {
        await updateDoc(doc(db, collectionName, id), data);
      } else {
        await addDoc(collection(db, collectionName), { ...data, createdAt: serverTimestamp() });
      }
    } catch (error) {
      handleFirestoreError(error, id ? OperationType.UPDATE : OperationType.CREATE, collectionName);
    }
  };

  const handleDeleteConfig = async (collectionName: string, id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este item?')) return;
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, collectionName);
    }
  };

  const resetForm = () => {
    setFormData({
      situacao: 'Pendente',
      prioridade: 'Média',
      cliente: '',
      vendedor: '',
      local: '',
      dataChegadaPlacas: '',
      dataContrato: new Date().toISOString().split('T')[0],
      quantidadePlacas: 0,
      valorMaoObra: 60,
      dataObra: '',
      dataConclusao: '',
      equipe: '',
      inversor: '',
      formaPagamento: '',
      situacaoPagamento: '',
      observacoes: '',
      txtFile: undefined
    });
    setValorMaoObraOutros('');
    setEquipeOutros('');
    setEditandoId(null);
    setIsFormOpen(false);
  };

  const resetServicoForm = () => {
    setServicoFormData({
      situacao: 'Pendente',
      prioridade: 'Média',
      cliente: '',
      vendedor: '',
      local: '',
      dataAtendimento: new Date().toISOString().split('T')[0],
      equipeServico: '',
      servico: '',
      valor: 0,
      equipeInstalou: '',
      dataServico: '',
      formaPagamento: '',
      situacaoPagamento: '',
      observacao: ''
    });
    setEquipeServicoOutros('');
    setEquipeInstalouOutros('');
    setEditandoServicoId(null);
    setIsServicoFormOpen(false);
  };

  const handleEdit = (obra: Obra) => {
    setFormData({
      ...obra
    });
    
    // Check if equipe exists in the list
    const equipeExists = equipes.some(e => e.nome === obra.equipe);
    if (obra.equipe && !equipeExists) {
      setFormData(prev => ({ ...prev, equipe: 'Outros' }));
      setEquipeOutros(obra.equipe);
    } else {
      setEquipeOutros('');
    }

    if (![60, 70, 80, 100].includes(obra.valorMaoObra)) {
      setFormData(prev => ({ ...prev, valorMaoObra: 0 }));
      setValorMaoObraOutros(String(obra.valorMaoObra));
    }
    setEditandoId(obra.id);
    setIsFormOpen(true);
  };

  const handleServicoEdit = (servico: any) => {
    setServicoFormData({
      ...servico
    });

    const equipeServicoExists = equipes.some(e => e.nome === servico.equipeServico);
    if (servico.equipeServico && !equipeServicoExists) {
      setServicoFormData(prev => ({ ...prev, equipeServico: 'Outros' }));
      setEquipeServicoOutros(servico.equipeServico);
    } else {
      setEquipeServicoOutros('');
    }

    const equipeInstalouExists = equipes.some(e => e.nome === servico.equipeInstalou);
    if (servico.equipeInstalou && !equipeInstalouExists) {
      setServicoFormData(prev => ({ ...prev, equipeInstalou: 'Outros' }));
      setEquipeInstalouOutros(servico.equipeInstalou);
    } else {
      setEquipeInstalouOutros('');
    }

    setEditandoServicoId(servico.id);
    setIsServicoFormOpen(true);
  };

  const handleDelete = (id: number) => {
    setObraToDelete(id);
    setIsBulkDeleteMode(false);
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setIsDeleteModalOpen(false);
    setIsBulkDeleteMode(false);
    setObraToDelete(null);
    setServicoToDelete(null);
  };

  const confirmDelete = async () => {
    if (isBulkDeleteMode) {
      const idsToDelete = Array.from(selectedIds);
      try {
        const collectionName = activeTab === 'obras' ? 'obras' : 'servicos';
        const dataList = activeTab === 'obras' ? obras : servicos;
        
        for (const id of idsToDelete) {
          const item = dataList.find(o => o.id === id);
          if (item?.firebaseId) {
            await deleteDoc(doc(db, collectionName, item.firebaseId));
          }
        }
        setSelectedIds(new Set());
        closeDeleteModal();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, activeTab);
      }
      return;
    }

    if (obraToDelete) {
      const obraDoc = obras.find(o => o.id === obraToDelete);
      if (obraDoc?.firebaseId) {
        try {
          await deleteDoc(doc(db, 'obras', obraDoc.firebaseId));
          closeDeleteModal();
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `obras/${obraDoc.firebaseId}`);
        }
      } else {
        setObras(prev => prev.filter(o => o.id !== obraToDelete));
        closeDeleteModal();
      }
    } else if (servicoToDelete) {
      const servicoDoc = servicos.find(s => s.id === servicoToDelete);
      if (servicoDoc?.firebaseId) {
        try {
          await deleteDoc(doc(db, 'servicos', servicoDoc.firebaseId));
          closeDeleteModal();
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `servicos/${servicoDoc.firebaseId}`);
        }
      } else {
        setServicos(prev => prev.filter(s => s.id !== servicoToDelete));
        closeDeleteModal();
      }
    }
  };

  const updateObraQuick = async (id: number, field: keyof Obra, value: any) => {
    const obraToUpdate = obras.find(o => o.id === id);
    if (!obraToUpdate?.firebaseId) return;

    const updatedData: any = { [field]: value, updatedAt: serverTimestamp() };
    
    if (field === 'situacao' && value === 'Concluído') {
      updatedData.dataConclusao = new Date().toISOString().split('T')[0];
    }

    try {
      await updateDoc(doc(db, 'obras', obraToUpdate.firebaseId), updatedData);
      
      // Sync to schedule if date or team changed
      const finalDatePrev = field === 'dataObra' ? value : obraToUpdate.dataObra;
      const finalTeam = field === 'equipe' ? value : obraToUpdate.equipe;
      if (finalDatePrev && finalTeam) {
        await syncToWeeklySchedule(finalDatePrev, finalTeam, obraToUpdate.cliente);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `obras/${obraToUpdate.firebaseId}`);
    }
  };

  const updateServicoQuick = async (id: number, field: string, value: any) => {
    const servicoToUpdate = servicos.find(s => s.id === id);
    if (!servicoToUpdate?.firebaseId) return;

    const updatedData: any = { [field]: value, updatedAt: serverTimestamp() };

    try {
      await updateDoc(doc(db, 'servicos', servicoToUpdate.firebaseId), updatedData);
      
      // Sync to schedule if date or team changed
      const finalDateServ = field === 'dataServico' ? value : servicoToUpdate.dataServico;
      const finalTeamInst = field === 'equipeInstalou' ? value : servicoToUpdate.equipeInstalou;
      if (finalDateServ && finalTeamInst) {
        await syncToWeeklySchedule(finalDateServ, finalTeamInst, servicoToUpdate.cliente);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `servicos/${servicoToUpdate.firebaseId}`);
    }
  };

  const exportarTXT = () => {
    let texto = "SISTEMA DE GESTÃO DE OBRAS\n";
    texto += "=".repeat(50) + "\n\n";
    
    const ativos = obras.filter(o => o.situacao !== 'Concluído');
    texto += `REGISTROS ATIVOS (${ativos.length}):\n`;
    texto += "-".repeat(50) + "\n";
    ativos.forEach(o => {
      texto += `[${o.numeroRegistro}] ${o.cliente} | ${o.prioridade} | ${o.situacao} | R$ ${o.valorReceber.toLocaleString('pt-BR')}\n`;
    });
    
    const concluidas = obras.filter(o => o.situacao === 'Concluído');
    texto += `\nREGISTROS CONCLUÍDOS (${concluidas.length}):\n`;
    texto += "-".repeat(50) + "\n";
    concluidas.forEach(o => {
      texto += `[${o.numeroRegistro}] ${o.cliente} | Concluído em: ${o.dataConclusao}\n`;
    });
    
    const blob = new Blob([texto], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_obras_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
  };

  const imprimirRelatorioConcluidos = (startDate?: string, endDate?: string) => {
    let concluidas = obras.filter(o => o.situacao === 'Concluído');
    
    if (startDate) {
      concluidas = concluidas.filter(o => {
        const d = o.dataConclusao || o.dataObra;
        return d && d >= startDate;
      });
    }
    if (endDate) {
      concluidas = concluidas.filter(o => {
        const d = o.dataConclusao || o.dataObra;
        return d && d <= endDate;
      });
    }

    const formatDateBRLocal = (dateStr?: string) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      return dateStr;
    };

    let periodoText = 'Todo o Período';
    if (startDate || endDate) {
      periodoText = `${startDate ? formatDateBRLocal(startDate) : 'Início'} até ${endDate ? formatDateBRLocal(endDate) : 'Fim'}`;
    }
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, ative os pop-ups para abrir o relatório de obras concluídas.');
      return;
    }
    
    const rowsHtml = concluidas.map((o, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px 16px; font-weight: bold; font-size: 13px; color: #1e293b; width: 10%; text-align: left;">#${idx + 1}</td>
        <td style="padding: 12px 16px; font-size: 13px; color: #334155; font-weight: 600; text-align: left;">${o.cliente}</td>
        <td style="padding: 12px 16px; font-size: 13px; color: #475569; font-weight: 500; text-align: left;">${o.vendedor || '<span style="color: #94a3b8; font-style: italic;">Sem Vendedor</span>'}</td>
      </tr>
    `).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Relatório de Obras Concluídas</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
              padding: 40px; 
              color: #1e293b; 
              background-color: #ffffff; 
              margin: 0;
            }
            .header {
              border-bottom: 2px solid #6366f1;
              padding-bottom: 15px;
              margin-bottom: 30px;
            }
            h1 { 
              font-size: 22px; 
              color: #4f46e5; 
              margin: 0 0 6px 0; 
              font-weight: 800;
              letter-spacing: -0.5px;
            }
            .meta { 
              font-size: 12px; 
              color: #64748b; 
              margin: 0; 
              font-weight: 500;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-top: 15px; 
            }
            th { 
              text-align: left; 
              background-color: #f8fafc; 
              padding: 12px 16px; 
              font-size: 11px; 
              text-transform: uppercase; 
              color: #64748b; 
              font-weight: 700;
              border-bottom: 2px solid #e2e8f0; 
              letter-spacing: 0.5px;
            }
            tr:hover {
              background-color: #f8fafc;
            }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Relatório de Obras Concluídas</h1>
            <p class="meta">Clientes e Vendedores | Período: ${periodoText} | Gerado em: ${new Date().toLocaleString('pt-BR')} | Total de Obras: ${concluidas.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 10%">Nº</th>
                <th style="width: 50%">Nome do Cliente</th>
                <th style="width: 40%">Vendedor Responsável</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="3" style="text-align: center; padding: 40px; color: #94a3b8; font-style: italic; font-size: 13px;">Nenhuma obra concluída encontrada nesse período.</td></tr>'}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const exportarJSON = () => {
    const backupData = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      obras,
      servicos,
      config: {
        vendedores,
        equipes,
        inversores,
        formasPagamento
      }
    };
    const dataStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_completo_cbc_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportarCSV = (tipo: 'obras' | 'servicos') => {
    const data = tipo === 'obras' ? obras : servicos;
    if (data.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    // Prepare data for XLSX (it's better than raw CSV for encoding/special chars)
    const ws = XLSX.utils.json_to_sheet(data.map(item => {
      const { firebaseId, ...rest } = item as any;
      return rest;
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tipo.charAt(0).toUpperCase() + tipo.slice(1));
    XLSX.writeFile(wb, `export_${tipo}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    
    if (file.name.endsWith('.json')) {
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);
          
          if (data.version === '2.0' && data.obras && data.servicos) {
            // Full backup format
            if (confirm('Deseja restaurar este backup completo? Isso irá ADICIONAR os dados aos existentes.')) {
              let countObras = 0;
              let countServicos = 0;

              for (const o of data.obras) {
                const { firebaseId, ...rest } = o;
                await addDoc(collection(db, 'obras'), { ...rest, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user.uid });
                countObras++;
              }

              for (const s of data.servicos) {
                const { firebaseId, ...rest } = s;
                await addDoc(collection(db, 'servicos'), { ...rest, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user.uid });
                countServicos++;
              }

              alert(`Backup restaurado! ${countObras} obras e ${countServicos} serviços importados.`);
            }
          } else if (Array.isArray(data)) {
            // Old format (only obras)
            if (confirm('Arquivo de backup antigo (apenas obras) detectado. Importar?')) {
              for (const o of data) {
                const { firebaseId, ...rest } = o;
                await addDoc(collection(db, 'obras'), { ...rest, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user.uid });
              }
              alert('Obras importadas do backup antigo.');
            }
          }
        } catch (err) {
          console.error(err);
          alert('Erro ao processar arquivo de backup.');
        }
      };
      reader.readAsText(file);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', cellDates: true });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

          let count = 0;
          if (activeTab === 'obras') {
            for (const row of jsonData) {
              const obraData = {
                id: Date.now() + Math.random(),
                numeroRegistro: row['Registro'] || String(obras.length + count + 1).padStart(3, '0'),
                situacao: (row['Situação'] as Situacao) || 'Pendente',
                prioridade: (row['Prioridade'] as Prioridade) || 'Média',
                cliente: row['Cliente'] || 'Importado',
                vendedor: row['Vendedor'] || '',
                local: row['Local'] || '',
                dataChegadaPlacas: normalizeDate(row['Chegada Placas']),
                dataContrato: normalizeDate(row['Data Contrato']) || new Date().toISOString().split('T')[0],
                quantidadePlacas: Number(row['Qtd Placas']) || 0,
                valorMaoObra: Number(row['Valor Mão Obra']) || 60,
                valorReceber: (Number(row['Qtd Placas']) || 0) * (Number(row['Valor Mão Obra']) || 0),
                dataObra: normalizeDate(row['Data Obra']),
                dataConclusao: normalizeDate(row['Data Conclusão']),
                equipe: row['Equipe'] || '',
                inversor: row['Inversor'] || '',
                formaPagamento: row['Forma Pagamento'] || '',
                observacoes: row['Observações'] || '',
                createdBy: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              };
              
              await addDoc(collection(db, 'obras'), obraData);
              if (obraData.dataObra && obraData.equipe) {
                await syncToWeeklySchedule(obraData.dataObra, obraData.equipe, obraData.cliente);
              }
              count++;
            }
          } else {
            for (const row of jsonData) {
              const servicoData = {
                id: Date.now() + Math.random(),
                numeroRegistro: row['Registro'] || String(servicos.length + count + 1).padStart(3, '0'),
                situacao: (row['Situação'] as Situacao) || 'Pendente',
                prioridade: (row['Prioridade'] as Prioridade) || 'Média',
                dataAtendimento: normalizeDate(row['Atendimento']) || new Date().toISOString().split('T')[0],
                cliente: row['Cliente'] || 'Importado',
                local: row['Local'] || '',
                vendedor: row['Vendedor'] || '',
                equipeServico: row['Equipe Serviço'] || '',
                servico: row['Serviço'] || '',
                valor: Number(row['Valor']) || 0,
                equipeInstalou: row['Equipe Instalou'] || '',
                dataServico: normalizeDate(row['Data Serviço']),
                formaPagamento: row['Forma Pagamento'] || '',
                observacao: row['Observação'] || '',
                createdBy: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              };
              
              await addDoc(collection(db, 'servicos'), servicoData);
              if (servicoData.dataServico && servicoData.equipeInstalou) {
                await syncToWeeklySchedule(servicoData.dataServico, servicoData.equipeInstalou, servicoData.cliente);
              }
              count++;
            }
          }
          alert(`${count} registros importados do Excel com sucesso!`);
        } catch (err) {
          console.error(err);
          alert('Erro ao importar arquivo Excel. Verifique o modelo.');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handlePasteImport = async () => {
    if (!importText.trim() || !user) return;

    const lines = importText.trim().split('\n');
    let count = 0;
    
    if (activeTab === 'obras') {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.includes('Situação') || line.includes('Registro') || line.includes('Cliente')) continue;
        
        let cols = line.split('\t'); // Tab separated (Excel/Sheets)
        if (cols.length <= 1) cols = line.split(';');
        if (cols.length <= 1) cols = line.split(',');
        
        const obraData = {
          id: Date.now() + i,
          numeroRegistro: String(obras.length + count + 1).padStart(3, '0'),
          situacao: (cols[0]?.trim() as Situacao) || 'Pendente',
          prioridade: (cols[1]?.trim() as Prioridade) || 'Média',
          cliente: cols[2]?.trim() || 'Importado',
          vendedor: cols[3]?.trim() || '',
          local: cols[4]?.trim() || '',
          dataChegadaPlacas: normalizeDate(cols[5]?.trim()),
          dataContrato: normalizeDate(cols[6]?.trim()) || new Date().toISOString().split('T')[0],
          quantidadePlacas: Number(cols[7]?.trim()) || 0,
          valorMaoObra: Number(cols[8]?.trim()) || 60,
          valorReceber: (Number(cols[7]?.trim()) || 0) * (Number(cols[8]?.trim()) || 0),
          dataObra: normalizeDate(cols[9]?.trim()),
          dataConclusao: normalizeDate(cols[10]?.trim()),
          equipe: cols[11]?.trim() || '',
          inversor: cols[12]?.trim() || '',
          formaPagamento: cols[14]?.trim() || '',
          observacoes: cols[13]?.trim() || '',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        try {
          await addDoc(collection(db, 'obras'), obraData);
          if (obraData.dataObra && obraData.equipe) {
            await syncToWeeklySchedule(obraData.dataObra, obraData.equipe, obraData.cliente);
          }
          count++;
        } catch (error) {
          console.error("Erro ao importar linha:", line, error);
        }
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.includes('Situação') || line.includes('Registro') || line.includes('Cliente')) continue;
        
        let cols = line.split('\t');
        if (cols.length <= 1) cols = line.split(';');
        if (cols.length <= 1) cols = line.split(',');
        
        const servicoData = {
          id: Date.now() + i,
          numeroRegistro: String(servicos.length + count + 1).padStart(3, '0'),
          situacao: (cols[0]?.trim() as Situacao) || 'Pendente',
          prioridade: (cols[1]?.trim() as Prioridade) || 'Média',
          dataAtendimento: normalizeDate(cols[2]?.trim()) || new Date().toISOString().split('T')[0],
          cliente: cols[3]?.trim() || 'Importado',
          local: cols[4]?.trim() || '',
          vendedor: cols[5]?.trim() || '',
          equipeServico: cols[6]?.trim() || '',
          servico: cols[7]?.trim() || '',
          valor: Number(cols[8]?.trim()) || 0,
          equipeInstalou: cols[9]?.trim() || '',
          dataServico: normalizeDate(cols[10]?.trim()),
          formaPagamento: cols[11]?.trim() || '',
          observacao: cols[12]?.trim() || '',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        try {
          await addDoc(collection(db, 'servicos'), servicoData);
          if (servicoData.dataServico && servicoData.equipeInstalou) {
            await syncToWeeklySchedule(servicoData.dataServico, servicoData.equipeInstalou, servicoData.cliente);
          }
          count++;
        } catch (error) {
          console.error("Erro ao importar linha de serviço:", line, error);
        }
      }
    }

    setImportText('');
    setIsImportModalOpen(false);
    alert(`${count} registros importados e salvos no banco de dados!`);
  };

  const downloadImportTemplate = () => {
    if (activeTab === 'obras') {
      const headers = [
        'Situação (Pendente/Em Andamento/Concluído)',
        'Prioridade (Alta/Média/Baixa)',
        'Cliente',
        'Vendedor',
        'Local',
        'Chegada Placas (DD/MM/AAAA)',
        'Data Contrato (DD/MM/AAAA)',
        'Qtd Placas',
        'Valor Mão Obra',
        'Data Obra (DD/MM/AAAA)',
        'Data Conclusão (DD/MM/AAAA)',
        'Equipe',
        'Inversor',
        'Forma Pagamento',
        'Observações'
      ];
      
      const exampleData = [
        ['Pendente', 'Média', 'João Silva', 'Carlos', 'Rua A, 123', '10/05/2024', '01/05/2024', '10', '60', '15/05/2024', '', 'Equipe Alfa', 'Growatt 5000', 'Boleto', 'Instalação padrão']
      ];

      const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Modelo Importação Obras");
      XLSX.writeFile(wb, "modelo_importacao_obras.xlsx");
    } else {
      const headers = [
        'Situação (Pendente/Em Andamento/Concluído)',
        'Prioridade (Alta/Média/Baixa)',
        'Atendimento (DD/MM/AAAA)',
        'Cliente',
        'Local',
        'Vendedor',
        'Equipe Serviço',
        'Serviço',
        'Valor',
        'Equipe Instalou',
        'Data Serviço (DD/MM/AAAA)',
        'Forma Pagamento',
        'Observação'
      ];
      
      const exampleData = [
        ['Pendente', 'Média', '12/05/2024', 'Maria Souza', 'Av. Central, 456', 'Roberto', 'Equipe Beta', 'Manutenção Inversor', '250', 'Equipe Alfa', '14/05/2024', 'PIX', 'Verificar conectores']
      ];

      const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Modelo Importação Serviços");
      XLSX.writeFile(wb, "modelo_importacao_servicos.xlsx");
    }
  };

  const downloadImportTemplatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(79, 70, 229); // indigo-600
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(`CBC - MODELO DE IMPORTAÇÃO DE ${activeTab === 'obras' ? 'OBRAS' : 'SERVIÇOS'}`, 14, 18);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Instruções e Estrutura de Colunas para Importação", 14, 24);
    
    // Core Instructions
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Instruções Gerais:", 14, 40);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const instructions = activeTab === 'obras' ? [
      "1. A planilha deve conter as colunas exatamente na ordem descrita abaixo.",
      "2. Evite cabeçalhos ao copiar e colar. Copie apenas as linhas de dados se for usar 'Colar Dados'.",
      "3. Datas devem estar no formato DD/MM/AAAA (ex: 25/12/2026).",
      "4. Situação aceita valores como: 'Pendente', 'Em Andamento', 'Concluído'.",
      "5. Prioridade aceita valores como: 'Alta', 'Média', 'Baixa'.",
      "6. Você também pode copiar tabelas de PDFs, Excel ou Google Sheets e colar diretamente na caixa de texto!"
    ] : [
      "1. A planilha deve conter as colunas exatamente na ordem descrita abaixo.",
      "2. Ao copiar e colar, não inclua o cabeçalho. Copie apenas as células com dados.",
      "3. Datas devem estar no formato DD/MM/AAAA (ex: 15/08/2026).",
      "4. Situação aceita: 'Pendente', 'Em Andamento', 'Concluído'.",
      "5. Prioridade aceita: 'Alta', 'Média', 'Baixa'.",
      "6. Copie as células do seu documento e cole diretamente na caixa de importação."
    ];
    
    let y = 46;
    instructions.forEach(ins => {
      doc.text(ins, 14, y);
      y += 5.5;
    });
    
    // Columns details
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Estrutura das Colunas & Exemplo de Dados:", 14, y);
    
    const headers = [
      ['Nº', 'Coluna', 'Tipo', 'Exemplo / Descrição']
    ];
    
    const columnsInfo = activeTab === 'obras' ? [
      ['1', 'Situação', 'Texto', 'Pendente, Em Andamento, Concluído'],
      ['2', 'Prioridade', 'Texto', 'Alta, Média, Baixa'],
      ['3', 'Cliente', 'Texto', 'Ex: João Silva da Rocha'],
      ['4', 'Vendedor', 'Texto', 'Ex: Rodrigo Prado'],
      ['5', 'Local', 'Texto', 'Ex: Av. Central, 120 - Curitiba'],
      ['6', 'Chegada Placas', 'Data', 'Ex: 10/05/2026 (DD/MM/AAAA)'],
      ['7', 'Data Contrato', 'Data', 'Ex: 01/05/2026 (DD/MM/AAAA)'],
      ['8', 'Qtd Placas', 'Número', 'Ex: 12'],
      ['9', 'Valor Mão Obra', 'Número', 'Ex: 60 (R$ por placa)'],
      ['10', 'Data Obra', 'Data', 'Ex: 18/05/2026 (DD/MM/AAAA)'],
      ['11', 'Data Conclusão', 'Data', 'Ex: 22/05/2026 (DD/MM/AAAA)'],
      ['12', 'Equipe', 'Texto', 'Nome da equipe responsável'],
      ['13', 'Inversor', 'Texto', 'Ex: Deye 8kW'],
      ['14', 'Observações', 'Texto', 'Detalhes adicionais da obra'],
      ['15', 'Forma Pagamento', 'Texto', 'Ex: Entrada + 3x, PIX']
    ] : [
      ['1', 'Situação', 'Texto', 'Pendente, Em Andamento, Concluído'],
      ['2', 'Prioridade', 'Texto', 'Alta, Média, Baixa'],
      ['3', 'Atendimento', 'Data', 'Ex: 10/05/2026 (DD/MM/AAAA)'],
      ['4', 'Cliente', 'Texto', 'Ex: Maria Souza'],
      ['5', 'Local', 'Texto', 'Ex: Rua 15 de Novembro, 250'],
      ['6', 'Vendedor', 'Texto', 'Ex: Mariana'],
      ['7', 'Equipe Serviço', 'Texto', 'Nome da equipe de atendimento'],
      ['8', 'Serviço', 'Texto', 'Descrição do serviço prestado'],
      ['9', 'Valor', 'Número', 'Ex: 350.00'],
      ['10', 'Equipe Instalou', 'Texto', 'Equipe que realizou o reparo'],
      ['11', 'Data Serviço', 'Data', 'Ex: 15/05/2026 (DD/MM/AAAA)'],
      ['12', 'Forma Pagamento', 'Texto', 'Ex: PIX, Dinheiro'],
      ['13', 'Observação', 'Texto', 'Observações relevantes']
    ];
    
    autoTable(doc, {
      head: headers,
      body: columnsInfo,
      startY: y + 4,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] },
      styles: { fontSize: 8, cellPadding: 2.5 }
    });
    
    doc.save(`modelo_importacao_${activeTab === 'obras' ? 'obras' : 'servicos'}.pdf`);
  };

  const exportarXLS = () => {
    const data = filteredObras.map(o => ({
      'Registro': o.numeroRegistro,
      'Situação': o.situacao,
      'Prioridade': o.prioridade,
      'Cliente': o.cliente,
      'Vendedor': o.vendedor,
      'Local': o.local,
      'Chegada Placas': formatDateBR(o.dataChegadaPlacas),
      'Data Contrato': formatDateBR(o.dataContrato),
      'Qtd Placas': o.quantidadePlacas,
      'Valor Mão Obra': o.valorMaoObra,
      'Total': o.valorReceber,
      'Data Obra': formatDateBR(o.dataObra),
      'Data Conclusão': formatDateBR(o.dataConclusao),
      'Equipe': o.equipe,
      'Inversor': o.inversor,
      'Forma Pagamento': o.formaPagamento,
      'Observações': o.observacoes
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Obras");
    XLSX.writeFile(wb, `obras_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header - CBC Energias Renováveis
    doc.setFillColor(14, 165, 233);
    doc.rect(0, 0, pageWidth, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("CBC ENERGIAS RENOVÁVEIS - RELATÓRIO GERAL DE OBRAS", 14, 16);
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 16, { align: 'right' });
    
    const tableData = filteredObras.map(o => [
      o.numeroRegistro,
      o.situacao,
      o.prioridade,
      o.cliente,
      o.vendedor,
      o.local,
      formatDateBR(o.dataContrato),
      o.quantidadePlacas,
      `R$ ${o.valorReceber.toLocaleString('pt-BR')}`
    ]);

    autoTable(doc, {
      head: [['Reg', 'Status', 'Prior', 'Cliente', 'Vendedor', 'Local', 'Contrato', 'Placas', 'Total']],
      body: tableData,
      startY: 35,
      theme: 'striped',
      headStyles: { fillColor: [14, 165, 233] },
      styles: { fontSize: 8 }
    });

    doc.save(`obras_geral_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const exportarIndividualPDF = (o: Obra) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    
    // --- COLORS ---
    const primaryIndigo = [67, 56, 202]; // #4338CA
    const textDark = [30, 41, 59];
    const textLight = [100, 116, 139];
    const separatorColor = [226, 232, 240];

    // --- TOP DECORATION ---
    doc.setFillColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
    doc.rect(0, 0, pageWidth, 5, 'F');

    // --- HEADER ---
    let y = 20;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
    doc.setFontSize(32);
    const cbcWidth = doc.getTextWidth("CBC");
    doc.text("CBC", margin, y);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text("solaris", margin + cbcWidth + 1, y);

    doc.setFontSize(10);
    doc.setTextColor(textLight[0], textLight[1], textLight[2]);
    doc.text("DETALHAMENTO DA OBRA", pageWidth - margin, y - 5, { align: 'right' });
    
    doc.setFontSize(14);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`#${o.numeroRegistro}`, pageWidth - margin, y + 2, { align: 'right' });

    y += 10;
    doc.setFontSize(8);
    doc.setTextColor(textLight[0], textLight[1], textLight[2]);
    doc.text("CBC Energias Renováveis", margin, y);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, pageWidth - margin, y, { align: 'right' });

    y += 6;
    doc.setDrawColor(separatorColor[0], separatorColor[1], separatorColor[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);

    // --- CLIENT SECTION ---
    y += 15;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 35, 2, 2, 'F');
    
    y += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
    doc.text("INFORMAÇÕES DO CLIENTE", margin + 5, y);

    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text("CLIENTE:", margin + 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(o.cliente.toUpperCase(), margin + 30, y);

    y += 6;
    doc.setFont("helvetica", "bold");
    doc.text("LOCAL:", margin + 5, y);
    doc.setFont("helvetica", "normal");
    const splitLocal = doc.splitTextToSize(String(o.local || "---").toUpperCase(), contentWidth - 40);
    doc.text(splitLocal, margin + 30, y);

    y += (splitLocal.length * 5);
    doc.setFont("helvetica", "bold");
    doc.text("VENDEDOR:", margin + 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(o.vendedor || "---").toUpperCase(), margin + 30, y);

    // --- TECHNICAL DETAILS ---
    y += 20;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
    doc.text("DADOS TÉCNICOS & CRONOGRAMA", margin, y);
    
    y += 3;
    doc.setDrawColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
    doc.setLineWidth(1);
    doc.line(margin, y, margin + 40, y);

    y += 10;
    const technicalData = [
      ["SITUAÇÃO:", o.situacao.toUpperCase(), "PRIORIDADE:", o.prioridade.toUpperCase()],
      ["EQUIPE:", String(o.equipe || "---").toUpperCase(), "INVERSOR:", String(o.inversor || "---").toUpperCase()],
      ["CONTRATO:", formatDateBR(o.dataContrato), "PLACAS (QTD):", String(o.quantidadePlacas)],
      ["CHEGADA PLACAS:", o.dataChegadaPlacas ? formatDateBR(o.dataChegadaPlacas) : "---", "PREVISÃO OBRA:", o.dataObra ? formatDateBR(o.dataObra) : "---"],
      ["CONCLUSÃO:", o.dataConclusao ? formatDateBR(o.dataConclusao) : "---", "PAGAMENTO:", String(o.formaPagamento || "---").toUpperCase()]
    ];

    doc.setFontSize(9);
    technicalData.forEach((row, i) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(textLight[0], textLight[1], textLight[2]);
      doc.text(row[0], margin, y + (i * 7));
      doc.setFont("helvetica", "normal");
      doc.setTextColor(textDark[0], textDark[1], textDark[2]);
      doc.text(row[1], margin + 30, y + (i * 7));

      doc.setFont("helvetica", "bold");
      doc.setTextColor(textLight[0], textLight[1], textLight[2]);
      doc.text(row[2], margin + (contentWidth/2) + 10, y + (i * 7));
      doc.setFont("helvetica", "normal");
      doc.setTextColor(textDark[0], textDark[1], textDark[2]);
      doc.text(row[3], margin + (contentWidth/2) + 40, y + (i * 7));
    });

    // --- OBSERVATIONS ---
    y += (technicalData.length * 7) + 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
    doc.text("OBSERVAÇÕES", margin, y);
    
    y += 5;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    const splitObs = doc.splitTextToSize(o.observacoes || "Nenhuma observação registrada.", contentWidth);
    doc.text(splitObs, margin, y);

    // --- FINANCIAL SUMMARY ---
    y += (splitObs.length * 6) + 15;
    doc.setFillColor(primaryIndigo[0], primaryIndigo[1], primaryIndigo[2]);
    doc.roundedRect(pageWidth - margin - 80, y, 80, 25, 1, 1, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("VALOR TOTAL A RECEBER", pageWidth - margin - 40, y + 8, { align: 'center' });
    
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(`R$ ${o.valorReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - margin - 40, y + 18, { align: 'center' });

    // --- FOOTER ---
    doc.setFontSize(7);
    doc.setTextColor(textLight[0], textLight[1], textLight[2]);
    doc.text("Gerado por CBC Solaris Cloud Management System", pageWidth / 2, pageHeight - 10, { align: 'center' });

    doc.save(`Obra_${o.numeroRegistro}_${o.cliente.replace(/\s+/g, '_')}.pdf`);
  };

  const exportarIndividualTXT = (o: Obra) => {
    let texto = `REGISTRO DE OBRA #${o.numeroRegistro}\n`;
    texto += "=".repeat(60) + "\n";
    texto += `Cliente:               ${o.cliente}\n`;
    texto += `Situação:              ${o.situacao}\n`;
    texto += `Prioridade:            ${o.prioridade}\n`;
    texto += `Vendedor:              ${o.vendedor || '---'}\n`;
    texto += `Equipe Responsável:    ${o.equipe || '---'}\n`;
    texto += `Local da Obra:         ${o.local || '---'}\n`;
    texto += `Inversor:              ${o.inversor || '---'}\n`;
    texto += "-".repeat(60) + "\n";
    texto += "CRONOGRAMA\n";
    texto += `Data Contrato:         ${formatDateBR(o.dataContrato)}\n`;
    texto += `Chegada Placas:        ${o.dataChegadaPlacas ? formatDateBR(o.dataChegadaPlacas) : '---'}\n`;
    texto += `Data Prevista Obra:    ${o.dataObra ? formatDateBR(o.dataObra) : '---'}\n`;
    texto += `Data Conclusão:        ${o.dataConclusao ? formatDateBR(o.dataConclusao) : '---'}\n`;
    texto += "-".repeat(60) + "\n";
    texto += "FINANCEIRO & TÉCNICO\n";
    texto += `Quantidade de Placas:  ${o.quantidadePlacas} unidades\n`;
    texto += `Valor Mão de Obra(un): R$ ${o.valorMaoObra.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    texto += `Valor Total a Receber: R$ ${o.valorReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;
    texto += `Forma de Pagamento:    ${o.formaPagamento || '---'}\n`;
    texto += "-".repeat(60) + "\n";
    texto += "OBSERVAÇÕES ADICIONAIS\n";
    texto += `${o.observacoes || 'Nenhuma observação registrada.'}\n`;
    texto += "=".repeat(60) + "\n";
    texto += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    texto += "Sistema de Gestão de Obras - Cloud\n";

    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `obra_${o.numeroRegistro}_${o.cliente.replace(/[^a-z0-9]/gi, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const bulkExportTXT = () => {
    const selectedObras = obras.filter(o => selectedIds.has(o.id));
    if (selectedObras.length === 0) return;

    let texto = "RELATÓRIO DE OBRAS SELECIONADAS\n";
    texto += "=".repeat(60) + "\n";
    texto += `Total de Registros: ${selectedObras.length}\n`;
    texto += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
    texto += "=".repeat(60) + "\n\n";

    selectedObras.forEach((o, index) => {
      texto += `[#${index + 1}] REGISTRO #${o.numeroRegistro}\n`;
      texto += `- Cliente: ${o.cliente}\n`;
      texto += `- Situação: ${o.situacao}\n`;
      texto += `- Prioridade: ${o.prioridade}\n`;
      texto += `- Equipe: ${o.equipe || '---'}\n`;
      texto += `- Data da Obra: ${o.dataObra ? formatDateBR(o.dataObra) : '---'}\n`;
      texto += `- Valor: R$ ${o.valorReceber.toLocaleString('pt-BR')}\n`;
      texto += "-".repeat(40) + "\n\n";
    });

    texto += "FIM DO RELATÓRIO\n";

    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_obras_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Helper to convert number to currency string in words
  const valorPorExtenso = (valor: number): string => {
    const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
    const dezena1 = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
    const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
    const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

    const getCentena = (n: number) => {
      if (n === 100) return "cem";
      let res = "";
      const c = Math.floor(n / 100);
      const d = Math.floor((n % 100) / 10);
      const u = n % 10;

      if (c > 0) res += centenas[c];
      if (d > 0) {
        if (res !== "") res += " e ";
        if (d === 1) {
          res += dezena1[u];
          return res;
        }
        res += dezenas[d];
      }
      if (u > 0) {
        if (res !== "") res += " e ";
        res += unidades[u];
      }
      return res;
    };

    if (valor === 0) return "zero reais";
    
    const inteiro = Math.floor(valor);
    const centavos = Math.round((valor - inteiro) * 100);

    let extenso = "";
    
    if (inteiro > 0) {
      if (inteiro < 1000) {
        extenso = getCentena(inteiro);
      } else if (inteiro < 1000000) {
        const mil = Math.floor(inteiro / 1000);
        const resto = inteiro % 1000;
        extenso = (mil === 1 ? "mil" : getCentena(mil) + " mil");
        if (resto > 0) {
          extenso += (resto < 100 || resto % 100 === 0 ? " e " : " ") + getCentena(resto);
        }
      }
      extenso += inteiro === 1 ? " real" : " reais";
    }

    if (centavos > 0) {
      if (extenso !== "") extenso += " e ";
      extenso += getCentena(centavos) + (centavos === 1 ? " centavo" : " centavos");
    }

    return extenso;
  };

  const gerarReciboServicoPDF = (s: any) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    
    // --- COLORS ---
    const primaryGreen = [45, 106, 79]; // Dark Green (#2D6A4F)
    const midGreen = [64, 145, 108];    // Mid Green (#40916C)
    const lightGreen = [240, 248, 245]; // Neutral background (#F0F8F5)
    const accentGrey = [108, 117, 125]; // Secondary text
    const textDark = [33, 37, 41];     // Main text
    const separatorColor = [200, 200, 200];

    // --- INITIAL Y POSITION ---
    let y = 15;

    // --- HEADER: BRANDING ---
    doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.rect(0, 0, pageWidth, 5, 'F'); // Top accent bar

    y = 25;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.setFontSize(36);
    const cbcWidth = doc.getTextWidth("CBC");
    doc.text("CBC", margin, y);
    doc.setTextColor(midGreen[0], midGreen[1], midGreen[2]);
    doc.text("solaris", margin + cbcWidth + 1, y);

    // Document Type Label
    doc.setFontSize(10);
    doc.setTextColor(accentGrey[0], accentGrey[1], accentGrey[2]);
    doc.setFont("helvetica", "bold");
    doc.text("COMPROVANTE DE RECIBO", pageWidth - margin, y - 5, { align: 'right' });
    
    doc.setFontSize(14);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`REGISTRO #${s.numeroRegistro || '---'}`, pageWidth - margin, y + 2, { align: 'right' });

    y += 12;
    // Company Subtitle
    doc.setFontSize(8.5);
    doc.setTextColor(accentGrey[0], accentGrey[1], accentGrey[2]);
    doc.setFont("helvetica", "normal");
    doc.text("Cbcsolaris Solar Projetos e Instalação de Sistemas Fotovoltaicos LTDA", margin, y);
    doc.text(`Emitido em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, pageWidth - margin, y, { align: 'right' });

    y += 4.5;
    doc.text("CNPJ: 37.426.463/0001-20 | Rua Itapagipe, 75 · Recife/PE · CEP 51150-690", margin, y);
    
    y += 4.5;
    doc.text("Central de Atendimento: cbc@energiasrenovaveis.com · +55 81 98101-1951", margin, y);

    // Horizontal line after header
    y += 8;
    doc.setDrawColor(separatorColor[0], separatorColor[1], separatorColor[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);

    // --- SECTION: CLIENT DATA ---
    y += 15;
    doc.setFillColor(lightGreen[0], lightGreen[1], lightGreen[2]);
    doc.roundedRect(margin, y, contentWidth, 38, 2, 2, 'F');
    
    y += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("DADOS DO DESTINATÁRIO", margin + 5, y);

    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text("NOME DO CLIENTE:", margin + 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(s.cliente || "---").toUpperCase(), margin + 45, y);

    y += 6.5;
    doc.setFont("helvetica", "bold");
    doc.text("LOCAL DA EXECUÇÃO:", margin + 5, y);
    doc.setFont("helvetica", "normal");
    const splitEndereco = doc.splitTextToSize(String(s.local || "---").toUpperCase(), contentWidth - 55);
    doc.text(splitEndereco, margin + 45, y);

    y += (splitEndereco.length * 5) + 1.5;
    doc.setFont("helvetica", "bold");
    doc.text("CONSULTOR RESP.:", margin + 5, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(s.vendedor || "---").toUpperCase(), margin + 45, y);

    // --- SECTION: SERVICE DESCRIPTION ---
    y += 20;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("DESCRIÇÃO DETALHADA DO SERVIÇO", margin, y);
    
    y += 3;
    doc.setDrawColor(midGreen[0], midGreen[1], midGreen[2]);
    doc.setLineWidth(1);
    doc.line(margin, y, margin + 50, y);

    y += 10;
    // Main Service Box - DYNAMIC HEIGHT
    const splitServico = doc.splitTextToSize(String(s.servico || "SERVIÇO NÃO DEFINIDO").toUpperCase(), contentWidth - 10);
    const splitObs = s.observacao ? doc.splitTextToSize(s.observacao, contentWidth - 15) : [];
    
    let estimatedHeight = (splitServico.length * 6) + 10;
    if (s.observacao) {
      estimatedHeight += (splitObs.length * 5) + 15;
    }
    const boxHeight = Math.max(estimatedHeight, 35);

    doc.setDrawColor(separatorColor[0], separatorColor[1], separatorColor[2]);
    doc.setLineWidth(0.1);
    doc.rect(margin, y, contentWidth, boxHeight); 

    let textY = y + 10;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(splitServico, margin + 5, textY);

    textY += (splitServico.length * 6) + 6;
    if (s.observacao) {
      doc.setFontSize(9);
      doc.setTextColor(accentGrey[0], accentGrey[1], accentGrey[2]);
      doc.setFont("helvetica", "bold");
      doc.text("RESSALVAS / OBSERVAÇÕES:", margin + 5, textY);
      
      textY += 5;
      doc.setFont("helvetica", "italic");
      doc.setTextColor(textDark[0], textDark[1], textDark[2]);
      doc.text(splitObs, margin + 5, textY);
    }

    // --- SECTION: FINANCIAL SUMMARY ---
    y += boxHeight + 10;
    const boxWidth = 90;
    const boxX = pageWidth - margin - boxWidth;
    
    // Total Box
    doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.roundedRect(boxX, y, boxWidth, 28, 1, 1, 'F');
    
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "normal");
    doc.text("VALOR TOTAL LIQUIDADO", boxX + boxWidth/2, y + 9, { align: 'center' });
    
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    const valorNum = Number(s.valor || 0);
    const valorStr = valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    doc.text(valorStr, boxX + boxWidth/2, y + 20, { align: 'center' });

    // Method Box
    doc.setFontSize(9);
    doc.setTextColor(midGreen[0], midGreen[1], midGreen[2]);
    doc.setFont("helvetica", "bold");
    doc.text("MÉTODO DE PAGAMENTO:", margin, y + 8);
    
    doc.setFontSize(13);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(String(s.formaPagamento || "---").toUpperCase(), margin, y + 18);

    // --- DECLARATION ---
    y += 40;
    doc.setFontSize(10);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.setFont("helvetica", "normal");
    const fullDate = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    const declaracao = `Confirmamos que em ${fullDate}, recebemos a quantia de ${valorStr} (${valorPorExtenso(valorNum)}), quitando integralmente os custos relativos aos serviços técnicos acima descritos, operados sob a responsabilidade da CBC Solaris.`;
    const splitDecl = doc.splitTextToSize(declaracao, contentWidth);
    doc.text(splitDecl, margin, y);

    // --- SIGNATURES ---
    y = pageHeight - 65;
    doc.setDrawColor(separatorColor[0], separatorColor[1], separatorColor[2]);
    doc.setLineWidth(0.5);
    
    // Left: Company
    doc.line(margin, y, margin + 70, y);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
    doc.text("CBC SOLARIS", margin + 35, y + 6, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(accentGrey[0], accentGrey[1], accentGrey[2]);
    doc.text("Departamento de Operações", margin + 35, y + 11, { align: 'center' });

    // Right: Client
    doc.line(pageWidth - margin - 70, y, pageWidth - margin, y);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(String(s.cliente || "ASSINATURA").toUpperCase(), pageWidth - margin - 35, y + 6, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(accentGrey[0], accentGrey[1], accentGrey[2]);
    doc.text("Cliente Certificador", pageWidth - margin - 35, y + 11, { align: 'center' });

    // --- FOOTER ---
    doc.setFontSize(7.5);
    doc.setTextColor(accentGrey[0], accentGrey[1], accentGrey[2]);
    doc.text("Este recibo é emitido eletronicamente e tem validade como comprovante de serviço e quitação.", pageWidth / 2, pageHeight - 18, { align: 'center' });
    doc.setFont("helvetica", "bold");
    doc.text("CBC SOLARIS · ENERGIA QUE TRANSFORMA · www.cbcsolaris.com.br", pageWidth / 2, pageHeight - 13, { align: 'center' });

    // --- FILENAME & DOWNLOAD ---
    const fileName = `Recibo_${s.numeroRegistro || 'S-N'}_${String(s.cliente || 'Cliente').replace(/\s+/g, '_')}`;
    doc.save(`${fileName}.pdf`);
  };

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Erro ao fazer login", error);
      if (error.code === 'auth/unauthorized-domain') {
        setAuthError("Este domínio não está autorizado no Firebase. Adicione o domínio do Netlify no Console do Firebase > Authentication > Settings > Authorized domains.");
      } else if (error.code === 'auth/popup-blocked') {
        setAuthError("O pop-up de login foi bloqueado pelo navegador. Por favor, permita pop-ups para este site.");
      } else {
        setAuthError(`Erro ao fazer login: ${error.message}`);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao fazer logout", error);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 max-w-md w-full text-center space-y-6"
        >
          <div className="bg-indigo-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto text-white shadow-lg shadow-indigo-200">
            <ClipboardList size={40} />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">Gestão de Obras</h1>
            <p className="text-slate-500">Faça login para acessar o sistema de controle de agendamentos e financeiro.</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-6 py-4 rounded-2xl font-bold transition-all active:scale-95 shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" referrerPolicy="no-referrer" />
            Entrar com Google
          </button>
          {authError && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-xs p-4 rounded-xl text-left leading-relaxed">
              {authError}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 text-slate-900 font-sans flex flex-col overflow-hidden">
      <MobilePWAInstall />
      <main className="flex-1 overflow-y-auto p-2 md:p-4 scrollbar-hide">
        <div className="w-full space-y-4">
          {activeTab === 'notebook' ? (
            <NotebookView 
              user={{ id: currentUser.id, name: currentUser.name }} 
              attendants={Array.from(new Set([
                ...USERS.map(u => u.name),
                ...vendedores.map(v => v.nome)
              ])).sort()}
              onBack={() => setActiveTab('obras')}
            />
          ) : activeTab === 'posvenda' ? (
            <PosVendaView onBack={() => setActiveTab('obras')} />
          ) : activeTab === 'escala' ? (
            <EscalaView 
              onBack={() => setActiveTab('obras')} 
              obras={obras} 
              servicos={servicos} 
              onEditObra={(obra) => {
                handleEdit(obra);
              }}
              onEditServico={(servico) => {
                handleServicoEdit(servico);
              }}
            />
          ) : (
            <>
              {/* Header */}
              <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 p-2 rounded-xl text-white">
              <ClipboardList size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Sistema de Gestão</h1>
              <p className="text-slate-500 text-xs">Controle de agendamentos e financeiro</p>
            </div>
          </div>
          
            {/* Tab Switcher */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button 
                onClick={() => setActiveTab('obras')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'obras' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Obras
              </button>
              <button 
                onClick={() => setActiveTab('servicos')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'servicos' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Agendamento de Serviço
              </button>
              <button 
                onClick={() => setActiveTab('escala')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'escala' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Escala Semanal
              </button>
              <button 
                onClick={() => setActiveTab('posvenda')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'posvenda' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Pós-Venda
              </button>
              <button 
                onClick={() => setActiveTab('notebook')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'notebook' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Bloco de Notas
              </button>
            </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <p className="text-sm font-bold text-slate-900">{user.displayName}</p>
              <button onClick={handleLogout} className="text-[10px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1">
                <LogOut size={10} />
                Sair
              </button>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              <UserIcon size={16} className="text-slate-500" />
              <select 
                value={currentUser.id}
                onChange={(e) => {
                  const user = USERS.find(u => u.id === e.target.value);
                  if (user) setCurrentUser(user);
                }}
                className="bg-transparent text-sm font-semibold outline-none text-slate-700"
              >
                {USERS.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsLembretesHubOpen(true)}
                className={`relative p-2.5 rounded-xl transition-all ${
                  alarmesDeHoje.length > 0
                    ? 'bg-amber-100 text-amber-600 hover:bg-amber-200 ring-2 ring-amber-400 ring-offset-1 animate-pulse'
                    : 'text-slate-500 hover:text-indigo-600 hover:bg-slate-100'
                }`}
                title="Central de Alarmes e Lembretes"
              >
                <Bell size={20} className={alarmesDeHoje.length > 0 ? "animate-bounce" : ""} />
                {alarmesDeHoje.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center border border-white">
                    {alarmesDeHoje.length}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setIsPayrollOpen(true)}
                className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                title="Folha de Pagamento"
              >
                <Wallet size={20} />
              </button>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
                title="Configurações"
              >
                <Settings size={20} />
              </button>
              {canImport && (
                <button 
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl font-semibold transition-all active:scale-95"
                >
                  <FileSpreadsheet size={20} className="text-emerald-600" />
                  Importar (Colar)
                </button>
              )}
              {canCreate && (
                <button 
                  onClick={() => { 
                    if (activeTab === 'obras') {
                      resetForm(); 
                      setIsFormOpen(true); 
                    } else {
                      resetServicoForm();
                      setIsServicoFormOpen(true);
                    }
                  }}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all active:scale-95 shadow-lg shadow-indigo-200"
                >
                  <Plus size={20} />
                  {activeTab === 'obras' ? 'Nova Obra' : 'Novo Serviço'}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Banner de Alarmes Ativos do Dia */}
        <AnimatePresence>
          {alarmesDeHoje.length > 0 && showLembretesBanner && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="bg-amber-400 text-slate-950 p-4 md:p-5 rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-2 border-amber-300 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-1 opacity-10 font-black text-6xl select-none pointer-events-none">
                HOJE!
              </div>
              <div className="flex items-start gap-4 z-10 w-full md:w-auto">
                <div className="bg-amber-950 text-amber-300 p-3 rounded-2xl animate-bounce shrink-0 mt-0.5 shadow-lg">
                  <Bell size={24} className="text-amber-300" />
                </div>
                <div className="space-y-1 w-full">
                  <h3 className="text-lg font-black tracking-tight text-amber-950 flex items-center gap-2">
                    🚨 PAINEL DE ALARME DE HOJE
                    <span className="bg-amber-950 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse shrink-0">
                      Deixar Bem Visível!
                    </span>
                  </h3>
                  <p className="text-sm font-semibold text-amber-950 leading-relaxed">
                    Aqui estão os compromissos marcados para hoje. Certifique-se de deixar tudo bem sinalizado e visível:
                  </p>
                  <div className="space-y-2 mt-3 w-full max-w-2xl">
                    {alarmesDeHoje.map((alarm, idx) => (
                      <div key={alarm.id} className="bg-amber-950/10 p-3.5 rounded-xl border border-amber-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-extrabold text-sm text-amber-950">
                            {idx + 1}. {alarm.titulo}
                          </p>
                          {alarm.descricao && (
                            <p className="text-xs text-amber-900 font-bold leading-relaxed">
                              &rarr; {alarm.descricao}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                          {alarm.tipo === 'lembrete' ? (
                            <button
                              onClick={() => handleToggleLembreteConcluido(alarm.id, false)}
                              className="bg-amber-950 hover:bg-amber-900 text-amber-300 text-xs font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all shadow-md"
                            >
                              Concluir Lembrete
                            </button>
                          ) : (
                            <span className="text-[10px] bg-amber-950 text-amber-300 font-extrabold px-2 py-1 rounded-md uppercase tracking-wider">
                              {alarm.tipo === 'obra' ? 'Instalação Obra' : 'Serviço Agendado'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end md:self-center z-10 shrink-0">
                <button
                  onClick={playAlarmChime}
                  className="flex items-center gap-1.5 bg-amber-950 hover:bg-amber-900 text-amber-300 font-extrabold px-3 py-2 rounded-xl text-xs shadow-md transition-all active:scale-95"
                  title="Testar Som do Alarme"
                >
                  <Volume2 size={16} />
                  Testar Som
                </button>
                <button
                  onClick={() => setShowLembretesBanner(false)}
                  className="bg-amber-950/10 hover:bg-amber-950/20 text-amber-950 p-2 rounded-xl transition-all"
                  title="Minimizar Alerta"
                >
                  <X size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Grid - REMOVED AS PER REQUEST */}

        {/* Filters */}
        <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
              <Filter size={16} />
              <h2>Filtros</h2>
            </div>
            <button 
              onClick={() => setFiltros({ situacao: '', prioridade: '', cliente: '', vendedor: '' })}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
            >
              <X size={12} />
              Limpar
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <select 
                value={filtros.situacao}
                onChange={(e) => setFiltros(prev => ({ ...prev, situacao: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">Todas Situações</option>
                <option value="Pendente">Pendente</option>
                <option value="Em Andamento">Em Andamento</option>
                <option value="Em Espera">Em Espera</option>
              </select>
            </div>
            <div className="space-y-1">
              <select 
                value={filtros.prioridade}
                onChange={(e) => setFiltros(prev => ({ ...prev, prioridade: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">Todas Prioridades</option>
                <option value="Alta">Alta</option>
                <option value="Média">Média</option>
                <option value="Baixa">Baixa</option>
              </select>
            </div>
            <div className="space-y-1">
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Filtrar cliente..."
                  value={filtros.cliente}
                  onChange={(e) => setFiltros(prev => ({ ...prev, cliente: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            <div className="space-y-1">
              <input 
                type="text" 
                placeholder="Filtrar vendedor..."
                value={filtros.vendedor}
                onChange={(e) => setFiltros(prev => ({ ...prev, vendedor: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          {activeTab === 'obras' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Visualização:</span>
              <button 
                onClick={() => setHideScheduledObras(!hideScheduledObras)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5 ${hideScheduledObras ? 'bg-slate-100 text-slate-400 border border-slate-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${hideScheduledObras ? 'bg-slate-300' : 'bg-indigo-500 animate-pulse'}`} />
                Obras Agendadas
              </button>
              <button 
                onClick={() => setHideUnscheduledObras(!hideUnscheduledObras)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5 ${hideUnscheduledObras ? 'bg-slate-100 text-slate-400 border border-slate-200' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${hideUnscheduledObras ? 'bg-slate-300' : 'bg-orange-500 animate-pulse'}`} />
                Sem Data Prevista
              </button>
            </div>
          )}
          {activeTab === 'servicos' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Visualização:</span>
              <button 
                onClick={() => setHideScheduledServicos(!hideScheduledServicos)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5 ${hideScheduledServicos ? 'bg-slate-100 text-slate-400 border border-slate-200' : 'bg-indigo-50 text-indigo-700 border border-indigo-200'}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${hideScheduledServicos ? 'bg-slate-300' : 'bg-indigo-500 animate-pulse'}`} />
                Serviços Agendados
              </button>
              <button 
                onClick={() => setHideUnscheduledServicos(!hideUnscheduledServicos)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5 ${hideUnscheduledServicos ? 'bg-slate-100 text-slate-400 border border-slate-200' : 'bg-orange-50 text-orange-700 border border-orange-200'}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full ${hideUnscheduledServicos ? 'bg-slate-300' : 'bg-orange-500 animate-pulse'}`} />
                Serviços Sem Data
              </button>
            </div>
          )}
        </section>

        {/* Main Content - Obras or Servicos */}
        {activeTab === 'obras' ? (
          <div className="space-y-8">
            {/* Section: Obras Agendadas (Highlighted) */}
            {!hideScheduledObras && (
              <section className="bg-white rounded-2xl shadow-lg border-2 border-indigo-500 overflow-hidden relative">
                <div className="absolute top-0 right-0">
                  <div className="bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-widest shadow-sm">
                    Agendadas
                  </div>
                </div>
                <div className="px-6 py-4 bg-indigo-50/50 border-b border-indigo-100 flex items-center justify-between">
                  <h2 className="font-bold text-indigo-900 flex items-center gap-2">
                    <Calendar size={18} className="text-indigo-600" />
                    Obras Agendadas
                  </h2>
                  <span className="text-xs font-bold text-indigo-600 bg-white px-2 py-1 rounded-lg border border-indigo-200 shadow-sm">
                    {scheduledObras.length} obras
                  </span>
                </div>
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-indigo-50/30 border-b border-indigo-100">
                        <th className="px-1.5 py-3 w-10">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                            checked={scheduledObras.length > 0 && scheduledObras.every(o => selectedIds.has(o.id))}
                            onChange={() => toggleSelectAll(scheduledObras)}
                          />
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                          onClick={() => handleSort('numeroRegistro')}
                        >
                          <div className="flex items-center gap-1">
                            Reg. {sortConfig.key === 'numeroRegistro' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                          onClick={() => handleSort('situacao')}
                        >
                          <div className="flex items-center gap-1">
                            Status {sortConfig.key === 'situacao' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                          onClick={() => handleSort('prioridade')}
                        >
                          <div className="flex items-center gap-1">
                            Prior. {sortConfig.key === 'prioridade' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                          onClick={() => handleSort('cliente')}
                        >
                          <div className="flex items-center gap-1">
                            Cliente {sortConfig.key === 'cliente' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider text-center cursor-pointer hover:bg-indigo-100/50 transition-colors"
                          onClick={() => handleSort('dataContrato')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Dias {sortConfig.key === 'dataContrato' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                          onClick={() => handleSort('local')}
                        >
                          <div className="flex items-center gap-1">
                            Local {sortConfig.key === 'local' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                          onClick={() => handleSort('vendedor')}
                        >
                          <div className="flex items-center gap-1">
                            Vend. {sortConfig.key === 'vendedor' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                          onClick={() => handleSort('equipe')}
                        >
                          <div className="flex items-center gap-1">
                            Equipe {sortConfig.key === 'equipe' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                          onClick={() => handleSort('dataObra')}
                        >
                          <div className="flex items-center gap-1">
                            Previsão {sortConfig.key === 'dataObra' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                          onClick={() => handleSort('formaPagamento')}
                        >
                          <div className="flex items-center gap-1">
                            Financ. {sortConfig.key === 'formaPagamento' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-indigo-50">
                      <AnimatePresence mode="popLayout">
                        {scheduledObras.length > 0 ? (
                          scheduledObras.map((obra) => (
                            <motion.tr 
                              key={obra.id}
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => handleEdit(obra)}
                              className={`cursor-pointer hover:bg-indigo-50/50 transition-colors ${
                                obra.situacao === 'Pendente' 
                                  ? 'bg-amber-50/40 border-l-4 border-amber-400' 
                                  : obra.situacao === 'Em Espera'
                                  ? 'bg-slate-50/40 border-l-4 border-slate-400'
                                  : 'bg-blue-50/40 border-l-4 border-blue-400'
                              } ${selectedIds.has(obra.id) ? 'bg-indigo-100/50' : ''}`}
                            >
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                  checked={selectedIds.has(obra.id)}
                                  onChange={() => toggleSelect(obra.id)}
                                />
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className="font-mono text-[10px] font-bold text-indigo-600 bg-white px-1.5 py-1 rounded border border-indigo-100">
                                  #{obra.numeroRegistro}
                                </span>
                              </td>
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <select 
                                  value={obra.situacao}
                                  onChange={(e) => updateObraQuick(obra.id, 'situacao', e.target.value)}
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border outline-none transition-all ${
                                    obra.situacao === 'Pendente' 
                                      ? 'bg-amber-100 text-amber-700 border-amber-200' 
                                      : obra.situacao === 'Em Espera'
                                      ? 'bg-slate-100 text-slate-700 border-slate-200'
                                      : 'bg-blue-100 text-blue-700 border-blue-200'
                                  }`}
                                >
                                  <option value="Pendente">Pendente</option>
                                  <option value="Em Andamento">Em Andamento</option>
                                  <option value="Concluído">Concluído</option>
                                  <option value="Em Espera">Em Espera</option>
                                </select>
                              </td>
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <select 
                                  value={obra.prioridade}
                                  onChange={(e) => updateObraQuick(obra.id, 'prioridade', e.target.value)}
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border outline-none transition-all ${
                                    obra.prioridade === 'Alta' 
                                      ? 'bg-red-50 text-red-700 border-red-100' 
                                      : obra.prioridade === 'Média'
                                      ? 'bg-amber-50 text-amber-700 border-amber-100'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                  }`}
                                >
                                  <option value="Alta">Alta</option>
                                  <option value="Média">Média</option>
                                  <option value="Baixa">Baixa</option>
                                </select>
                              </td>
                              <td className="px-3 py-3">
                                <div className="text-xs font-bold text-slate-900 min-w-[120px] cursor-pointer hover:text-indigo-600 transition-colors flex items-center gap-1 group/name">
                                  <span onClick={() => handleEdit(obra)} className="flex-1 truncate" title="Clique para editar informações">{obra.cliente}</span>
                                  {obra.txtFile && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setViewingTxt(obra.txtFile || null); }}
                                      className="p-1 text-indigo-500 hover:text-indigo-700 transition-all hover:scale-110 flex-none"
                                      title="Ver TXT"
                                    >
                                      <FileText size={14} />
                                    </button>
                                  )}
                                </div>
                                {obra.observacoes && (
                                  <div className="text-[10px] text-slate-500 mt-0.5 max-w-[200px] truncate" title={obra.observacoes}>
                                    {obra.observacoes}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <div className={`text-[10px] font-bold px-2 py-1 rounded text-center ${
                                  (() => {
                                    const dias = getDaysDiff(obra.dataContrato);
                                    return dias > 30 ? 'bg-red-100 text-red-700' : dias > 15 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
                                  })()
                                }`}>
                                  {getDaysDiff(obra.dataContrato)} d
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="text-[10px] text-slate-600 min-w-[100px]">{obra.local || '---'}</div>
                              </td>
                              {renderEditableCell(obra.id, 'vendedor', 'obra', obra.vendedor || '', 'vendedor')}
                              {renderEditableCell(
                                obra.id,
                                'equipe',
                                'obra',
                                obra.equipe || '',
                                'equipe',
                                <div className="font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-1">
                                  <span>{obra.equipe || '---'}</span>
                                  <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                                </div>
                              )}
                              {renderEditableCell(
                                obra.id,
                                'dataObra',
                                'obra',
                                obra.dataObra || '',
                                'date',
                                <div className="flex flex-col text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg border border-indigo-100 hover:border-indigo-300 transition-all cursor-pointer group-hover/cell:shadow-xs">
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                    <Calendar size={10} /> {formatDateBR(obra.dataObra)}
                                  </div>
                                  <div className="text-[12px] font-black uppercase opacity-80 mt-0.5 flex items-center justify-between gap-1">
                                    <span>{getDayOfWeek(obra.dataObra)}</span>
                                    <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                                  </div>
                                </div>
                              )}
                              <td className="px-3 py-3 whitespace-nowrap">
                                <div className="text-sm font-bold text-slate-900 leading-tight">R$ {obra.valorReceber.toLocaleString('pt-BR')}</div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-tight flex flex-wrap items-center gap-1.5 mt-1">
                                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-bold">{obra.quantidadePlacas} Placas</span>
                                  <div 
                                    className="cursor-pointer hover:scale-105 transition-transform"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingPayment({ id: obra.id.toString(), type: 'obra' });
                                    }}
                                  >
                                    {editingPayment?.id === obra.id.toString() && editingPayment.type === 'obra' ? (
                                      <select
                                        autoFocus
                                        className="text-[10px] bg-white border border-indigo-300 rounded px-1 outline-none"
                                        value={obra.formaPagamento || ''}
                                        onBlur={() => setEditingPayment(null)}
                                        onChange={(e) => {
                                          updateObraQuick(obra.id as any, 'formaPagamento' as any, e.target.value);
                                          setEditingPayment(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <option value="">Selecione</option>
                                        {formasPagamento.filter(f => f.ativo).map(f => (
                                          <option key={f.id} value={f.nome}>{f.nome}</option>
                                        ))}
                                        <option value="Outros">Outros</option>
                                      </select>
                                    ) : (
                                      <span className="text-indigo-700 font-black bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 shadow-sm" title="Forma de Pagamento">
                                        {obra.formaPagamento || 'DEFINIR PGTO'}
                                      </span>
                                    )}
                                  </div>
                                  <div 
                                    className="cursor-pointer hover:scale-105 transition-transform"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingPayment({ id: obra.id.toString(), type: 'obra-situacao' as any });
                                    }}
                                  >
                                    {editingPayment?.id === obra.id.toString() && editingPayment.type === 'obra-situacao' ? (
                                      <select
                                        autoFocus
                                        className="text-[10px] bg-white border border-indigo-300 rounded px-1 outline-none font-bold"
                                        value={obra.situacaoPagamento || ''}
                                        onBlur={() => setEditingPayment(null)}
                                        onChange={(e) => {
                                          updateObraQuick(obra.id as any, 'situacaoPagamento' as any, e.target.value);
                                          setEditingPayment(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <option value="">Status</option>
                                        <option value="À Vista">À Vista</option>
                                        <option value="Pago">Pago</option>
                                        <option value="A Pagar">A Pagar</option>
                                      </select>
                                    ) : (
                                      <span className={`font-black px-2 py-0.5 rounded border shadow-sm ${
                                        obra.situacaoPagamento === 'À Vista' 
                                          ? 'bg-sky-50 text-sky-700 border-sky-100'
                                          : obra.situacaoPagamento === 'Pago'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                          : 'bg-rose-50 text-rose-700 border-rose-100'
                                      }`} title="Situação de Pagamento">
                                        {obra.situacaoPagamento || 'A Pagar'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  <button 
                                    onClick={() => { setSelectedObra(obra); setIsDetailsModalOpen(true); }}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                                    title="Ver Detalhes"
                                  >
                                    <Eye size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleEdit(obra)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                    title="Editar"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  {canDelete && (
                                    <button 
                                      onClick={() => handleDelete(obra.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                                      title="Excluir"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </motion.tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={12} className="px-6 py-8 text-center text-slate-400">
                              <p className="text-sm">Nenhuma obra agendada no momento.</p>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Section: Obras Sem Agendamento (Without Scheduled Date) */}
            {!hideUnscheduledObras && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="font-bold text-slate-700 flex items-center gap-2">
                    <Clock size={18} className="text-amber-500" />
                    Obras Sem Data Prevista (Pendentes / Em Espera)
                  </h2>
                  <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                    {unscheduledObras.length} obras
                  </span>
                </div>
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-200">
                        <th className="px-1.5 py-3 w-10">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                            checked={unscheduledObras.length > 0 && unscheduledObras.every(o => selectedIds.has(o.id))}
                            onChange={() => toggleSelectAll(unscheduledObras)}
                          />
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                          onClick={() => handleSort('numeroRegistro')}
                        >
                          <div className="flex items-center gap-1">
                            Reg. {sortConfig.key === 'numeroRegistro' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                          onClick={() => handleSort('situacao')}
                        >
                          <div className="flex items-center gap-1">
                            Status {sortConfig.key === 'situacao' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                          onClick={() => handleSort('prioridade')}
                        >
                          <div className="flex items-center gap-1">
                            Prior. {sortConfig.key === 'prioridade' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                          onClick={() => handleSort('cliente')}
                        >
                          <div className="flex items-center gap-1">
                            Cliente {sortConfig.key === 'cliente' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center cursor-pointer hover:bg-slate-100/50 transition-colors"
                          onClick={() => handleSort('dataContrato')}
                        >
                          <div className="flex items-center justify-center gap-1">
                            Dias {sortConfig.key === 'dataContrato' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                          onClick={() => handleSort('local')}
                        >
                          <div className="flex items-center gap-1">
                            Local {sortConfig.key === 'local' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                          onClick={() => handleSort('vendedor')}
                        >
                          <div className="flex items-center gap-1">
                            Vend. {sortConfig.key === 'vendedor' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                          onClick={() => handleSort('equipe')}
                        >
                          <div className="flex items-center gap-1">
                            Equipe {sortConfig.key === 'equipe' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                          onClick={() => handleSort('dataContrato')}
                        >
                          <div className="flex items-center gap-1">
                            Contrato {sortConfig.key === 'dataContrato' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th 
                          className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                          onClick={() => handleSort('formaPagamento')}
                        >
                          <div className="flex items-center gap-1">
                            Financ. {sortConfig.key === 'formaPagamento' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                          </div>
                        </th>
                        <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <AnimatePresence mode="popLayout">
                        {unscheduledObras.length > 0 ? (
                          unscheduledObras.map((obra) => (
                            <motion.tr 
                              key={obra.id}
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              onClick={() => handleEdit(obra)}
                              className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                                obra.situacao === 'Pendente' 
                                  ? 'bg-amber-50/60 border-l-4 border-amber-400' 
                                  : obra.situacao === 'Em Espera'
                                  ? 'bg-slate-50/60 border-l-4 border-slate-400'
                                  : 'bg-blue-50/60 border-l-4 border-blue-400'
                              } ${selectedIds.has(obra.id) ? 'bg-indigo-50/80' : ''}`}
                            >
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-emerald-500"
                                  checked={selectedIds.has(obra.id)}
                                  onChange={() => toggleSelect(obra.id)}
                                />
                              </td>
                              <td className="px-3 py-3 whitespace-nowrap">
                                <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-1 rounded border border-indigo-100">
                                  #{obra.numeroRegistro}
                                </span>
                              </td>
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <select 
                                  value={obra.situacao}
                                  onChange={(e) => updateObraQuick(obra.id, 'situacao', e.target.value)}
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border outline-none transition-all ${
                                    obra.situacao === 'Pendente' 
                                      ? 'bg-amber-100 text-amber-700 border-amber-200' 
                                      : obra.situacao === 'Em Espera'
                                      ? 'bg-slate-100 text-slate-700 border-slate-200'
                                      : 'bg-blue-100 text-blue-700 border-blue-200'
                                  }`}
                                >
                                  <option value="Pendente">Pendente</option>
                                  <option value="Em Andamento">Em Andamento</option>
                                  <option value="Concluído">Concluído</option>
                                  <option value="Em Espera">Em Espera</option>
                                </select>
                              </td>
                              <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                                <select 
                                  value={obra.prioridade}
                                  onChange={(e) => updateObraQuick(obra.id, 'prioridade', e.target.value)}
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border outline-none transition-all ${
                                    obra.prioridade === 'Alta' 
                                      ? 'bg-red-50 text-red-700 border-red-100' 
                                      : obra.prioridade === 'Média'
                                      ? 'bg-amber-50 text-amber-700 border-amber-100'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                  }`}
                                >
                                  <option value="Alta">Alta</option>
                                  <option value="Média">Média</option>
                                  <option value="Baixa">Baixa</option>
                                </select>
                              </td>
                              <td className="px-3 py-3">
                                <div className="text-xs font-bold text-slate-900 min-w-[120px] cursor-pointer hover:text-indigo-600 transition-colors flex items-center gap-1 group/name">
                                  <span onClick={() => handleEdit(obra)} className="flex-1 truncate" title="Clique para editar informações">{obra.cliente}</span>
                                  {obra.txtFile && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); setViewingTxt(obra.txtFile || null); }}
                                      className="p-1 text-indigo-500 hover:text-indigo-700 transition-all hover:scale-110 flex-none"
                                      title="Ver TXT"
                                    >
                                      <FileText size={14} />
                                    </button>
                                  )}
                                </div>
                                {obra.observacoes && (
                                  <div className="text-[10px] text-slate-500 mt-0.5 max-w-[200px] truncate" title={obra.observacoes}>
                                    {obra.observacoes}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                <div className={`text-[10px] font-bold px-2 py-1 rounded text-center ${
                                  (() => {
                                    const dias = getDaysDiff(obra.dataContrato);
                                    return dias > 30 ? 'bg-red-100 text-red-700' : dias > 15 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
                                  })()
                                }`}>
                                  {getDaysDiff(obra.dataContrato)} d
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                <div className="text-[10px] text-slate-600 min-w-[100px]">{obra.local || '---'}</div>
                              </td>
                              {renderEditableCell(obra.id, 'vendedor', 'obra', obra.vendedor || '', 'vendedor')}
                              {renderEditableCell(
                                obra.id,
                                'equipe',
                                'obra',
                                obra.equipe || '',
                                'equipe',
                                <div className="font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-1">
                                  <span>{obra.equipe || '---'}</span>
                                  <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                                </div>
                              )}
                              {renderEditableCell(
                                obra.id,
                                'dataContrato',
                                'obra',
                                obra.dataContrato || '',
                                'date',
                                <div className="flex flex-col text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer">
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                    <Calendar size={10} /> {formatDateBR(obra.dataContrato)}
                                  </div>
                                  <div className="text-[12px] font-black uppercase opacity-80 mt-0.5 flex items-center justify-between gap-1">
                                    <span>{getDayOfWeek(obra.dataContrato)}</span>
                                    <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                                  </div>
                                </div>
                              )}
                              <td className="px-3 py-3 whitespace-nowrap">
                                <div className="text-sm font-bold text-slate-900 leading-tight">R$ {obra.valorReceber.toLocaleString('pt-BR')}</div>
                                <div className="text-[10px] text-slate-500 uppercase tracking-tight flex flex-wrap items-center gap-1.5 mt-1">
                                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 font-bold">{obra.quantidadePlacas} Placas</span>
                                  <div 
                                    className="cursor-pointer hover:scale-105 transition-transform"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingPayment({ id: obra.id.toString(), type: 'obra' });
                                    }}
                                  >
                                    {editingPayment?.id === obra.id.toString() && editingPayment.type === 'obra' ? (
                                      <select
                                        autoFocus
                                        className="text-[10px] bg-white border border-indigo-300 rounded px-1 outline-none"
                                        value={obra.formaPagamento || ''}
                                        onBlur={() => setEditingPayment(null)}
                                        onChange={(e) => {
                                          updateObraQuick(obra.id as any, 'formaPagamento' as any, e.target.value);
                                          setEditingPayment(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <option value="">Selecione</option>
                                        {formasPagamento.filter(f => f.ativo).map(f => (
                                          <option key={f.id} value={f.nome}>{f.nome}</option>
                                        ))}
                                        <option value="Outros">Outros</option>
                                      </select>
                                    ) : (
                                      <span className="text-indigo-700 font-black bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 shadow-sm" title="Forma de Pagamento">
                                        {obra.formaPagamento || 'DEFINIR PGTO'}
                                      </span>
                                    )}
                                  </div>
                                  <div 
                                    className="cursor-pointer hover:scale-105 transition-transform"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingPayment({ id: obra.id.toString(), type: 'obra-situacao' as any });
                                    }}
                                  >
                                    {editingPayment?.id === obra.id.toString() && editingPayment.type === 'obra-situacao' ? (
                                      <select
                                        autoFocus
                                        className="text-[10px] bg-white border border-indigo-300 rounded px-1 outline-none font-bold"
                                        value={obra.situacaoPagamento || ''}
                                        onBlur={() => setEditingPayment(null)}
                                        onChange={(e) => {
                                          updateObraQuick(obra.id as any, 'situacaoPagamento' as any, e.target.value);
                                          setEditingPayment(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <option value="">Status</option>
                                        <option value="À Vista">À Vista</option>
                                        <option value="Pago">Pago</option>
                                        <option value="A Pagar">A Pagar</option>
                                      </select>
                                    ) : (
                                      <span className={`font-black px-2 py-0.5 rounded border shadow-sm ${
                                        obra.situacaoPagamento === 'À Vista' 
                                          ? 'bg-sky-50 text-sky-700 border-sky-100'
                                          : obra.situacaoPagamento === 'Pago'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                          : 'bg-rose-50 text-rose-700 border-rose-100'
                                      }`} title="Situação de Pagamento">
                                        {obra.situacaoPagamento || 'A Pagar'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  <button 
                                    onClick={() => { setSelectedObra(obra); setIsDetailsModalOpen(true); }}
                                    className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                                    title="Ver Detalhes"
                                  >
                                    <Eye size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleEdit(obra)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                    title="Editar"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  {canDelete && (
                                    <button 
                                      onClick={() => handleDelete(obra.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                                      title="Excluir"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </motion.tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={12} className="px-6 py-8 text-center text-slate-400">
                              <p className="text-sm">Nenhuma obra em espera encontrada.</p>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Archived Obras - Spreadsheet Table */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-slate-700 flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-500" />
                    Obras Concluídas
                  </h2>
                  <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                    {archivedObras.length} obras
                  </span>
                  <button
                    onClick={() => setShowArchivedObras(!showArchivedObras)}
                    className={`ml-2 px-2 py-1 rounded-lg border flex items-center gap-1 text-[10px] font-bold transition-all duration-200 ${
                      showArchivedObras 
                        ? 'bg-slate-200 text-slate-700 border-slate-300' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    {showArchivedObras ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showArchivedObras ? 'OCULTAR' : 'CLIQUE PARA VISUALIZAR'}
                  </button>
                  {archivedObras.length > 0 && (
                    <button
                      onClick={() => setIsSelectPeriodModalOpen(true)}
                      className="ml-2 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white border border-indigo-750 rounded-lg flex items-center gap-1.5 text-[10px] font-extrabold transition-all shadow-sm cursor-pointer"
                      title="Gerar Relatório de Clientes e Vendedores"
                    >
                      <FileText size={12} />
                      GERAR RELATÓRIO DETALHADO (CLIENTE x VENDEDOR)
                    </button>
                  )}
                </div>
                
                {/* Local Filters for Archive */}
                {showArchivedObras && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Filtrar cliente..."
                        value={filtrosArquivados.cliente}
                        onChange={(e) => setFiltrosArquivados(prev => ({ ...prev, cliente: e.target.value }))}
                        className="bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-[10px] focus:ring-2 focus:ring-emerald-500 outline-none w-40"
                      />
                    </div>
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Filtrar vendedor..."
                        value={filtrosArquivados.vendedor}
                        onChange={(e) => setFiltrosArquivados(prev => ({ ...prev, vendedor: e.target.value }))}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] focus:ring-2 focus:ring-emerald-500 outline-none w-32"
                      />
                    </div>
                    {(filtrosArquivados.cliente || filtrosArquivados.vendedor) && (
                      <button 
                        onClick={() => setFiltrosArquivados({ cliente: '', vendedor: '' })}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                        title="Limpar Filtros"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              {showArchivedObras && (
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-200">
                      <th className="px-3 py-3 w-10">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                          checked={archivedObras.length > 0 && archivedObras.every(o => selectedIds.has(o.id))}
                          onChange={() => toggleSelectAll(archivedObras)}
                        />
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSort('numeroRegistro')}
                      >
                        <div className="flex items-center gap-1">
                          Registro {sortConfig.key === 'numeroRegistro' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dias</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Local</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendedor</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Equipe</th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSort('dataConclusao')}
                      >
                        <div className="flex items-center gap-1">
                          Conclusão {sortConfig.key === 'dataConclusao' && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <AnimatePresence mode="popLayout">
                      {archivedObras.length > 0 ? (
                        archivedObras.map((obra) => (
                          <motion.tr 
                            key={obra.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => handleEdit(obra)}
                            className={`cursor-pointer hover:bg-slate-50 transition-colors bg-emerald-50/40 border-l-4 border-emerald-400 ${selectedIds.has(obra.id) ? 'bg-emerald-100/80' : ''}`}
                          >
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                checked={selectedIds.has(obra.id)}
                                onChange={() => toggleSelect(obra.id)}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                #{obra.numeroRegistro}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-xs font-bold text-slate-900 min-w-[120px] cursor-pointer hover:text-indigo-600 transition-colors flex items-center gap-1 group/name">
                                <span onClick={() => handleEdit(obra)} className="flex-1 truncate" title="Clique para editar informações">{obra.cliente}</span>
                                {obra.txtFile && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setViewingTxt(obra.txtFile || null); }}
                                    className="p-1 text-indigo-500 hover:text-indigo-700 transition-all hover:scale-110 flex-none"
                                    title="Ver TXT"
                                  >
                                    <FileText size={14} />
                                  </button>
                                )}
                              </div>
                              {obra.observacoes && (
                                <div className="text-[10px] text-slate-500 mt-0.5 max-w-[200px] truncate" title={obra.observacoes}>
                                  {obra.observacoes}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-[10px] text-slate-500 font-medium whitespace-nowrap">
                              {getDaysDiff(obra.dataContrato)} d
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] text-slate-500 min-w-[100px]">{obra.local || '---'}</div>
                            </td>
                            {renderEditableCell(obra.id, 'vendedor', 'obra', obra.vendedor || '', 'vendedor')}
                            {renderEditableCell(
                              obra.id,
                              'equipe',
                              'obra',
                              obra.equipe || '',
                              'equipe',
                              <div className="font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-1">
                                <span>{obra.equipe || '---'}</span>
                                <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                              </div>
                            )}
                            {renderEditableCell(
                              obra.id,
                              'dataConclusao',
                              'obra',
                              obra.dataConclusao || '',
                              'date',
                              <div className="flex flex-col text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                  <Calendar size={10} /> {formatDateBR(obra.dataConclusao)}
                                </div>
                                <div className="text-[12px] font-black uppercase opacity-80 mt-0.5 flex items-center justify-between gap-1">
                                  <span>{getDayOfWeek(obra.dataConclusao)}</span>
                                  <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                                </div>
                              </div>
                            )}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <div className="text-sm font-bold text-slate-900 leading-tight">R$ {obra.valorReceber.toLocaleString('pt-BR')}</div>
                              <div className="text-[10px] text-slate-500 uppercase tracking-tight flex flex-wrap items-center gap-1.5 mt-1">
                                <div 
                                  className="cursor-pointer hover:scale-105 transition-transform"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPayment({ id: obra.id.toString(), type: 'obra' });
                                  }}
                                >
                                  {editingPayment?.id === obra.id.toString() && editingPayment.type === 'obra' ? (
                                    <select
                                      autoFocus
                                      className="text-[10px] bg-white border border-indigo-300 rounded px-1 outline-none"
                                      value={obra.formaPagamento || ''}
                                      onBlur={() => setEditingPayment(null)}
                                      onChange={(e) => {
                                        updateObraQuick(obra.id as any, 'formaPagamento' as any, e.target.value);
                                        setEditingPayment(null);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="">Selecione</option>
                                      {formasPagamento.filter(f => f.ativo).map(f => (
                                        <option key={f.id} value={f.nome}>{f.nome}</option>
                                      ))}
                                      <option value="Outros">Outros</option>
                                    </select>
                                  ) : (
                                    <span className="text-indigo-700 font-black bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 shadow-sm" title="Forma de Pagamento">
                                      {obra.formaPagamento || 'DEFINIR PGTO'}
                                    </span>
                                  )}
                                </div>
                                <div 
                                  className="cursor-pointer hover:scale-105 transition-transform"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPayment({ id: obra.id.toString(), type: 'obra-situacao' as any });
                                  }}
                                >
                                  {editingPayment?.id === obra.id.toString() && editingPayment.type === 'obra-situacao' ? (
                                    <select
                                      autoFocus
                                      className="text-[10px] bg-white border border-indigo-300 rounded px-1 outline-none font-bold"
                                      value={obra.situacaoPagamento || ''}
                                      onBlur={() => setEditingPayment(null)}
                                      onChange={(e) => {
                                        updateObraQuick(obra.id as any, 'situacaoPagamento' as any, e.target.value);
                                        setEditingPayment(null);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <option value="">Status</option>
                                      <option value="À Vista">À Vista</option>
                                      <option value="Pago">Pago</option>
                                      <option value="A Pagar">A Pagar</option>
                                    </select>
                                  ) : (
                                    <span className={`font-black px-2 py-0.5 rounded border shadow-sm ${
                                      obra.situacaoPagamento === 'À Vista' 
                                        ? 'bg-sky-50 text-sky-700 border-sky-100'
                                        : obra.situacaoPagamento === 'Pago'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                        : 'bg-rose-50 text-rose-700 border-rose-100'
                                    }`} title="Situação de Pagamento">
                                      {obra.situacaoPagamento || 'A Pagar'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button 
                                  onClick={() => { setSelectedObra(obra); setIsDetailsModalOpen(true); }}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                                >
                                  <Eye size={16} />
                                </button>
                                <button 
                                  onClick={() => handleEdit(obra)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                >
                                  <Edit size={16} />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={10} className="px-6 py-8 text-center text-slate-400">
                            <p className="text-sm">Nenhum registro arquivado.</p>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section: Serviços Agendados */}
          {!hideScheduledServicos && (
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
              <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                <h2 className="font-bold text-indigo-700 flex items-center gap-2">
                  <Calendar size={18} className="text-indigo-600" />
                  Serviços Agendados
                </h2>
                <span className="text-xs font-bold text-indigo-600 bg-white px-2 py-1 rounded-lg border border-indigo-200 shadow-sm">
                  {scheduledServicosList.length} registros
                </span>
              </div>
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-200">
                      <th className="px-3 py-3 w-10">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          checked={scheduledServicosList.length > 0 && scheduledServicosList.every(s => selectedIds.has(s.id))}
                          onChange={() => toggleSelectAll(scheduledServicosList)}
                        />
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('numeroRegistro')}
                      >
                        <div className="flex items-center gap-1">
                          N° {sortConfigServicos.key === 'numeroRegistro' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('situacao')}
                      >
                        <div className="flex items-center gap-1">
                          Situação {sortConfigServicos.key === 'situacao' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('prioridade')}
                      >
                        <div className="flex items-center gap-1">
                          Prioridade {sortConfigServicos.key === 'prioridade' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('dataAtendimento')}
                      >
                        <div className="flex items-center gap-1">
                          Atendimento {sortConfigServicos.key === 'dataAtendimento' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('dataAtendimento')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Dias {sortConfigServicos.key === 'dataAtendimento' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('cliente')}
                      >
                        <div className="flex items-center gap-1">
                          Cliente {sortConfigServicos.key === 'cliente' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('local')}
                      >
                        <div className="flex items-center gap-1">
                          Local {sortConfigServicos.key === 'local' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('vendedor')}
                      >
                        <div className="flex items-center gap-1">
                          Vendedor {sortConfigServicos.key === 'vendedor' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('equipeServico')}
                      >
                        <div className="flex items-center gap-1">
                          Equipe {sortConfigServicos.key === 'equipeServico' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('servico')}
                      >
                        <div className="flex items-center gap-1">
                          Serviço {sortConfigServicos.key === 'servico' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('valor')}
                      >
                        <div className="flex items-center gap-1">
                          Valor {sortConfigServicos.key === 'valor' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('equipeInstalou')}
                      >
                        <div className="flex items-center gap-1">
                          Instalou {sortConfigServicos.key === 'equipeInstalou' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('dataServico')}
                      >
                        <div className="flex items-center gap-1">
                          Data {sortConfigServicos.key === 'dataServico' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('formaPagamento')}
                      >
                        <div className="flex items-center gap-1">
                          Financ. {sortConfigServicos.key === 'formaPagamento' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <AnimatePresence mode="popLayout">
                      {scheduledServicosList.length > 0 ? (
                        scheduledServicosList.map((servico) => (
                          <motion.tr 
                            key={servico.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => handleServicoEdit(servico)}
                            className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                              servico.situacao === 'Em Espera'
                                ? 'bg-slate-50/20 border-l-4 border-slate-400 opacity-60'
                                : servico.situacao === 'Pendente'
                                ? 'bg-amber-50/20 border-l-4 border-amber-400'
                                : 'bg-blue-50/20 border-l-4 border-blue-400'
                            } ${selectedIds.has(servico.id) ? 'bg-indigo-100/50' : ''}`}
                          >
                            <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                checked={selectedIds.has(servico.id)}
                                onChange={() => toggleSelect(servico.id)}
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-1 rounded border border-indigo-100">
                                #{servico.numeroRegistro}
                              </span>
                            </td>
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              <select 
                                value={servico.situacao}
                                onChange={(e) => updateServicoQuick(servico.id, 'situacao', e.target.value)}
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border outline-none transition-all ${
                                  servico.situacao === 'Pendente' 
                                    ? 'bg-amber-100 text-amber-700 border-amber-200' 
                                    : servico.situacao === 'Em Espera'
                                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                                    : 'bg-blue-100 text-blue-700 border-blue-200'
                                }`}
                              >
                                <option value="Pendente">Pendente</option>
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Concluído">Concluído</option>
                                <option value="Em Espera">Em Espera</option>
                              </select>
                            </td>
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              <select 
                                value={servico.prioridade}
                                onChange={(e) => updateServicoQuick(servico.id, 'prioridade', e.target.value)}
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border outline-none transition-all ${
                                  servico.prioridade === 'Alta' 
                                    ? 'bg-red-50 text-red-700 border-red-100' 
                                    : servico.prioridade === 'Média'
                                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                }`}
                              >
                                <option value="Alta">Alta</option>
                                <option value="Média">Média</option>
                                <option value="Baixa">Baixa</option>
                              </select>
                            </td>
                            {renderEditableCell(
                              servico.id,
                              'dataAtendimento',
                              'servico',
                              servico.dataAtendimento || '',
                              'date',
                              <span className="text-[10px] font-semibold text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer">
                                {formatDateBR(servico.dataAtendimento)}
                              </span>
                            )}
                            <td className="px-3 py-3 text-center">
                              <div className={`text-[10px] font-bold px-2 py-1 rounded inline-block ${
                                (() => {
                                  const dias = getDaysDiff(servico.dataAtendimento);
                                  return dias > 30 ? 'bg-red-100 text-red-700' : dias > 15 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
                                })()
                              }`}>
                                {getDaysDiff(servico.dataAtendimento)} d
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-xs font-bold text-slate-900 min-w-[120px] cursor-pointer hover:text-indigo-600 transition-colors flex items-center gap-1 group/name">
                                <span onClick={() => handleServicoEdit(servico)} className="flex-1 truncate" title="Clique para editar informações">{servico.cliente}</span>
                                {servico.txtFile && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setViewingTxt(servico.txtFile || null); }}
                                    className="p-1 text-indigo-500 hover:text-indigo-700 transition-all hover:scale-110 flex-none"
                                    title="Ver TXT"
                                  >
                                    <FileText size={14} />
                                  </button>
                                )}
                              </div>
                              {servico.observacao && (
                                <div className="text-[10px] text-slate-500 mt-0.5 max-w-[200px] truncate" title={servico.observacao}>
                                  {servico.observacao}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] text-slate-600 min-w-[100px]">{servico.local || '---'}</div>
                            </td>
                            {renderEditableCell(servico.id, 'vendedor', 'servico', servico.vendedor || '', 'vendedor')}
                            {renderEditableCell(
                              servico.id,
                              'equipeServico',
                              'servico',
                              servico.equipeServico || '',
                              'equipe',
                              <div className="font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-1">
                                <span>{servico.equipeServico || '---'}</span>
                                <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                              </div>
                            )}
                            <td className="px-3 py-3 text-[10px] font-semibold text-slate-600 min-w-[120px]">{servico.servico || '---'}</td>
                            <td className="px-3 py-3 text-[17px] font-bold text-slate-900 whitespace-nowrap leading-tight">R$ {Number(servico.valor).toLocaleString('pt-BR')}</td>
                            {renderEditableCell(
                              servico.id,
                              'equipeInstalou',
                              'servico',
                              servico.equipeInstalou || '',
                              'equipe',
                              <div className="font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-1">
                                <span>{servico.equipeInstalou || '---'}</span>
                                <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                              </div>
                            )}
                            {renderEditableCell(
                              servico.id,
                              'dataServico',
                              'servico',
                              servico.dataServico || '',
                              'date',
                              <div className="flex flex-col text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer">
                                <span className="font-bold whitespace-nowrap">{formatDateBR(servico.dataServico)}</span>
                                <div className="text-[12px] uppercase font-black opacity-80 mt-0.5 flex items-center justify-between gap-1">
                                  <span>{getDayOfWeek(servico.dataServico)}</span>
                                  <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                                </div>
                              </div>
                            )}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <div 
                                className="cursor-pointer hover:scale-105 transition-transform inline-block"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingPayment({ id: servico.id.toString(), type: 'servico' });
                                }}
                              >
                                {editingPayment?.id === servico.id.toString() && editingPayment.type === 'servico' ? (
                                  <select
                                    autoFocus
                                    className="text-[10px] bg-white border border-indigo-300 rounded px-1 outline-none"
                                    value={servico.formaPagamento || ''}
                                    onBlur={() => setEditingPayment(null)}
                                    onChange={(e) => {
                                      updateServicoQuick(servico.id, 'formaPagamento', e.target.value);
                                      setEditingPayment(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="">Selecione</option>
                                    {formasPagamento.filter(f => f.ativo).map(f => (
                                      <option key={f.id} value={f.nome}>{f.nome}</option>
                                    ))}
                                    <option value="Outros">Outros</option>
                                  </select>
                                ) : (
                                  <div className="text-[13px] font-black text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-200 shadow-sm inline-block truncate max-w-[100px]">
                                    {servico.formaPagamento || 'DEFINIR PGTO'}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button 
                                  onClick={() => gerarReciboServicoPDF(servico)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                                  title="Gerar Recibo PDF"
                                >
                                  <Printer size={16} />
                                </button>
                                <button 
                                  onClick={() => { setSelectedServico(servico); setIsDetailsModalOpen(true); }}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                                  title="Ver Detalhes"
                                >
                                  <Eye size={16} />
                                </button>
                                <button 
                                  onClick={() => handleServicoEdit(servico)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                  title="Editar"
                                >
                                  <Edit size={16} />
                                </button>
                                {canDelete && (
                                  <button 
                                    onClick={() => { setServicoToDelete(servico.id); setIsDeleteModalOpen(true); }}
                                    className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                                    title="Excluir"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={16} className="px-6 py-10 text-center text-slate-400">
                            Nenhum serviço agendado.
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </section>
          )}


            {/* Section: Pendentes */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-bold text-slate-700 flex items-center gap-2">
                  <Clock size={18} className="text-amber-500" />
                  Serviços Pendentes
                </h2>
                <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                  {pendingServicos.length} aguardando
                </span>
              </div>
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-200">
                      <th className="px-3 py-3 w-10">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          checked={pendingServicos.length > 0 && pendingServicos.every(s => selectedIds.has(s.id))}
                          onChange={() => toggleSelectAll(pendingServicos)}
                        />
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('numeroRegistro')}
                      >
                        <div className="flex items-center gap-1">
                          N° {sortConfigServicos.key === 'numeroRegistro' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('situacao')}
                      >
                        <div className="flex items-center gap-1">
                          Situação {sortConfigServicos.key === 'situacao' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('prioridade')}
                      >
                        <div className="flex items-center gap-1">
                          Prioridade {sortConfigServicos.key === 'prioridade' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('dataAtendimento')}
                      >
                        <div className="flex items-center gap-1">
                          Atendimento {sortConfigServicos.key === 'dataAtendimento' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('dataAtendimento')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Dias {sortConfigServicos.key === 'dataAtendimento' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('cliente')}
                      >
                        <div className="flex items-center gap-1">
                          Cliente {sortConfigServicos.key === 'cliente' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('local')}
                      >
                        <div className="flex items-center gap-1">
                          Local {sortConfigServicos.key === 'local' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('vendedor')}
                      >
                        <div className="flex items-center gap-1">
                          Vendedor {sortConfigServicos.key === 'vendedor' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('equipeServico')}
                      >
                        <div className="flex items-center gap-1">
                          Equipe {sortConfigServicos.key === 'equipeServico' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('servico')}
                      >
                        <div className="flex items-center gap-1">
                          Serviço {sortConfigServicos.key === 'servico' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('valor')}
                      >
                        <div className="flex items-center gap-1">
                          Valor {sortConfigServicos.key === 'valor' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('equipeInstalou')}
                      >
                        <div className="flex items-center gap-1">
                          Instalou {sortConfigServicos.key === 'equipeInstalou' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('dataServico')}
                      >
                        <div className="flex items-center gap-1">
                          Data {sortConfigServicos.key === 'dataServico' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <AnimatePresence mode="popLayout">
                      {pendingServicos.length > 0 ? (
                        pendingServicos.map((servico) => (
                          <motion.tr 
                            key={servico.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => handleServicoEdit(servico)}
                            className={`cursor-pointer hover:bg-slate-50 transition-colors ${
                              servico.situacao === 'Em Espera'
                                ? 'bg-slate-50/20 border-l-4 border-slate-400 opacity-60'
                                : 'bg-amber-50/20 border-l-4 border-amber-400'
                            } ${selectedIds.has(servico.id) ? 'bg-indigo-100/50' : ''}`}
                          >
                            <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                checked={selectedIds.has(servico.id)}
                                onChange={() => toggleSelect(servico.id)}
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-1 rounded border border-indigo-100">
                                #{servico.numeroRegistro}
                              </span>
                            </td>
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              <select 
                                value={servico.situacao}
                                onChange={(e) => updateServicoQuick(servico.id, 'situacao', e.target.value)}
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border outline-none transition-all ${
                                  servico.situacao === 'Pendente' 
                                    ? 'bg-amber-100 text-amber-700 border-amber-200' 
                                    : servico.situacao === 'Em Espera'
                                    ? 'bg-slate-100 text-slate-700 border-slate-200'
                                    : 'bg-blue-100 text-blue-700 border-blue-200'
                                }`}
                              >
                                <option value="Pendente">Pendente</option>
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Concluído">Concluído</option>
                                <option value="Em Espera">Em Espera</option>
                              </select>
                            </td>
                            <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                              <select 
                                value={servico.prioridade}
                                onChange={(e) => updateServicoQuick(servico.id, 'prioridade', e.target.value)}
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border outline-none transition-all ${
                                  servico.prioridade === 'Alta' 
                                    ? 'bg-red-50 text-red-700 border-red-100' 
                                    : servico.prioridade === 'Média'
                                    ? 'bg-amber-50 text-amber-700 border-amber-100'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                }`}
                              >
                                <option value="Alta">Alta</option>
                                <option value="Média">Média</option>
                                <option value="Baixa">Baixa</option>
                              </select>
                            </td>
                            {renderEditableCell(
                              servico.id,
                              'dataAtendimento',
                              'servico',
                              servico.dataAtendimento || '',
                              'date',
                              <span className="text-[10px] font-semibold text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer">
                                {formatDateBR(servico.dataAtendimento)}
                              </span>
                            )}
                            <td className="px-3 py-3 text-center">
                              <div className={`text-[10px] font-bold px-2 py-1 rounded inline-block ${
                                (() => {
                                  const dias = getDaysDiff(servico.dataAtendimento);
                                  return dias > 30 ? 'bg-red-100 text-red-700' : dias > 15 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
                                })()
                              }`}>
                                {getDaysDiff(servico.dataAtendimento)} d
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-xs font-bold text-slate-900 min-w-[120px] cursor-pointer hover:text-indigo-600 transition-colors flex items-center gap-1 group/name">
                                <span onClick={() => handleServicoEdit(servico)} className="flex-1 truncate" title="Clique para editar informações">{servico.cliente}</span>
                                {servico.txtFile && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setViewingTxt(servico.txtFile || null); }}
                                    className="p-1 text-indigo-500 hover:text-indigo-700 transition-all hover:scale-110 flex-none"
                                    title="Ver TXT"
                                  >
                                    <FileText size={14} />
                                  </button>
                                )}
                              </div>
                              {servico.observacao && (
                                <div className="text-[10px] text-slate-500 mt-0.5 max-w-[200px] truncate" title={servico.observacao}>
                                  {servico.observacao}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] text-slate-600 min-w-[100px]">{servico.local || '---'}</div>
                            </td>
                            {renderEditableCell(servico.id, 'vendedor', 'servico', servico.vendedor || '', 'vendedor')}
                            {renderEditableCell(
                              servico.id,
                              'equipeServico',
                              'servico',
                              servico.equipeServico || '',
                              'equipe',
                              <div className="font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-1">
                                <span>{servico.equipeServico || '---'}</span>
                                <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                              </div>
                            )}
                            <td className="px-3 py-3 text-[10px] font-semibold text-slate-600 min-w-[120px]">{servico.servico || '---'}</td>
                            <td className="px-3 py-3 text-[17px] font-bold text-slate-900 whitespace-nowrap leading-tight">R$ {Number(servico.valor).toLocaleString('pt-BR')}</td>
                            {renderEditableCell(
                              servico.id,
                              'equipeInstalou',
                              'servico',
                              servico.equipeInstalou || '',
                              'equipe',
                              <div className="font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-1">
                                <span>{servico.equipeInstalou || '---'}</span>
                                <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                              </div>
                            )}
                            {renderEditableCell(
                              servico.id,
                              'dataServico',
                              'servico',
                              servico.dataServico || '',
                              'date',
                              <div className="flex flex-col text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 px-2 py-1 rounded border border-transparent hover:border-indigo-200 hover:shadow-xs transition-all cursor-pointer">
                                <span className="font-bold whitespace-nowrap">{formatDateBR(servico.dataServico)}</span>
                                <div className="text-[12px] uppercase font-black opacity-80 mt-0.5 flex items-center justify-between gap-1">
                                  <span>{getDayOfWeek(servico.dataServico)}</span>
                                  <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                                </div>
                              </div>
                            )}
                            <td className="px-3 py-3 whitespace-nowrap">
                              <div 
                                className="cursor-pointer hover:scale-105 transition-transform inline-block"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingPayment({ id: servico.id.toString(), type: 'servico' });
                                }}
                              >
                                {editingPayment?.id === servico.id.toString() && editingPayment.type === 'servico' ? (
                                  <select
                                    autoFocus
                                    className="text-[10px] bg-white border border-indigo-300 rounded px-1 outline-none"
                                    value={servico.formaPagamento || ''}
                                    onBlur={() => setEditingPayment(null)}
                                    onChange={(e) => {
                                      updateServicoQuick(servico.id, 'formaPagamento', e.target.value);
                                      setEditingPayment(null);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="">Selecione</option>
                                    {formasPagamento.filter(f => f.ativo).map(f => (
                                      <option key={f.id} value={f.nome}>{f.nome}</option>
                                    ))}
                                    <option value="Outros">Outros</option>
                                  </select>
                                ) : (
                                  <div className="text-[13px] font-black text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-200 shadow-sm inline-block truncate max-w-[100px]">
                                    {servico.formaPagamento || 'DEFINIR PGTO'}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button 
                                  onClick={() => gerarReciboServicoPDF(servico)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                                  title="Gerar Recibo PDF"
                                >
                                  <Printer size={16} />
                                </button>
                                <button 
                                  onClick={() => { setSelectedServico(servico); setIsDetailsModalOpen(true); }}
                                  className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                                  title="Ver Detalhes"
                                >
                                  <Eye size={16} />
                                </button>
                                <button 
                                  onClick={() => handleServicoEdit(servico)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                  title="Editar"
                                >
                                  <Edit size={16} />
                                </button>
                                {canDelete && (
                                  <button 
                                    onClick={() => { setServicoToDelete(servico.id); setIsDeleteModalOpen(true); }}
                                    className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                                    title="Excluir"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={15} className="px-6 py-10 text-center text-slate-400">
                            Nenhum serviço pendente.
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Archived Servicos */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-slate-700 flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-500" />
                    Serviços Concluídos
                  </h2>
                  <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                    {archivedServicos.length} serviços
                  </span>
                  <button
                    onClick={() => setShowArchivedServicos(!showArchivedServicos)}
                    className={`ml-2 px-2 py-1 rounded-lg border flex items-center gap-1 text-[10px] font-bold transition-all duration-200 ${
                      showArchivedServicos 
                        ? 'bg-slate-200 text-slate-700 border-slate-300' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    {showArchivedServicos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showArchivedServicos ? 'OCULTAR' : 'CLIQUE PARA VISUALIZAR'}
                  </button>
                </div>

                {/* Local Filters for Archive */}
                {showArchivedServicos && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Filtrar cliente..."
                        value={filtrosArquivados.cliente}
                        onChange={(e) => setFiltrosArquivados(prev => ({ ...prev, cliente: e.target.value }))}
                        className="bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-[10px] focus:ring-2 focus:ring-emerald-500 outline-none w-40"
                      />
                    </div>
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Filtrar vendedor..."
                        value={filtrosArquivados.vendedor}
                        onChange={(e) => setFiltrosArquivados(prev => ({ ...prev, vendedor: e.target.value }))}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] focus:ring-2 focus:ring-emerald-500 outline-none w-32"
                      />
                    </div>
                    {(filtrosArquivados.cliente || filtrosArquivados.vendedor) && (
                      <button 
                        onClick={() => setFiltrosArquivados({ cliente: '', vendedor: '' })}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                        title="Limpar Filtros"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              
              {showArchivedServicos && (
                <div className="overflow-x-auto scrollbar-hide">
                  <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-200">
                      <th className="px-3 py-3 w-10">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                          checked={archivedServicos.length > 0 && archivedServicos.every(s => selectedIds.has(s.id))}
                          onChange={() => toggleSelectAll(archivedServicos)}
                        />
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('numeroRegistro')}
                      >
                        <div className="flex items-center gap-1">
                          N° {sortConfigServicos.key === 'numeroRegistro' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('situacao')}
                      >
                        <div className="flex items-center gap-1">
                          Situação {sortConfigServicos.key === 'situacao' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('prioridade')}
                      >
                        <div className="flex items-center gap-1">
                          Prioridade {sortConfigServicos.key === 'prioridade' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('dataAtendimento')}
                      >
                        <div className="flex items-center gap-1">
                          Atendimento {sortConfigServicos.key === 'dataAtendimento' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('dataAtendimento')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Dias {sortConfigServicos.key === 'dataAtendimento' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('cliente')}
                      >
                        <div className="flex items-center gap-1">
                          Cliente {sortConfigServicos.key === 'cliente' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('local')}
                      >
                        <div className="flex items-center gap-1">
                          Local {sortConfigServicos.key === 'local' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('vendedor')}
                      >
                        <div className="flex items-center gap-1">
                          Vendedor {sortConfigServicos.key === 'vendedor' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('equipeServico')}
                      >
                        <div className="flex items-center gap-1">
                          Equipe {sortConfigServicos.key === 'equipeServico' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('servico')}
                      >
                        <div className="flex items-center gap-1">
                          Serviço {sortConfigServicos.key === 'servico' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('valor')}
                      >
                        <div className="flex items-center gap-1">
                          Valor {sortConfigServicos.key === 'valor' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('equipeInstalou')}
                      >
                        <div className="flex items-center gap-1">
                          Instalou {sortConfigServicos.key === 'equipeInstalou' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th 
                        className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100/50 transition-colors"
                        onClick={() => handleSortServicos('dataServico')}
                      >
                        <div className="flex items-center gap-1">
                          Data {sortConfigServicos.key === 'dataServico' && (sortConfigServicos.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                        </div>
                      </th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <AnimatePresence mode="popLayout">
                      {archivedServicos.length > 0 ? (
                        archivedServicos.map((servico) => (
                          <motion.tr 
                            key={servico.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => handleServicoEdit(servico)}
                            className={`cursor-pointer hover:bg-slate-50 transition-colors ${selectedIds.has(servico.id) ? 'bg-emerald-100/50' : ''}`}
                          >
                            <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                checked={selectedIds.has(servico.id)}
                                onChange={() => toggleSelect(servico.id)}
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-1 rounded border border-slate-200">
                                #{servico.numeroRegistro}
                              </span>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                Concluído
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-lg border ${
                                servico.prioridade === 'Alta' 
                                  ? 'bg-red-50 text-red-700 border-red-100' 
                                  : servico.prioridade === 'Média'
                                  ? 'bg-amber-50 text-amber-700 border-amber-100'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                              }`}>
                                {servico.prioridade}
                              </span>
                            </td>
                            {renderEditableCell(
                              servico.id,
                              'dataAtendimento',
                              'servico',
                              servico.dataAtendimento || '',
                              'date',
                              <span className="text-[10px] font-semibold text-slate-600 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 px-2 py-1 rounded border border-transparent hover:border-emerald-200 hover:shadow-xs transition-all cursor-pointer">
                                {formatDateBR(servico.dataAtendimento)}
                              </span>
                            )}
                            <td className="px-3 py-3 text-center">
                              <div className="text-[10px] font-bold px-2 py-1 rounded inline-block bg-slate-100 text-slate-600">
                                {getDaysDiff(servico.dataAtendimento)} d
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-xs font-bold text-slate-900 min-w-[120px] cursor-pointer hover:text-indigo-600 transition-colors flex items-center gap-1 group/name">
                                <span onClick={() => handleServicoEdit(servico)} className="flex-1 truncate" title="Clique para editar informações">{servico.cliente}</span>
                                {servico.txtFile && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setViewingTxt(servico.txtFile || null); }}
                                    className="p-1 text-indigo-500 hover:text-indigo-700 transition-all hover:scale-110 flex-none"
                                    title="Ver TXT"
                                  >
                                    <FileText size={14} />
                                  </button>
                                )}
                              </div>
                              {servico.observacao && (
                                <div className="text-[10px] text-slate-500 mt-0.5 max-w-[200px] truncate" title={servico.observacao}>
                                  {servico.observacao}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] text-slate-600 min-w-[100px]">{servico.local || '---'}</div>
                            </td>
                            {renderEditableCell(servico.id, 'vendedor', 'servico', servico.vendedor || '', 'vendedor')}
                            {renderEditableCell(
                              servico.id,
                              'equipeServico',
                              'servico',
                              servico.equipeServico || '',
                              'equipe',
                              <div className="font-medium text-slate-700 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 px-2 py-1 rounded border border-transparent hover:border-emerald-200 hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-1">
                                <span>{servico.equipeServico || '---'}</span>
                                <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                              </div>
                            )}
                            <td className="px-3 py-3 text-[10px] font-semibold text-slate-600 min-w-[120px]">{servico.servico || '---'}</td>
                            <td className="px-3 py-3 text-sm font-bold text-slate-900 whitespace-nowrap leading-tight text-slate-900">R$ {Number(servico.valor).toLocaleString('pt-BR')}</td>
                            {renderEditableCell(
                              servico.id,
                              'equipeInstalou',
                              'servico',
                              servico.equipeInstalou || '',
                              'equipe',
                              <div className="font-medium text-slate-700 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 px-2 py-1 rounded border border-transparent hover:border-emerald-200 hover:shadow-xs transition-all cursor-pointer inline-flex items-center gap-1">
                                <span>{servico.equipeInstalou || '---'}</span>
                                <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                              </div>
                            )}
                            {renderEditableCell(
                              servico.id,
                              'dataServico',
                              'servico',
                              servico.dataServico || '',
                              'date',
                              <div className="flex flex-col text-slate-600 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 px-2 py-1 rounded border border-transparent hover:border-emerald-200 hover:shadow-xs transition-all cursor-pointer">
                                <span className="font-bold whitespace-nowrap">{formatDateBR(servico.dataServico)}</span>
                                <div className="text-[12px] uppercase font-black opacity-80 mt-0.5 flex items-center justify-between gap-1">
                                  <span>{getDayOfWeek(servico.dataServico)}</span>
                                  <Edit size={8} className="opacity-0 group-hover/cell:opacity-100 text-indigo-500 shrink-0" />
                                </div>
                              </div>
                            )}
                            <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1">
                                <button 
                                  onClick={() => gerarReciboServicoPDF(servico)}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                                  title="Gerar Recibo PDF"
                                >
                                  <Printer size={16} />
                                </button>
                                <button onClick={() => { setSelectedServico(servico); setIsDetailsModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-blue-600"><Eye size={16} /></button>
                                <button onClick={() => handleServicoEdit(servico)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Edit size={16} /></button>
                                {canDelete && (
                                  <button onClick={() => { setServicoToDelete(servico.id); setIsDeleteModalOpen(true); }} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                                )}
                              </div>
                            </td>
                          </motion.tr>
                        ))
                      ) : (
                        <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400 italic">Nenhum serviço concluído.</td></tr>
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
            </section>
        </div>
      )}


        {/* Footer Actions */}
        {canExport && (
          <footer className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div className="flex flex-wrap items-center gap-3">
              <button 
                onClick={exportarTXT}
                className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                <FileText size={16} />
                Relatório TXT
              </button>
              <button 
                onClick={exportarXLS}
                className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-600 bg-white border border-slate-200 px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                <FileSpreadsheet size={16} />
                Exportar XLS
              </button>
              <button 
                onClick={exportarPDF}
                className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-red-600 bg-white border border-slate-200 px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                <FileText size={16} />
                Exportar PDF
              </button>
              <button 
                onClick={exportarJSON}
                className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                <FileJson size={16} />
                Backup JSON
              </button>
            </div>
            {canImport && (
              <div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileImport}
                  className="hidden" 
                  accept=".json,.xlsx,.xls"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-xl transition-all"
                >
                  <Upload size={16} />
                  Importar Backup
                </button>
              </div>
            )}
          </footer>
        )}
      </>
    )}
        </div>
      </main>

      {/* Floating Bulk Action Bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 border border-slate-700/50 backdrop-blur-md"
          >
            <div className="flex items-center gap-3 pr-6 border-r border-slate-700">
              <div className="bg-indigo-600 text-xs font-bold px-2 py-1 rounded-lg">
                {selectedIds.size}
              </div>
              <span className="text-sm font-medium text-slate-300">Selecionados</span>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => bulkUpdateStatus('Concluído')}
                className="flex items-center gap-2 hover:bg-white/10 px-3 py-2 rounded-xl text-sm font-bold transition-all text-emerald-400"
              >
                <CheckCircle2 size={18} />
                Concluir
              </button>
              
              <button 
                onClick={bulkExportXLS}
                className="flex items-center gap-2 hover:bg-white/10 px-3 py-2 rounded-xl text-sm font-bold transition-all text-blue-400"
              >
                <FileSpreadsheet size={18} />
                XLS
              </button>

              <button 
                onClick={bulkExportPDF}
                className="flex items-center gap-2 hover:bg-white/10 px-3 py-2 rounded-xl text-sm font-bold transition-all text-red-400"
              >
                <Download size={18} />
                PDF
              </button>

              <button 
                onClick={bulkExportTXT}
                className="flex items-center gap-2 hover:bg-white/10 px-3 py-2 rounded-xl text-sm font-bold transition-all text-emerald-400"
              >
                <FileText size={18} />
                TXT
              </button>

              {canDelete && (
                <button 
                  onClick={bulkDelete}
                  className="flex items-center gap-2 hover:bg-red-500/20 px-3 py-2 rounded-xl text-sm font-bold transition-all text-red-400 hover:text-red-300"
                >
                  <Trash2 size={18} />
                  Excluir
                </button>
              )}
            </div>

            <button 
              onClick={() => setSelectedIds(new Set())}
              className="ml-4 p-2 hover:bg-white/10 rounded-full text-slate-400 transition-colors"
              title="Limpar Seleção"
            >
              <X size={20} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Form */}
      <AnimatePresence>
        {(isFormOpen || isServicoFormOpen) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={activeTab === 'obras' ? resetForm : resetServicoForm}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-2 rounded-lg">
                    {(activeTab === 'obras' ? editandoId : editandoServicoId) ? <Edit size={24} /> : <Plus size={24} />}
                  </div>
                  <h2 className="text-xl font-bold">
                    {activeTab === 'obras' 
                      ? (editandoId ? `Editando Registro #${formData.numeroRegistro}` : 'Novo Registro de Obra')
                      : (editandoServicoId ? `Editando Serviço #${servicoFormData.numeroRegistro}` : 'Novo Agendamento de Serviço')
                    }
                  </h2>
                </div>
                <button onClick={activeTab === 'obras' ? resetForm : resetServicoForm} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              {activeTab === 'obras' ? (
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
                  {/* Section: Identificação */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <UserIcon size={16} />
                      Identificação e Status
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <FormField label="Situação">
                        <select 
                          name="situacao"
                          value={formData.situacao}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="Pendente">Pendente</option>
                          <option value="Em Andamento">Em Andamento</option>
                          <option value="Concluído">Concluído</option>
                          <option value="Em Espera">Em Espera</option>
                        </select>
                      </FormField>
                      <FormField label="Prioridade">
                        <select 
                          name="prioridade"
                          disabled={!canEditAllFields}
                          value={formData.prioridade}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          <option value="Alta">🔴 Alta</option>
                          <option value="Média">🟡 Média</option>
                          <option value="Baixa">🟢 Baixa</option>
                        </select>
                      </FormField>
                      <FormField label="Cliente">
                        <input 
                          type="text" 
                          name="cliente"
                          disabled={!canEditAllFields}
                          required
                          value={formData.cliente}
                          onChange={handleInputChange}
                          placeholder="Nome do cliente"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="Vendedor">
                        <select 
                          name="vendedor"
                          disabled={!canEditAllFields}
                          value={formData.vendedor}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          <option value="">Selecione um vendedor</option>
                          {vendedores.filter(v => v.ativo).map(v => (
                            <option key={v.id} value={v.nome}>{v.nome}</option>
                          ))}
                          <option value="Outros">Outros</option>
                        </select>
                      </FormField>
                      <FormField label="Inversor">
                        <select 
                          name="inversor"
                          disabled={!canEditAllFields}
                          value={formData.inversor}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          <option value="">Selecione um inversor</option>
                          {inversores.filter(i => i.ativo).map(i => (
                            <option key={i.id} value={`${i.marca} - ${i.modelo}`}>{i.marca} - {i.modelo}</option>
                          ))}
                          <option value="Outros">Outros</option>
                        </select>
                      </FormField>
                      <FormField label="Local da Obra">
                        <div className="relative">
                          <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                            type="text" 
                            name="local"
                            disabled={!canEditAllFields}
                            value={formData.local}
                            onChange={handleInputChange}
                            placeholder="Endereço ou cidade"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                          />
                        </div>
                      </FormField>
                    </div>
                  </div>

                  {/* Section: Datas e Prazos */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Calendar size={16} />
                      Datas e Prazos
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <FormField label="Data do Contrato">
                        <input 
                          type="date" 
                          name="dataContrato"
                          disabled={!canEditAllFields}
                          value={formData.dataContrato}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        />
                      </FormField>
                      <FormField label="Chegada das Placas">
                        <input 
                          type="date" 
                          name="dataChegadaPlacas"
                          disabled={!canEditAllFields}
                          value={formData.dataChegadaPlacas}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        />
                      </FormField>
                      <FormField label="Dias Corridos">
                        <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-500 font-medium">
                          {diasCorridos} dias
                        </div>
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="Data Prevista da Obra">
                        <input 
                          type="date" 
                          name="dataObra"
                          disabled={!canEditAllFields}
                          value={formData.dataObra}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        />
                      </FormField>
                      <FormField label="Data de Conclusão">
                        <input 
                          type="date" 
                          name="dataConclusao"
                          value={formData.dataConclusao}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </FormField>
                    </div>
                  </div>

                  {/* Section: Financeiro e Equipe */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <DollarSign size={16} />
                      Financeiro e Execução
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <FormField label="Quantidade de Placas">
                        <input 
                          type="number" 
                          name="quantidadePlacas"
                          disabled={!canEditAllFields}
                          min="0"
                          value={isNaN(Number(formData.quantidadePlacas)) ? '' : formData.quantidadePlacas}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        />
                      </FormField>
                      <FormField label="Valor Mão de Obra (R$)">
                        <div className="space-y-2">
                          <select 
                            name="valorMaoObra"
                            disabled={!canEditAllFields}
                            value={formData.valorMaoObra}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setFormData(prev => ({ ...prev, valorMaoObra: val }));
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                          >
                            <option value="60">R$ 60,00</option>
                            <option value="70">R$ 70,00</option>
                            <option value="80">R$ 80,00</option>
                            <option value="100">R$ 100,00</option>
                            <option value="0">Outros</option>
                          </select>
                          {formData.valorMaoObra === 0 && (
                            <input 
                              type="number" 
                              disabled={!canEditAllFields}
                              placeholder="Valor personalizado"
                              value={isNaN(Number(valorMaoObraOutros)) ? '' : valorMaoObraOutros}
                              onChange={(e) => setValorMaoObraOutros(e.target.value)}
                              className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                            />
                          )}
                        </div>
                      </FormField>
                      <FormField label="Valor Total a Receber">
                        <div className="w-full bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-2.5 text-indigo-700 font-bold text-lg">
                          R$ {valorReceberCalculado.toLocaleString('pt-BR')}
                        </div>
                      </FormField>
                      <FormField label="Forma de Pagamento">
                        <select 
                          name="formaPagamento"
                          disabled={!canEditAllFields}
                          value={formData.formaPagamento}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          <option value="">Selecione a forma</option>
                          {formasPagamento.filter(f => f.ativo).map(f => (
                            <option key={f.id} value={f.nome}>{f.nome}</option>
                          ))}
                          <option value="Outros">Outros</option>
                        </select>
                      </FormField>
                      <FormField label="Situação do Pagamento">
                        <select 
                          name="situacaoPagamento"
                          disabled={!canEditAllFields}
                          value={formData.situacaoPagamento || ''}
                          onChange={handleInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          <option value="">Selecione o status</option>
                          <option value="À Vista">À Vista</option>
                          <option value="Pago">Pago</option>
                          <option value="A Pagar">A Pagar</option>
                        </select>
                      </FormField>
                    </div>
                  </div>

                  {/* Section: Arquivo TXT */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <FileText size={16} />
                      Arquivo TXT (Orçamento/Detalhes)
                    </h3>
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-6 transition-all hover:border-indigo-300 group">
                      {formData.txtFile ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                                <FileText size={20} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-700">{formData.txtFile.name}</p>
                                <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Arquivo Carregado</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, txtFile: undefined }))}
                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                title="Remover"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                          <textarea
                            value={formData.txtFile.content}
                            onChange={(e) => setFormData(prev => ({ 
                              ...prev, 
                              txtFile: prev.txtFile ? { ...prev.txtFile, content: e.target.value } : undefined 
                            }))}
                            rows={8}
                            placeholder="Conteúdo do arquivo..."
                            className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm font-mono outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner resize-y"
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-center space-y-3">
                          <div className="bg-slate-100 p-4 rounded-full text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">
                            <Upload size={32} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-600">Arraste um arquivo .txt ou clique para selecionar</p>
                            <p className="text-xs text-slate-400">Importe orçamentos ou detalhes técnicos</p>
                          </div>
                          <input 
                            type="file" 
                            accept=".txt"
                            onChange={handleTxtFileUpload}
                            className="hidden"
                            id="txt-upload"
                          />
                          <div className="flex items-center gap-3">
                            <label 
                              htmlFor="txt-upload"
                              className="px-6 py-2 bg-white border border-slate-200 rounded-full text-sm font-bold text-slate-600 cursor-pointer hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 transition-all shadow-sm flex items-center gap-2"
                            >
                              <Upload size={16} />
                              Selecionar Arquivo
                            </label>
                            <button
                              type="button"
                              onClick={() => setFormData(prev => ({ 
                                ...prev, 
                                txtFile: { name: 'Texto Colado.txt', content: '' } 
                              }))}
                              className="px-6 py-2 bg-indigo-600 border border-indigo-700 rounded-full text-sm font-bold text-white cursor-pointer hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-2 active:scale-95"
                            >
                              <Clipboard size={16} />
                              Colar Texto
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField label="Equipe Responsável">
                      <div className="space-y-2">
                        <div className="relative">
                          <Users size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          <select 
                            name="equipe"
                            disabled={!canEditAllFields}
                            value={formData.equipe}
                            onChange={handleInputChange}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                          >
                            <option value="">Selecione uma equipe</option>
                            {equipes.filter(e => e.ativo).map(e => (
                              <option key={e.id} value={e.nome}>{e.nome}</option>
                            ))}
                            <option value="Outros">Outros</option>
                          </select>
                        </div>
                        {formData.equipe === 'Outros' && (
                          <input 
                            type="text"
                            disabled={!canEditAllFields}
                            placeholder="Nome da equipe personalizada"
                            value={equipeOutros}
                            onChange={(e) => setEquipeOutros(e.target.value)}
                            className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                      </div>
                    </FormField>
                    <FormField label="Observações Adicionais">
                        <textarea 
                          name="observacoes"
                          value={formData.observacoes}
                          onChange={handleInputChange}
                          rows={1}
                          placeholder="Detalhes importantes..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        />
                      </FormField>
                  </div>

                  <div className="pt-4 flex items-center justify-end gap-4">
                    <button 
                      type="button" 
                      onClick={resetForm}
                      className="px-6 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-indigo-200"
                    >
                      <Save size={20} />
                      Salvar Registro
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleServicoSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
                  {/* Section: Identificação do Serviço */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <UserIcon size={16} />
                      Identificação e Status
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <FormField label="Situação">
                        <select 
                          name="situacao"
                          value={servicoFormData.situacao}
                          onChange={handleServicoInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="Pendente">Pendente</option>
                          <option value="Em Andamento">Em Andamento</option>
                          <option value="Concluído">Concluído</option>
                          <option value="Em Espera">Em Espera</option>
                        </select>
                      </FormField>
                      <FormField label="Prioridade">
                        <select 
                          name="prioridade"
                          value={servicoFormData.prioridade}
                          onChange={handleServicoInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="Alta">🔴 Alta</option>
                          <option value="Média">🟡 Média</option>
                          <option value="Baixa">🟢 Baixa</option>
                        </select>
                      </FormField>
                      <FormField label="Cliente">
                        <div className="relative" ref={suggestionsRef}>
                          <div className="relative">
                            <input 
                              type="text" 
                              name="cliente"
                              required
                              value={servicoFormData.cliente || ''}
                              onChange={handleServicoInputChange}
                              onFocus={() => setShowClientSuggestions(true)}
                              placeholder="Nome do cliente (ou busque por obras)"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-800"
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              onClick={() => setShowClientSuggestions(!showClientSuggestions)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                              title="Buscar clientes cadastrados em Obras"
                            >
                              <Search size={18} />
                            </button>
                          </div>
                          
                          {showClientSuggestions && (
                            <div className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl divide-y divide-slate-100">
                              <div className="px-4 py-2 bg-slate-50 text-[10px] uppercase font-black tracking-widest text-slate-400 flex items-center justify-between">
                                <span>{(servicoFormData.cliente || '').trim() ? 'Resultados em Obras' : 'Obras Recentes'}</span>
                                <span className="font-mono lowercase font-normal text-slate-400">({matchingObras.length} encontradas)</span>
                              </div>
                              {matchingObras.length === 0 ? (
                                <div className="p-4 text-center text-sm text-slate-400">
                                  Nenhum cliente ou obra de referência encontrado.
                                </div>
                              ) : (
                                matchingObras.map((obra) => (
                                  <button
                                    key={obra.id}
                                    type="button"
                                    onClick={() => selectObraForServico(obra)}
                                    className="w-full text-left px-4 py-3 hover:bg-indigo-50/50 transition-colors flex items-start gap-3"
                                  >
                                    <div className="bg-indigo-50 text-indigo-600 p-1.5 rounded-lg mt-0.5 text-xs font-mono font-bold shrink-0">
                                      #{obra.numeroRegistro}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="font-semibold text-sm text-slate-800 truncate">
                                        {obra.cliente}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-medium whitespace-nowrap">
                                        <div className="flex items-center gap-1 shrink-0 truncate">
                                          <MapPin size={12} />
                                          <span className="truncate max-w-[150px]">{obra.local}</span>
                                        </div>
                                        <span className="text-slate-200 font-normal">|</span>
                                        <span className="truncate">Vend: {obra.vendedor || '---'}</span>
                                      </div>
                                    </div>
                                    {obra.formaPagamento && (
                                      <span className="shrink-0 bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider self-center">
                                        {obra.formaPagamento}
                                      </span>
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <FormField label="Data Atendimento">
                        <input 
                          type="date" 
                          name="dataAtendimento"
                          value={servicoFormData.dataAtendimento}
                          onChange={handleServicoInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </FormField>
                      <FormField label="Dias Corridos">
                        <div className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-500 font-medium">
                          {diasCorridosServico} dias
                        </div>
                      </FormField>
                      <FormField label="Vendedor">
                        <select 
                          name="vendedor"
                          value={servicoFormData.vendedor}
                          onChange={handleServicoInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Selecione um vendedor</option>
                          {vendedores.filter(v => v.ativo).map(v => (
                            <option key={v.id} value={v.nome}>{v.nome}</option>
                          ))}
                          <option value="Outros">Outros</option>
                        </select>
                      </FormField>
                    </div>
                  </div>

                  {/* Section: Detalhes do Serviço */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <ClipboardList size={16} />
                      Detalhes do Serviço
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="Local">
                        <div className="relative">
                          <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                            type="text" 
                            name="local"
                            value={servicoFormData.local}
                            onChange={handleServicoInputChange}
                            placeholder="Endereço do serviço"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </FormField>
                      <FormField label="Serviço">
                        <input 
                          type="text" 
                          name="servico"
                          value={servicoFormData.servico}
                          onChange={handleServicoInputChange}
                          placeholder="Tipo de serviço"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <FormField label="Valor (R$)">
                        <input 
                          type="number" 
                          name="valor"
                          value={isNaN(Number(servicoFormData.valor)) ? '' : servicoFormData.valor}
                          onChange={handleServicoInputChange}
                          placeholder="0,00"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </FormField>

                      <FormField label="Forma de Pagamento">
                        <select 
                          name="formaPagamento"
                          value={servicoFormData.formaPagamento}
                          onChange={handleServicoInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Selecione</option>
                          {formasPagamento.filter(f => f.ativo).map(f => (
                            <option key={f.id} value={f.nome}>{f.nome}</option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="Situação do Pagamento">
                        <select 
                          name="situacaoPagamento"
                          value={servicoFormData.situacaoPagamento || ''}
                          onChange={handleServicoInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Selecione o status</option>
                          <option value="À Vista">À Vista</option>
                          <option value="Pago">Pago</option>
                          <option value="A Pagar">A Pagar</option>
                        </select>
                      </FormField>
                      <FormField label="Equipe Serviço">
                        <div className="space-y-2">
                          <select 
                            name="equipeServico"
                            value={servicoFormData.equipeServico}
                            onChange={handleServicoInputChange}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Selecione a equipe</option>
                            {equipes.filter(e => e.ativo).map(e => (
                              <option key={e.id} value={e.nome}>{e.nome}</option>
                            ))}
                            <option value="Outros">Outros</option>
                          </select>
                          {servicoFormData.equipeServico === 'Outros' && (
                            <input 
                              type="text"
                              placeholder="Nome da equipe personalizada"
                              value={equipeServicoOutros}
                              onChange={(e) => setEquipeServicoOutros(e.target.value)}
                              className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          )}
                        </div>
                      </FormField>
                      <FormField label="Equipe que Instalou">
                        <div className="space-y-2">
                          <select 
                            name="equipeInstalou"
                            value={servicoFormData.equipeInstalou}
                            onChange={handleServicoInputChange}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Selecione a equipe</option>
                            {equipes.filter(e => e.ativo).map(e => (
                              <option key={e.id} value={e.nome}>{e.nome}</option>
                            ))}
                            <option value="Outros">Outros</option>
                          </select>
                          {servicoFormData.equipeInstalou === 'Outros' && (
                            <input 
                              type="text"
                              placeholder="Nome da equipe personalizada"
                              value={equipeInstalouOutros}
                              onChange={(e) => setEquipeInstalouOutros(e.target.value)}
                              className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          )}
                        </div>
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="Data do Serviço">
                        <input 
                          type="date" 
                          name="dataServico"
                          value={servicoFormData.dataServico}
                          onChange={handleServicoInputChange}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </FormField>
                      <FormField label="Observação">
                        <textarea 
                          name="observacao"
                          value={servicoFormData.observacao}
                          onChange={handleServicoInputChange}
                          rows={1}
                          placeholder="Observações do serviço..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        />
                      </FormField>
                    </div>
                  </div>

                  <div className="pt-4 flex items-center justify-end gap-4">
                    <button 
                      type="button" 
                      onClick={resetServicoForm}
                      className="px-6 py-3 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-indigo-200"
                    >
                      <Save size={20} />
                      Salvar Serviço
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Import Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsImportModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-8 space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <FileSpreadsheet className="text-emerald-600" />
                    Importar da Planilha
                  </h2>
                  <p className="text-xs text-slate-500">
                    Siga a ordem das colunas para uma importação correta.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={downloadImportTemplate}
                    className="flex items-center gap-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-all border border-indigo-100"
                  >
                    <Download size={14} />
                    Baixar Modelo
                  </button>
                  <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Upload size={16} className="text-indigo-600" />
                    Opção 1: Upload de Arquivo
                  </h3>
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept=".xlsx,.xls,.json"
                      onChange={handleFileImport}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center group-hover:border-indigo-400 group-hover:bg-indigo-50 transition-all">
                      <FileSpreadsheet size={32} className="mx-auto text-slate-400 group-hover:text-indigo-500 mb-2" />
                      <p className="text-sm font-bold text-slate-600">Clique ou arraste o arquivo</p>
                      <p className="text-[10px] text-slate-400">Suporta .xlsx, .xls e .json</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <ClipboardList size={16} className="text-indigo-600" />
                    Opção 2: Colar Dados
                  </h3>
                  <textarea 
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Cole aqui as linhas da sua planilha (sem o cabeçalho)..."
                    className="w-full h-[124px] bg-slate-50 border border-slate-200 rounded-2xl p-4 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button 
                    onClick={handlePasteImport}
                    className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                  >
                    Importar Texto Colado
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Ordem das Colunas para Importação</h3>
                {activeTab === 'obras' ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-medium text-slate-600">
                    <div className="bg-white p-1.5 rounded border border-slate-100">1. Situação</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">2. Prioridade</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">3. Cliente</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">4. Vendedor</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">5. Local</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">6. Chegada Placas</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">7. Contrato</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">8. Qtd Placas</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">9. Valor Mão Obra</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">10. Data Obra</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">11. Conclusão</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">12. Equipe</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">13. Inversor</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">14. Forma Pagamento</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">15. Observações</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-medium text-slate-600">
                    <div className="bg-white p-1.5 rounded border border-slate-100">1. Situação</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">2. Prioridade</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">3. Atendimento</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">4. Cliente</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">5. Local</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">6. Vendedor</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">7. Equipe Serviço</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">8. Serviço</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">9. Valor</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">10. Equipe Instalou</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">11. Data Serviço</div>
                    <div className="bg-white p-1.5 rounded border border-slate-100">12. Observação</div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button onClick={() => setIsImportModalOpen(false)} className="px-6 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 transition-colors">Fechar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeDeleteModal}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Confirmar Exclusão</h3>
                <p className="text-slate-500">
                  {isBulkDeleteMode 
                    ? `Tem certeza que deseja excluir os ${selectedIds.size} registros selecionados? Esta ação não poderá ser desfeita.`
                    : "Tem certeza que deseja excluir este registro? Esta ação não poderá ser desfeita."}
                </p>
              </div>
              <div className="flex border-t border-slate-100">
                <button 
                  onClick={closeDeleteModal}
                  className="flex-1 px-6 py-4 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 px-6 py-4 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors border-l border-slate-100"
                >
                  Excluir Agora
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {isDetailsModalOpen && (selectedObra || selectedServico) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsDetailsModalOpen(false); setSelectedObra(null); setSelectedServico(null); }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-md">
                    <Eye className="text-indigo-400" size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        #{selectedObra ? selectedObra.numeroRegistro : selectedServico?.numeroRegistro}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                        (selectedObra?.prioridade || selectedServico?.prioridade) === 'Alta' 
                          ? 'bg-red-500/20 text-red-200 border-red-500/30' 
                          : (selectedObra?.prioridade || selectedServico?.prioridade) === 'Média'
                          ? 'bg-amber-500/20 text-amber-200 border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30'
                      }`}>
                        {selectedObra ? selectedObra.prioridade : selectedServico?.prioridade}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold leading-tight">
                      {selectedObra ? selectedObra.cliente : selectedServico?.cliente}
                    </h2>
                  </div>
                </div>
                <button 
                  onClick={() => { setIsDetailsModalOpen(false); setSelectedObra(null); setSelectedServico(null); }} 
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              
              {/* Content */}
              <div className="flex-1 overflow-y-auto p-8 scrollbar-hide">
                <div className="space-y-10">
                  {selectedObra ? (
                    <>
                      {/* Section: Status & General */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <DetailItem label="Situação" value={<StatusBadge status={selectedObra.situacao} />} icon={<Activity size={14} />} />
                        <DetailItem label="Vendedor" value={selectedObra.vendedor || '---'} icon={<UserIcon size={14} />} />
                        <DetailItem label="Inversor" value={selectedObra.inversor || '---'} icon={<Cpu size={14} />} />
                        <div className="md:col-span-2">
                          <DetailItem label="Local da Obra" value={selectedObra.local || '---'} icon={<MapPin size={14} />} />
                        </div>
                        <DetailItem label="Equipe Responsável" value={selectedObra.equipe || '---'} icon={<Users size={14} />} />
                      </div>

                      <hr className="border-slate-100" />

                      {/* Section: Dates */}
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Calendar size={14} /> Cronograma
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                          <DetailItem label="Contrato" value={formatDateBR(selectedObra.dataContrato)} />
                          <DetailItem label="Chegada Placas" value={selectedObra.dataChegadaPlacas ? formatDateBR(selectedObra.dataChegadaPlacas) : '---'} />
                          <DetailItem label="Data da Obra" value={selectedObra.dataObra ? formatDateBR(selectedObra.dataObra) : '---'} />
                          <DetailItem label="Conclusão" value={selectedObra.dataConclusao ? formatDateBR(selectedObra.dataConclusao) : '---'} />
                        </div>
                      </div>

                      <hr className="border-slate-100" />

                      {/* Section: Finance */}
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <DollarSign size={14} /> Financeiro & Técnico
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <DetailItem label="Valor Total" value={`R$ ${selectedObra.valorReceber.toLocaleString('pt-BR')}`} />
                          <DetailItem label="Qtd. Placas" value={`${selectedObra.quantidadePlacas} unidades`} />
                          <DetailItem label="Mão de Obra (un)" value={`R$ ${selectedObra.valorMaoObra.toLocaleString('pt-BR')}`} />
                          <div className="md:col-span-2">
                            <DetailItem label="Forma de Pagamento" value={selectedObra.formaPagamento || '---'} />
                          </div>
                          <div>
                            <DetailItem label="Situação de Pagamento" value={selectedObra.situacaoPagamento || '---'} />
                          </div>
                        </div>
                      </div>

                      <hr className="border-slate-100" />

                      {/* Section: Arquivo TXT Display */}
                      {selectedObra.txtFile && (
                        <div className="space-y-4">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <FileText size={14} /> Arquivo TXT: {selectedObra.txtFile.name}
                          </h3>
                          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 shadow-sm transition-all hover:shadow-md">
                            <pre className="text-slate-700 font-mono text-xs leading-relaxed overflow-x-auto max-h-[400px] whitespace-pre-wrap">
                              {selectedObra.txtFile.content}
                            </pre>
                            <div className="mt-4 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  const blob = new Blob([selectedObra.txtFile!.content], { type: 'text/plain' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = selectedObra.txtFile!.name;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all active:scale-95 border border-indigo-100"
                              >
                                <Download size={14} />
                                Baixar Arquivo .txt
                              </button>
                            </div>
                          </div>
                          <hr className="border-slate-100" />
                        </div>
                      )}

                      {/* Section: Observations */}
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <DetailItem 
                          label="Observações Adicionais" 
                          value={<p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{selectedObra.observacoes || 'Nenhuma observação registrada.'}</p>} 
                          icon={<FileText size={14} />}
                        />
                      </div>
                    </>
                  ) : selectedServico ? (
                    <>
                      {/* Section: Status & General */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <DetailItem label="Situação" value={<StatusBadge status={selectedServico.situacao} />} icon={<Activity size={14} />} />
                        <DetailItem label="Vendedor" value={selectedServico.vendedor || '---'} icon={<UserIcon size={14} />} />
                        <DetailItem label="Atendimento" value={formatDateBR(selectedServico.dataAtendimento)} icon={<Calendar size={14} />} />
                        <DetailItem label="Forma de Pagamento" value={selectedServico.formaPagamento || '---'} icon={<DollarSign size={14} />} />
                        <DetailItem label="Situação de Pagamento" value={selectedServico.situacaoPagamento || '---'} icon={<DollarSign size={14} />} />
                        <div className="md:col-span-1">
                          <DetailItem label="Valor do Serviço" value={`R$ ${Number(selectedServico.valor).toLocaleString('pt-BR')}`} icon={<DollarSign size={14} />} />
                        </div>
                        <div className="md:col-span-2">
                          <DetailItem label="Local do Serviço" value={selectedServico.local || '---'} icon={<MapPin size={14} />} />
                        </div>
                      </div>

                      <hr className="border-slate-100" />

                      {/* Section: Service Details */}
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <Wrench size={14} /> Detalhes Técnicos
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <DetailItem label="Tipo de Serviço" value={selectedServico.servico || '---'} />
                          <DetailItem label="Data do Serviço" value={selectedServico.dataServico ? formatDateBR(selectedServico.dataServico) : '---'} />
                          <DetailItem label="Equipe de Serviço" value={selectedServico.equipeServico || '---'} />
                          <DetailItem label="Equipe que Instalou" value={selectedServico.equipeInstalou || '---'} />
                        </div>
                      </div>

                      <hr className="border-slate-100" />

                      {/* Section: Observations */}
                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <DetailItem 
                          label="Observações do Serviço" 
                          value={<p className="text-slate-600 whitespace-pre-wrap leading-relaxed">{selectedServico.observacao || 'Nenhuma observação registrada.'}</p>} 
                          icon={<FileText size={14} />}
                        />
                      </div>

                      <hr className="border-slate-100" />

                      {/* Section: Arquivo TXT Display */}
                      {selectedServico.txtFile && (
                        <div className="space-y-4">
                          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <FileText size={14} /> Arquivo TXT: {selectedServico.txtFile.name}
                          </h3>
                          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 shadow-sm transition-all hover:shadow-md">
                            <pre className="text-slate-700 font-mono text-xs leading-relaxed overflow-x-auto max-h-[400px] whitespace-pre-wrap">
                              {selectedServico.txtFile.content}
                            </pre>
                            <div className="mt-4 flex justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  const blob = new Blob([selectedServico.txtFile!.content], { type: 'text/plain' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = selectedServico.txtFile!.name;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs hover:bg-indigo-100 transition-all active:scale-95 border border-indigo-100"
                              >
                                <Download size={14} />
                                Baixar Arquivo .txt
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
              
              {/* Footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-2">
                  {selectedObra && (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => exportarIndividualPDF(selectedObra)}
                        className="flex items-center gap-2 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-100"
                      >
                        <Download size={16} />
                        Exportar PDF
                      </button>
                      <button 
                        onClick={() => exportarIndividualTXT(selectedObra)}
                        className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:bg-slate-100 px-4 py-2.5 rounded-xl transition-all border border-slate-200"
                      >
                        <FileText size={16} />
                        TXT
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => { setIsDetailsModalOpen(false); setSelectedObra(null); setSelectedServico(null); }}
                    className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all"
                  >
                    Fechar
                  </button>
                  <button 
                    onClick={() => { 
                      setIsDetailsModalOpen(false); 
                      if (selectedObra) handleEdit(selectedObra);
                      else if (selectedServico) handleServicoEdit(selectedServico);
                      setSelectedObra(null);
                      setSelectedServico(null);
                    }}
                    className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                  >
                    Editar Registro
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        vendedores={vendedores}
        equipes={equipes}
        inversores={inversores}
        formasPagamento={formasPagamento}
        onSave={handleSaveConfig}
        onDelete={handleDeleteConfig}
        onBackup={exportarJSON}
        onExportXLS={exportarCSV}
        onFileImport={handleFileImport}
        onDownloadTemplate={downloadImportTemplate}
        isAdmin={currentUser.role === 'Admin'}
      />

      {/* Payroll Modal */}
      <PayrollModal 
        isOpen={isPayrollOpen}
        onClose={() => setIsPayrollOpen(false)}
        obras={obras}
        equipes={equipes}
        onSelectObra={setSelectedObra}
        onOpenDetails={setIsDetailsModalOpen}
        setViewingTxt={setViewingTxt}
      />

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

      {/* Period Selection for Report */}
      <AnimatePresence>
        {isSelectPeriodModalOpen && (
          <PeriodoRelatorioModal 
            isOpen={isSelectPeriodModalOpen}
            onClose={() => setIsSelectPeriodModalOpen(false)}
            onConfirm={(startDate, endDate) => {
              setIsSelectPeriodModalOpen(false);
              imprimirRelatorioConcluidos(startDate, endDate);
            }}
          />
        )}
      </AnimatePresence>

      {/* Central de Alarmes e Lembretes Modal */}
      <AnimatePresence>
        {isLembretesHubOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsLembretesHubOpen(false);
                setEditingLembreteId(null);
                setLembreteFormData({
                  titulo: '',
                  dataAlarme: localTodayStr,
                  descricao: '',
                  importante: false,
                  concluido: false
                });
              }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10"
            >
              {/* Header */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="bg-amber-500/10 p-3 rounded-2xl backdrop-blur-md">
                    <Bell className="text-amber-400 animate-bounce" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold leading-tight">Central de Alarmes e Lembretes</h2>
                    <p className="text-xs text-slate-400">Agende compromissos e lembretes para deixar visíveis no dia marcado</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={playAlarmChime}
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-amber-300 font-bold px-4 py-2 rounded-xl text-xs transition-colors"
                  >
                    <Volume2 size={16} />
                    Testar Som de Alarme
                  </button>
                  <button 
                    onClick={() => {
                      setIsLembretesHubOpen(false);
                      setEditingLembreteId(null);
                      setLembreteFormData({
                        titulo: '',
                        dataAlarme: localTodayStr,
                        descricao: '',
                        importante: false,
                        concluido: false
                      });
                    }} 
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
                {/* Form column */}
                <div className="w-full md:w-2/5 p-6 border-b md:border-b-0 md:border-r border-slate-100 overflow-y-auto bg-slate-50">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4">
                    {editingLembreteId ? "📝 Editar Alarme" : "🔔 Criar Novo Alarme"}
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest block font-sans">
                        O que deixar bem visível? (Ex: Placas Solares) *
                      </label>
                      <input 
                        type="text" 
                        value={lembreteFormData.titulo || ''}
                        onChange={(e) => setLembreteFormData(prev => ({ ...prev, titulo: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-sm"
                        placeholder="Nome do produto/placa/equipamento..."
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest block font-sans">
                        Dia Marcado para Alarme *
                      </label>
                      <input 
                        type="date" 
                        value={lembreteFormData.dataAlarme || localTodayStr}
                        onChange={(e) => setLembreteFormData(prev => ({ ...prev, dataAlarme: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-700 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-widest block font-sans">
                        Descrição / Instrução Adicional
                      </label>
                      <textarea 
                        rows={3}
                        value={lembreteFormData.descricao || ''}
                        onChange={(e) => setLembreteFormData(prev => ({ ...prev, descricao: e.target.value }))}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed text-sm"
                        placeholder="Ex: Deixar as placas no portão lateral direito..."
                      />
                    </div>

                    <div className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                      <input 
                        type="checkbox" 
                        id="reminder-important"
                        checked={!!lembreteFormData.importante}
                        onChange={(e) => setLembreteFormData(prev => ({ ...prev, importante: e.target.checked }))}
                        className="w-4 h-4 text-red-600 rounded focus:ring-red-500"
                      />
                      <label htmlFor="reminder-important" className="text-sm font-bold text-slate-700 cursor-pointer flex items-center gap-1.5">
                        Alerta Urgente/Esforço Máximo! 🚨
                      </label>
                    </div>

                    <div className="pt-2 flex gap-3">
                      {editingLembreteId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLembreteId(null);
                            setLembreteFormData({
                              titulo: '',
                              dataAlarme: localTodayStr,
                              descricao: '',
                              importante: false,
                              concluido: false
                            });
                          }}
                          className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-4 rounded-xl transition-all"
                        >
                          Cancelar
                        </button>
                      )}
                      <button 
                        onClick={handleSaveLembrete}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 px-4 rounded-xl transition-all shadow-md shadow-indigo-100 text-center"
                      >
                        {editingLembreteId ? "Salvar Lembrete" : "Criar Alarme"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* List column */}
                <div className="flex-1 p-6 overflow-y-auto flex flex-col min-h-0">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 shrink-0">
                    📋 Meus Lembretes e Alarmes Cadastrados
                  </h3>

                  {lembretes.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <Bell size={40} className="text-slate-300 mb-2" />
                      <p className="font-bold text-slate-500">Nenhum alarme para exibir.</p>
                      <p className="text-xs text-slate-400 mt-1">Crie um alarme no formulário para ser avisado no dia marcado.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 pr-1">
                      {lembretes.map((l) => {
                        const isToday = l.dataAlarme === localTodayStr;
                        return (
                          <div 
                            key={l.id} 
                            className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                              l.concluido
                                ? 'bg-slate-50/70 border-slate-100 opacity-60'
                                : isToday
                                ? 'bg-amber-50 border-amber-300 shadow-md ring-1 ring-amber-300'
                                : l.importante
                                ? 'bg-red-50 border-red-200'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex gap-3 items-start min-w-0">
                              <input 
                                type="checkbox"
                                checked={!!l.concluido}
                                onChange={() => handleToggleLembreteConcluido(l.id || '', !!l.concluido)}
                                className="w-5 h-5 mt-0.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                              />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h4 className={`font-black text-sm leading-snug break-all ${l.concluido ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                                    {l.titulo}
                                  </h4>
                                  {isToday && !l.concluido && (
                                    <span className="bg-amber-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide animate-pulse">
                                      Hoje!
                                    </span>
                                  )}
                                  {l.importante && !l.concluido && (
                                    <span className="bg-red-600 text-white text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide">
                                      Urgente 🚨
                                    </span>
                                  )}
                                </div>
                                {l.descricao && (
                                  <p className="text-xs text-slate-600 mt-1 font-medium leading-relaxed">
                                    {l.descricao}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 mt-2 font-mono text-[10px] text-slate-400 font-bold">
                                  <Calendar size={12} />
                                  Dia Marcado: {formatDateBR(l.dataAlarme)} ({getDayOfWeek(l.dataAlarme)})
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {!l.concluido && (
                                <button
                                  onClick={() => {
                                    setEditingLembreteId(l.id || null);
                                    setLembreteFormData({
                                      titulo: l.titulo,
                                      dataAlarme: l.dataAlarme,
                                      descricao: l.descricao,
                                      importante: l.importante,
                                      concluido: l.concluido
                                    });
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                                  title="Editar"
                                >
                                  <Edit size={16} />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteLembrete(l.id || '')}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper Components
function DetailItem({ label, value, icon }: { label: string, value: React.ReactNode, icon?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-slate-400">{icon}</span>}
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      </div>
      <div className="text-sm font-bold text-slate-700">{value}</div>
    </div>
  );
}

// Settings Modal Component
function SettingsModal({ 
  isOpen, 
  onClose, 
  vendedores, 
  equipes, 
  inversores, 
  formasPagamento, 
  onSave, 
  onDelete, 
  onBackup, 
  onExportXLS, 
  onFileImport,
  onDownloadTemplate,
  isAdmin 
}: any) {
  const [activeTab, setActiveTab] = useState('vendedores');
  const [isAdding, setIsAdding] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(activeTab, formData, editItem?.id);
    setIsAdding(false);
    setEditItem(null);
    setFormData({});
  };

  const startEdit = (item: any) => {
    setEditItem(item);
    setFormData(item);
    setIsAdding(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <Settings size={24} />
            <h2 className="text-xl font-bold">Configurações do Sistema</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Tabs */}
          <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 space-y-2 shrink-0">
            <TabButton active={activeTab === 'vendedores'} onClick={() => { setActiveTab('vendedores'); setIsAdding(false); }} icon={<UserIcon size={18} />} label="Vendedores" />
            <TabButton active={activeTab === 'equipes'} onClick={() => { setActiveTab('equipes'); setIsAdding(false); }} icon={<Users size={18} />} label="Equipes" />
            <TabButton active={activeTab === 'inversores'} onClick={() => { setActiveTab('inversores'); setIsAdding(false); }} icon={<BarChart3 size={18} />} label="Inversores" />
            <TabButton active={activeTab === 'formasPagamento'} onClick={() => { setActiveTab('formasPagamento'); setIsAdding(false); }} icon={<DollarSign size={18} />} label="Pagamentos" />
            <div className="my-4 border-t border-slate-200 pt-4">
              <TabButton active={activeTab === 'bancoDados'} onClick={() => { setActiveTab('bancoDados'); setIsAdding(false); }} icon={<Database size={18} />} label="Banco de Dados" />
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 capitalize">
                {activeTab === 'bancoDados' ? 'Gestão de Dados' : activeTab}
              </h3>
              {isAdmin && !isAdding && activeTab !== 'bancoDados' && (
                <button onClick={() => { setIsAdding(true); setFormData({ ativo: true }); }} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                  <Plus size={18} /> Novo Cadastro
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              {activeTab === 'bancoDados' ? (
                <div className="space-y-8">
                  {/* Backup & Restore Section */}
                  <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                    <h4 className="text-sm font-bold text-amber-800 mb-4 flex items-center gap-2">
                       <ShieldCheck size={18} /> Backup & Restauração
                    </h4>
                    <p className="text-xs text-amber-600 mb-6">
                      Recomendamos baixar um backup completo semanalmente para segurança dos seus dados.
                    </p>
                    <div className="flex flex-wrap gap-4">
                      <button 
                        onClick={onBackup}
                        className="flex items-center gap-2 bg-white text-amber-700 border border-amber-200 px-6 py-3 rounded-xl text-sm font-bold hover:bg-amber-100 transition-all shadow-sm"
                      >
                        <Download size={18} />
                        Download Backup Completo (JSON)
                      </button>
                      <label className="flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-amber-700 transition-all cursor-pointer shadow-md">
                        <Upload size={18} />
                        Restaurar Backup
                        <input type="file" accept=".json" onChange={onFileImport} className="hidden" />
                      </label>
                    </div>
                  </div>

                  {/* Export Options */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <Table size={18} /> Exportar Planilhas (XLSX)
                      </h4>
                      <div className="space-y-3">
                        <button onClick={() => onExportXLS('obras')} className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-sm hover:border-indigo-300 transition-all">
                          <span className="font-medium">Lista de Obras</span>
                          <FileSpreadsheet size={18} className="text-emerald-500" />
                        </button>
                        <button onClick={() => onExportXLS('servicos')} className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-sm hover:border-blue-300 transition-all">
                          <span className="font-medium">Lista de Serviços</span>
                          <FileSpreadsheet size={18} className="text-blue-500" />
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                      <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                        <PlusCircle size={18} /> Modelos de Importação
                      </h4>
                      <p className="text-xs text-slate-500 mb-4 font-medium italic">
                        Use estes modelos para importar dados em massa.
                      </p>
                      <button 
                        onClick={onDownloadTemplate}
                        className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-all"
                      >
                        <Download size={18} /> Baixar Modelo Padrão
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                    <p className="text-[10px] text-red-700 font-bold uppercase tracking-widest flex items-center gap-2">
                      <AlertTriangle size={14} /> Atenção
                    </p>
                    <p className="text-[11px] text-red-600 mt-1">
                      A restauração de backup não apaga dados existentes, ela adiciona os registros do arquivo ao banco atual. Evite importar o mesmo backup múltiplas vezes para não gerar duplicidade.
                    </p>
                  </div>
                </div>
              ) : isAdding ? (
                <form onSubmit={handleSave} className="space-y-6 max-w-md">
                  {activeTab === 'vendedores' && (
                    <FormField label="Nome do Vendedor">
                      <input type="text" required value={formData.nome || ''} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                    </FormField>
                  )}
                  {activeTab === 'formasPagamento' && (
                    <FormField label="Nome da Forma de Pagamento">
                      <input type="text" required value={formData.nome || ''} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                    </FormField>
                  )}
                  {activeTab === 'equipes' && (
                    <>
                      <FormField label="Nome da Equipe">
                        <input type="text" required value={formData.nome || ''} onChange={e => setFormData({...formData, nome: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </FormField>
                      <FormField label="Líder da Equipe">
                        <input type="text" value={formData.lider || ''} onChange={e => setFormData({...formData, lider: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </FormField>
                    </>
                  )}
                  {activeTab === 'inversores' && (
                    <>
                      <FormField label="Marca">
                        <input type="text" required value={formData.marca || ''} onChange={e => setFormData({...formData, marca: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </FormField>
                      <FormField label="Modelo">
                        <input type="text" required value={formData.modelo || ''} onChange={e => setFormData({...formData, modelo: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
                      </FormField>
                    </>
                  )}
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="ativo" checked={formData.ativo} onChange={e => setFormData({...formData, ativo: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded" />
                    <label htmlFor="ativo" className="text-sm font-medium text-slate-700">Ativo</label>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button type="button" onClick={() => { setIsAdding(false); setEditItem(null); }} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50">Cancelar</button>
                    <button type="submit" className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">Salvar</button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3">
                  {(activeTab === 'vendedores' ? vendedores : activeTab === 'equipes' ? equipes : activeTab === 'inversores' ? inversores : formasPagamento).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                      <div>
                        <p className="font-bold text-slate-900">{item.nome || item.modelo}</p>
                        <p className="text-xs text-slate-500">{item.lider || item.marca || (item.ativo ? 'Ativo' : 'Inativo')}</p>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(item)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit size={18} /></button>
                          <button onClick={() => onDelete(activeTab, item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={18} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Payroll Modal Component
function PayrollModal({ isOpen, onClose, obras, equipes, onSelectObra, onOpenDetails, setViewingTxt }: any) {
  const [period, setPeriod] = useState('Mensal');
  const [selectedEquipe, setSelectedEquipe] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (period === 'Diário') {
      start = new Date(today);
      end = new Date(today);
    } else if (period === 'Semanal') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      start = new Date(today.getFullYear(), today.getMonth(), diff);
      end = new Date(today.getFullYear(), today.getMonth(), diff + 6);
    } else if (period === 'Quinzenal') {
      if (today.getDate() <= 15) {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date(today.getFullYear(), today.getMonth(), 15);
      } else {
        start = new Date(today.getFullYear(), today.getMonth(), 16);
        end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      }
    } else if (period === 'Mensal') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  }, [period]);

  const payrollData = useMemo(() => {
    if (!selectedEquipe) return [];
    
    return obras.filter((obra: any) => {
      if (obra.equipe !== selectedEquipe) return false;
      if (obra.situacao !== 'Concluído') return false;
      
      const date = new Date(obra.dataConclusao || obra.dataObra);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59);
      
      return date >= start && date <= end;
    });
  }, [obras, selectedEquipe, startDate, endDate]);

  const totals = useMemo(() => {
    return payrollData.reduce((acc: any, obra: any) => ({
      placas: acc.placas + (obra.quantidadePlacas || 0),
      valor: acc.valor + (obra.valorReceber || 0)
    }), { placas: 0, valor: 0 });
  }, [payrollData]);

  if (!isOpen) return null;

  const exportPayroll = (type: 'pdf' | 'excel') => {
    if (payrollData.length === 0) return;

    if (type === 'excel') {
      const data = payrollData.map((o: any) => ({
        'Data': formatDateBR(o.dataConclusao || o.dataObra),
        'Cliente': o.cliente,
        'Placas': o.quantidadePlacas,
        'Valor Mão de Obra': o.valorMaoObra,
        'Total': o.valorReceber
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Folha");
      XLSX.writeFile(wb, `Folha_${selectedEquipe}_${startDate}.xlsx`);
    } else {
      const doc = new jsPDF();
      doc.text(`Folha de Pagamento - ${selectedEquipe}`, 14, 15);
      doc.text(`Período: ${formatDateBR(startDate)} a ${formatDateBR(endDate)}`, 14, 22);
      
      const tableData = payrollData.map((o: any) => [
        formatDateBR(o.dataConclusao || o.dataObra),
        o.cliente,
        o.quantidadePlacas,
        `R$ ${o.valorMaoObra}`,
        `R$ ${o.valorReceber}`
      ]);

      autoTable(doc, {
        startY: 30,
        head: [['Data', 'Cliente', 'Placas', 'Vlr Unit', 'Total']],
        body: tableData,
        foot: [['', 'TOTAIS', totals.placas, '', `R$ ${totals.valor.toLocaleString('pt-BR')}`]]
      });

      doc.save(`Folha_${selectedEquipe}.pdf`);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
          <div className="flex items-center gap-3">
            <Wallet size={24} />
            <h2 className="text-xl font-bold">Folha de Pagamento</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X size={24} /></button>
        </div>

        <div className="p-8 space-y-8 overflow-y-auto scrollbar-hide">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <FormField label="Equipe">
              <select value={selectedEquipe} onChange={e => setSelectedEquipe(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Selecione a equipe</option>
                {equipes.map((e: any) => <option key={e.id} value={e.nome}>{e.nome}</option>)}
              </select>
            </FormField>
            <FormField label="Período">
              <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="Diário">Diário</option>
                <option value="Semanal">Semanal</option>
                <option value="Quinzenal">Quinzenal</option>
                <option value="Mensal">Mensal</option>
              </select>
            </FormField>
            <FormField label="Início">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
            </FormField>
            <FormField label="Fim">
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500" />
            </FormField>
          </div>

          {selectedEquipe ? (
            <div className="space-y-6">
              <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Placas</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vlr Unit</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {payrollData.map((obra: any) => (
                      <tr key={obra.id} className="hover:bg-white transition-colors">
                        <td className="px-6 py-3 text-sm text-slate-600">{formatDateBR(obra.dataConclusao || obra.dataObra)}</td>
                        <td className="px-6 py-3">
                          <div className="text-sm font-bold text-slate-900 cursor-pointer hover:text-indigo-600 transition-colors flex items-center gap-1 group/name">
                            <span onClick={() => { onSelectObra(obra); onOpenDetails(true); }} className="flex-1 truncate">{obra.cliente}</span>
                            {obra.txtFile && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); setViewingTxt(obra.txtFile || null); }}
                                className="p-1 text-indigo-500 hover:text-indigo-700 transition-all hover:scale-110 flex-none"
                                title="Ver TXT"
                              >
                                <FileText size={14} />
                              </button>
                            )}
                          </div>
                          {obra.observacoes && (
                            <div className="text-[10px] text-slate-500 mt-0.5 max-w-[300px] truncate" title={obra.observacoes}>
                              {obra.observacoes}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-3 text-sm text-slate-600">{obra.quantidadePlacas}</td>
                        <td className="px-6 py-3 text-sm text-slate-600">R$ {obra.valorMaoObra}</td>
                        <td className="px-6 py-3 text-sm font-bold text-slate-900 text-right">R$ {obra.valorReceber.toLocaleString('pt-BR')}</td>
                      </tr>
                    ))}
                    {payrollData.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">Nenhum registro encontrado para este período.</td></tr>
                    )}
                  </tbody>
                  <tfoot className="bg-indigo-50 font-bold">
                    <tr>
                      <td colSpan={2} className="px-6 py-4 text-indigo-900">TOTAIS</td>
                      <td className="px-6 py-4 text-indigo-900">{totals.placas}</td>
                      <td className="px-6 py-4"></td>
                      <td className="px-6 py-4 text-indigo-900 text-right">R$ {totals.valor.toLocaleString('pt-BR')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => exportPayroll('excel')} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-6 py-3 rounded-xl font-bold hover:bg-emerald-100 transition-all border border-emerald-200">
                  <FileSpreadsheet size={20} /> Excel
                </button>
                <button onClick={() => exportPayroll('pdf')} className="flex items-center gap-2 bg-red-50 text-red-700 px-6 py-3 rounded-xl font-bold hover:bg-red-100 transition-all border border-red-200">
                  <Printer size={20} /> PDF
                </button>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center space-y-4">
              <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <Users size={32} />
              </div>
              <p className="text-slate-500 font-medium">Selecione uma equipe para gerar a folha de pagamento.</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${active ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-500 hover:bg-slate-200'}`}>
      {icon}
      {label}
    </button>
  );
}
function StatCard({ title, value, icon, color }: { title: string, value: string | number, icon: React.ReactNode, color: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-5">
      <div className={`${color} p-4 rounded-2xl`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Situacao }) {
  const styles = {
    'Pendente': 'bg-amber-100 text-amber-700 border-amber-200',
    'Em Andamento': 'bg-blue-100 text-blue-700 border-blue-200',
    'Concluído': 'bg-emerald-100 text-emerald-700 border-emerald-200'
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${styles[status]}`}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: Prioridade }) {
  const styles = {
    'Alta': 'text-red-600',
    'Média': 'text-amber-600',
    'Baixa': 'text-emerald-600'
  };
  return (
    <span className={`text-xs font-bold flex items-center gap-1.5 ${styles[priority]}`}>
      <span className={`w-2 h-2 rounded-full ${priority === 'Alta' ? 'bg-red-600 animate-pulse' : priority === 'Média' ? 'bg-amber-600' : 'bg-emerald-600'}`} />
      {priority}
    </span>
  );
}

function FormField({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-500 ml-1">{label}</label>
      {children}
    </div>
  );
}
