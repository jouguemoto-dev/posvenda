/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ClipboardList, 
  Plus, 
  Trash2, 
  Edit, 
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
  Printer,
  Activity,
  Cpu,
  Wrench,
  Cloud,
  ChevronLeft,
  Palette,
  Trash
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Obra, Situacao, Prioridade, Filtros, User, UserRole, Vendedor, Equipe, Inversor, FormaPagamento, TeamMember, Schedule } from './types';
import { auth, db, googleProvider, signInWithPopup, signOut } from './firebase';
import EscalaView from './components/EscalaView';
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
  const [activeTab, setActiveTab] = useState<'obras' | 'servicos' | 'escala'>('obras');
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
  
  const [obraToDelete, setObraToDelete] = useState<number | null>(null);
  const [servicoToDelete, setServicoToDelete] = useState<number | null>(null);
  const [selectedObra, setSelectedObra] = useState<Obra | null>(null);
  const [selectedServico, setSelectedServico] = useState<any | null>(null);
  const [importText, setImportText] = useState('');
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoServicoId, setEditandoServicoId] = useState<number | null>(null);
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
    observacoes: ''
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
    observacao: ''
  });

  const [valorMaoObraOutros, setValorMaoObraOutros] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const ativas = obras.filter(o => o.situacao !== 'Concluído').length;
    const concluidas = obras.filter(o => o.situacao === 'Concluído').length;
    const valorTotal = obras.reduce((sum, o) => sum + o.valorReceber, 0);
    return { total, ativas, concluidas, valorTotal };
  }, [obras]);

  const filteredObras = useMemo(() => {
    return obras.filter(obra => {
      if (filtros.situacao && obra.situacao !== filtros.situacao) return false;
      if (filtros.prioridade && obra.prioridade !== filtros.prioridade) return false;
      if (filtros.cliente && !obra.cliente.toLowerCase().includes(filtros.cliente.toLowerCase())) return false;
      if (filtros.vendedor && !obra.vendedor.toLowerCase().includes(filtros.vendedor.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      const prioridadeOrder = { 'Alta': 1, 'Média': 2, 'Baixa': 3 };
      
      // High Priority always at the top
      if (a.prioridade === 'Alta' && b.prioridade !== 'Alta') return -1;
      if (a.prioridade !== 'Alta' && b.prioridade === 'Alta') return 1;
      
      // Otherwise, older first (newer below older)
      return a.id - b.id;
    });
  }, [obras, filtros]);

  const activeObras = useMemo(() => filteredObras.filter(o => o.situacao !== 'Concluído'), [filteredObras]);
  const scheduledObras = useMemo(() => activeObras.filter(o => o.dataObra && o.dataObra !== ''), [activeObras]);
  const unscheduledObras = useMemo(() => activeObras.filter(o => !o.dataObra || o.dataObra === ''), [activeObras]);
  
  const archivedObras = useMemo(() => {
    return obras.filter(o => {
      if (o.situacao !== 'Concluído') return false;
      if (filtrosArquivados.cliente && !o.cliente.toLowerCase().includes(filtrosArquivados.cliente.toLowerCase())) return false;
      if (filtrosArquivados.vendedor && !o.vendedor.toLowerCase().includes(filtrosArquivados.vendedor.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.id - a.id); // Newer first for archive
  }, [obras, filtrosArquivados]);

  const filteredServicos = useMemo(() => {
    return servicos.filter(servico => {
      if (filtros.situacao && servico.situacao !== filtros.situacao) return false;
      if (filtros.prioridade && servico.prioridade !== filtros.prioridade) return false;
      if (filtros.cliente && !servico.cliente.toLowerCase().includes(filtros.cliente.toLowerCase())) return false;
      if (filtros.vendedor && !servico.vendedor.toLowerCase().includes(filtros.vendedor.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      if (a.prioridade === 'Alta' && b.prioridade !== 'Alta') return -1;
      if (a.prioridade !== 'Alta' && b.prioridade === 'Alta') return 1;
      return a.id - b.id;
    });
  }, [servicos, filtros]);

  const activeServicos = useMemo(() => {
    return filteredServicos
      .filter(s => s.situacao !== 'Concluído');
  }, [filteredServicos]);

  const inProgressServicos = useMemo(() => {
    return activeServicos.filter(s => s.situacao === 'Em Andamento')
      .sort((a, b) => {
        if (a.prioridade === 'Alta' && b.prioridade !== 'Alta') return -1;
        if (a.prioridade !== 'Alta' && b.prioridade === 'Alta') return 1;
        return a.id - b.id;
      });
  }, [activeServicos]);

  const pendingServicos = useMemo(() => {
    return activeServicos.filter(s => s.situacao === 'Pendente')
      .sort((a, b) => {
        if (a.prioridade === 'Alta' && b.prioridade !== 'Alta') return -1;
        if (a.prioridade !== 'Alta' && b.prioridade === 'Alta') return 1;
        return a.id - b.id;
      });
  }, [activeServicos]);
  
  const archivedServicos = useMemo(() => {
    return servicos.filter(s => {
      if (s.situacao !== 'Concluído') return false;
      if (filtrosArquivados.cliente && !s.cliente.toLowerCase().includes(filtrosArquivados.cliente.toLowerCase())) return false;
      if (filtrosArquivados.vendedor && !s.vendedor.toLowerCase().includes(filtrosArquivados.vendedor.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.id - a.id);
  }, [servicos, filtrosArquivados]);

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

  const syncToWeeklySchedule = async (dateStr: string, teamName: string, clientName: string) => {
    if (!dateStr || !teamName || !clientName) return;

    try {
      const teamsSnapshot = await getDocs(collection(db, 'teams'));
      let teamDoc = teamsSnapshot.docs.find(doc => 
        doc.data().name.trim().toLowerCase() === teamName.trim().toLowerCase()
      );
      
      let teamId: string;

      if (!teamDoc) {
        // Auto-create team if it doesn't exist in the schedule view
        const newTeamRef = await addDoc(collection(db, 'teams'), { 
          name: teamName.trim(),
          createdAt: serverTimestamp() 
        });
        teamId = newTeamRef.id;
        console.log(`Equipe "${teamName}" criada automaticamente na escala.`);
      } else {
        teamId = teamDoc.id;
      }

      const BASE_DATE = new Date('2026-04-06T00:00:00');
      const targetDate = new Date(dateStr + 'T00:00:00');
      
      const diffTime = targetDate.getTime() - BASE_DATE.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weekOffset = Math.floor(diffDays / 7);
      
      const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const dayName = days[targetDate.getDay()];

      const docId = `week_${weekOffset}`;
      const scheduleRef = doc(db, 'schedules', docId);
      const scheduleSnap = await getDoc(scheduleRef);

      let scheduleData: any = {};
      if (scheduleSnap.exists()) {
        try {
          scheduleData = JSON.parse(scheduleSnap.data().data);
        } catch (e) {
          console.error("Error parsing schedule data", e);
        }
      }

      if (!scheduleData[dayName]) scheduleData[dayName] = {};
      if (!scheduleData[dayName][teamId]) scheduleData[dayName][teamId] = { text: '', color: '#ffffff' };

      const currentText = scheduleData[dayName][teamId].text;
      const clientEntry = `Cliente: ${clientName}`;
      
      if (!currentText.includes(clientEntry)) {
        scheduleData[dayName][teamId].text = currentText ? `${currentText}\n${clientEntry}` : clientEntry;
        
        await setDoc(scheduleRef, {
          weekOffset,
          data: JSON.stringify(scheduleData),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
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

    doc.setFontSize(18);
    doc.text("Relatório de Obras Selecionadas", 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Relatorio_Obras_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleServicoInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setServicoFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const valorMaoObraFinal = formData.valorMaoObra === 0 ? parseFloat(valorMaoObraOutros) || 0 : formData.valorMaoObra || 0;
    
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
      dataConclusao: formData.dataConclusao || '',
      equipe: formData.equipe || '',
      inversor: formData.inversor || '',
      formaPagamento: formData.formaPagamento || '',
      observacoes: formData.observacoes || '',
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
        await syncToWeeklySchedule(obraData.dataObra, obraData.equipe, obraData.cliente);
      }
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'obras');
    }
  };

  const handleServicoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
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
      equipeServico: servicoFormData.equipeServico || '',
      servico: servicoFormData.servico || '',
      valor: Number(servicoFormData.valor) || 0,
      equipeInstalou: servicoFormData.equipeInstalou || '',
      dataServico: servicoFormData.dataServico || '',
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
      if (servicoData.dataServico && servicoData.equipeInstalou) {
        await syncToWeeklySchedule(servicoData.dataServico, servicoData.equipeInstalou, servicoData.cliente);
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
      observacoes: ''
    });
    setValorMaoObraOutros('');
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
      observacao: ''
    });
    setEditandoServicoId(null);
    setIsServicoFormOpen(false);
  };

  const handleEdit = (obra: Obra) => {
    setFormData({
      ...obra
    });
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

  const exportarJSON = () => {
    const dataStr = JSON.stringify(obras, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_obras_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const reader = new FileReader();
    
    if (file.name.endsWith('.json')) {
      reader.onload = (event) => {
        try {
          const dados = JSON.parse(event.target?.result as string);
          if (Array.isArray(dados)) {
            setObras(dados);
            alert('Backup importado com sucesso!');
          }
        } catch (err) {
          alert('Erro ao importar arquivo JSON.');
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
        if (!line.trim() || line.includes('Situação') || line.includes('Registro')) continue;
        
        const cols = line.split('\t'); // Tab separated (Excel/Sheets)
        
        const obraData = {
          id: Date.now() + i,
          numeroRegistro: String(obras.length + count + 1).padStart(3, '0'),
          situacao: (cols[0] as Situacao) || 'Pendente',
          prioridade: (cols[1] as Prioridade) || 'Média',
          cliente: cols[2] || 'Importado',
          vendedor: cols[3] || '',
          local: cols[4] || '',
          dataChegadaPlacas: normalizeDate(cols[5]),
          dataContrato: normalizeDate(cols[6]) || new Date().toISOString().split('T')[0],
          quantidadePlacas: Number(cols[7]) || 0,
          valorMaoObra: Number(cols[8]) || 60,
          valorReceber: (Number(cols[7]) || 0) * (Number(cols[8]) || 0),
          dataObra: normalizeDate(cols[9]),
          dataConclusao: normalizeDate(cols[10]),
          equipe: cols[11] || '',
          inversor: cols[12] || '',
          formaPagamento: cols[14] || '',
          observacoes: cols[13] || '',
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
        if (!line.trim() || line.includes('Situação') || line.includes('Registro')) continue;
        
        const cols = line.split('\t');
        
        const servicoData = {
          id: Date.now() + i,
          numeroRegistro: String(servicos.length + count + 1).padStart(3, '0'),
          situacao: (cols[0] as Situacao) || 'Pendente',
          prioridade: (cols[1] as Prioridade) || 'Média',
          dataAtendimento: normalizeDate(cols[2]) || new Date().toISOString().split('T')[0],
          cliente: cols[3] || 'Importado',
          local: cols[4] || '',
          vendedor: cols[5] || '',
          equipeServico: cols[6] || '',
          servico: cols[7] || '',
          valor: Number(cols[8]) || 0,
          equipeInstalou: cols[9] || '',
          dataServico: normalizeDate(cols[10]),
          observacao: cols[11] || '',
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
        'Observação'
      ];
      
      const exampleData = [
        ['Pendente', 'Média', '12/05/2024', 'Maria Souza', 'Av. Central, 456', 'Roberto', 'Equipe Beta', 'Manutenção Inversor', '250', 'Equipe Alfa', '14/05/2024', 'Verificar conectores']
      ];

      const ws = XLSX.utils.aoa_to_sheet([headers, ...exampleData]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Modelo Importação Serviços");
      XLSX.writeFile(wb, "modelo_importacao_servicos.xlsx");
    }
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
    doc.text("Relatório de Obras", 14, 15);
    
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
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 8 }
    });

    doc.save(`obras_${new Date().toISOString().split('T')[0]}.pdf`);
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

  const gerarReciboServicoPDF = (s: any) => {
    const doc = new jsPDF();
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - (margin * 2);
    
    // --- HEADER BOX ---
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(margin, margin, contentWidth, 25);
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text("RECIBO", margin + 5, margin + 17);
    
    doc.setFontSize(12);
    doc.text(`Nº: ${s.numeroRegistro}`, margin + contentWidth - 5, margin + 10, { align: 'right' });
    doc.setFontSize(14);
    doc.text(`VALOR: R$ ${Number(s.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin + contentWidth - 5, margin + 20, { align: 'right' });
    
    // --- BODY BOX ---
    doc.rect(margin, margin + 25, contentWidth, 140);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    
    const today = new Date();
    const dia = String(today.getDate()).padStart(2, '0');
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const mes = meses[today.getMonth()];
    const ano = today.getFullYear();
    
    const textoRecibo = `Declaro ter recebido nesta data a quantia de R$ ${Number(s.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de ${s.cliente.toUpperCase()}, referente ao pagamento do serviço de ${s.servico ? s.servico.toUpperCase() : 'N/A'} realizado no local ${s.local ? s.local.toUpperCase() : 'N/A'}.`;
    
    const splitTexto = doc.splitTextToSize(textoRecibo, contentWidth - 20);
    doc.text(splitTexto, margin + 10, margin + 50, { align: 'justify', lineHeightFactor: 1.5 });
    
    doc.text("E para maior clareza, afirmo o presente.", margin + 10, margin + 85);
    
    // City and Date
    doc.text(`${s.local ? s.local.split(',')[0] : 'Brasil'}, ${dia} de ${mes} de ${ano}.`, pageWidth / 2, margin + 110, { align: 'center' });
    
    // Signature Line
    doc.line(pageWidth / 2 - 40, margin + 135, pageWidth / 2 + 40, margin + 135);
    doc.setFont("helvetica", "bold");
    doc.text("ASSINATURA", pageWidth / 2, margin + 142, { align: 'center' });
    
    // Footer Info
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(150);
    doc.text(`Gerado pelo Sistema de Gestão de Obras - ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 285, { align: 'center' });
    
    doc.save(`recibo_${s.numeroRegistro}_${s.cliente.replace(/\s+/g, '_')}.pdf`);
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
      <main className="flex-1 overflow-y-auto p-2 md:p-4 scrollbar-hide">
        <div className="w-full space-y-4">
          {activeTab === 'escala' ? (
            <EscalaView 
              onBack={() => setActiveTab('obras')} 
              obras={obras} 
              servicos={servicos} 
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
                <option value="Concluído">Concluído</option>
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
        </section>

        {/* Main Content - Obras or Servicos */}
        {activeTab === 'obras' ? (
          <div className="space-y-8">
            {/* Section: Obras Agendadas (Highlighted) */}
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
                      <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Reg.</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Prior.</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Cliente</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider text-center">Dias</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Local</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Vend.</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Equipe</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Previsão</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Financ.</th>
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
                            className={`hover:bg-indigo-50/50 transition-colors ${
                              obra.situacao === 'Pendente' ? 'bg-amber-50/40 border-l-4 border-amber-400' : 'bg-blue-50/40 border-l-4 border-blue-400'
                            } ${selectedIds.has(obra.id) ? 'bg-indigo-100/50' : ''}`}
                          >
                            <td className="px-3 py-3">
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
                            <td className="px-3 py-3">
                              <select 
                                value={obra.situacao}
                                onChange={(e) => updateObraQuick(obra.id, 'situacao', e.target.value)}
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border outline-none transition-all ${
                                  obra.situacao === 'Pendente' 
                                    ? 'bg-amber-100 text-amber-700 border-amber-200' 
                                    : 'bg-blue-100 text-blue-700 border-blue-200'
                                }`}
                              >
                                <option value="Pendente">Pendente</option>
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Concluído">Concluído</option>
                              </select>
                            </td>
                            <td className="px-3 py-3">
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
                              <div className="text-xs font-bold text-slate-900 min-w-[120px]">{obra.cliente}</div>
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
                            <td className="px-3 py-3 text-[10px] font-semibold text-slate-600 whitespace-nowrap">{obra.vendedor || '---'}</td>
                            <td className="px-3 py-3 text-[10px] whitespace-nowrap">
                              <div className="font-medium text-slate-700 bg-white/50 px-2 py-1 rounded border border-slate-200/50 inline-block">
                                {obra.equipe || '---'}
                              </div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-1 rounded-lg border border-indigo-200">
                                <Calendar size={10} /> {formatDateBR(obra.dataObra)}
                              </div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <div className="text-xs font-bold text-slate-900 leading-tight">R$ {obra.valorReceber.toLocaleString('pt-BR')}</div>
                              <div className="text-[9px] text-slate-500 uppercase tracking-tighter">{obra.quantidadePlacas} Placas</div>
                            </td>
                            <td className="px-3 py-3 text-right">
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

            {/* Section: Obras em Espera (Without Scheduled Date) */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-bold text-slate-700 flex items-center gap-2">
                  <Clock size={18} className="text-amber-500" />
                  Obras em Espera (Sem Data Prevista)
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
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Reg.</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prior.</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Dias</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Local</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vend.</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Equipe</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Contrato</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Financ.</th>
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
                            className={`hover:bg-slate-50 transition-colors ${
                              obra.situacao === 'Pendente' ? 'bg-amber-50/60 border-l-4 border-amber-400' : 'bg-blue-50/60 border-l-4 border-blue-400'
                            } ${selectedIds.has(obra.id) ? 'bg-indigo-50/80' : ''}`}
                          >
                            <td className="px-3 py-3">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                                checked={selectedIds.has(obra.id)}
                                onChange={() => toggleSelect(obra.id)}
                              />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-1 rounded border border-indigo-100">
                                #{obra.numeroRegistro}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <select 
                                value={obra.situacao}
                                onChange={(e) => updateObraQuick(obra.id, 'situacao', e.target.value)}
                                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border outline-none transition-all ${
                                  obra.situacao === 'Pendente' 
                                    ? 'bg-amber-100 text-amber-700 border-amber-200' 
                                    : 'bg-blue-100 text-blue-700 border-blue-200'
                                }`}
                              >
                                <option value="Pendente">Pendente</option>
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Concluído">Concluído</option>
                              </select>
                            </td>
                            <td className="px-3 py-3">
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
                              <div className="text-xs font-bold text-slate-900 min-w-[120px]">{obra.cliente}</div>
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
                            <td className="px-3 py-3 text-[10px] font-semibold text-slate-600 whitespace-nowrap">{obra.vendedor || '---'}</td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] font-medium text-slate-700 bg-white/50 px-2 py-1 rounded border border-slate-200/50 inline-block">
                                {obra.equipe || '---'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">
                              {formatDateBR(obra.dataContrato)}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <div className="text-xs font-bold text-slate-900 leading-tight">R$ {obra.valorReceber.toLocaleString('pt-BR')}</div>
                              <div className="text-[9px] text-slate-500 uppercase tracking-tighter">{obra.quantidadePlacas} Placas</div>
                            </td>
                            <td className="px-3 py-3 text-right">
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

            {/* Archived Obras - Spreadsheet Table */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-slate-700 flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-emerald-500" />
                    Registros Arquivados (Concluídos)
                  </h2>
                  <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                    {archivedObras.length} obras
                  </span>
                </div>
                
                {/* Local Filters for Archive */}
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
              </div>
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
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Registro</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dias</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Local</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendedor</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Equipe</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Conclusão</th>
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
                            className={`hover:bg-slate-50 transition-colors bg-emerald-50/40 border-l-4 border-emerald-400 ${selectedIds.has(obra.id) ? 'bg-emerald-100/80' : ''}`}
                          >
                            <td className="px-3 py-3">
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
                              <div className="text-xs font-bold text-slate-900 min-w-[120px]">{obra.cliente}</div>
                            </td>
                            <td className="px-3 py-3 text-[10px] text-slate-500 font-medium whitespace-nowrap">
                              {getDaysDiff(obra.dataContrato)} d
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] text-slate-500 min-w-[100px]">{obra.local || '---'}</div>
                            </td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">{obra.vendedor || '---'}</td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 font-medium">{obra.equipe || '---'}</td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">
                              {formatDateBR(obra.dataConclusao)}
                            </td>
                            <td className="px-3 py-3 text-xs font-bold text-slate-900 whitespace-nowrap">
                              R$ {obra.valorReceber.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-3 py-3 text-right">
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
            </section>
          </div>
        ) : (
          <>
            {/* Section: Em Andamento */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-6">
              <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                <h2 className="font-bold text-blue-700 flex items-center gap-2">
                  <Play size={18} className="fill-blue-600" />
                  Serviços em Andamento
                </h2>
                <span className="text-xs font-bold text-blue-600 bg-white px-2 py-1 rounded-lg border border-blue-200 shadow-sm">
                  {inProgressServicos.length} ativos
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
                          checked={inProgressServicos.length > 0 && inProgressServicos.every(s => selectedIds.has(s.id))}
                          onChange={() => toggleSelectAll(inProgressServicos)}
                        />
                      </th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">N°</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Situação</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prioridade</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Atendimento</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Dias</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Local</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendedor</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Equipe</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Serviço</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Valor</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Instalou</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <AnimatePresence mode="popLayout">
                      {inProgressServicos.length > 0 ? (
                        inProgressServicos.map((servico) => (
                          <motion.tr 
                            key={servico.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`hover:bg-slate-50 transition-colors bg-blue-50/20 border-l-4 border-blue-400 ${selectedIds.has(servico.id) ? 'bg-indigo-100/50' : ''}`}
                          >
                            <td className="px-3 py-3 whitespace-nowrap">
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
                            <td className="px-3 py-3">
                              <select 
                                value={servico.situacao}
                                onChange={(e) => updateServicoQuick(servico.id, 'situacao', e.target.value)}
                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border outline-none transition-all bg-blue-100 text-blue-700 border-blue-200"
                              >
                                <option value="Pendente">Pendente</option>
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Concluído">Concluído</option>
                              </select>
                            </td>
                            <td className="px-3 py-3">
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
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">
                              {formatDateBR(servico.dataAtendimento)}
                            </td>
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
                              <div className="text-xs font-bold text-slate-900 min-w-[120px]">{servico.cliente}</div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] text-slate-600 min-w-[100px]">{servico.local || '---'}</div>
                            </td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">{servico.vendedor || '---'}</td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] font-medium text-slate-700 bg-white/50 px-2 py-1 rounded border border-slate-200/50 inline-block">
                                {servico.equipeServico || '---'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[10px] font-semibold text-slate-600 min-w-[120px]">{servico.servico || '---'}</td>
                            <td className="px-3 py-3 text-xs font-bold text-slate-900 whitespace-nowrap leading-tight">R$ {Number(servico.valor).toLocaleString('pt-BR')}</td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">{servico.equipeInstalou || '---'}</td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">{formatDateBR(servico.dataServico)}</td>
                            <td className="px-3 py-3 text-right">
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
                            Nenhum serviço em andamento.
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </section>

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
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">N°</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Situação</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prioridade</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Atendimento</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Dias</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Local</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendedor</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Equipe</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Serviço</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Valor</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Instalou</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data</th>
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
                            className={`hover:bg-slate-50 transition-colors bg-amber-50/20 border-l-4 border-amber-400 ${selectedIds.has(servico.id) ? 'bg-indigo-100/50' : ''}`}
                          >
                            <td className="px-3 py-3 whitespace-nowrap">
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
                            <td className="px-3 py-3">
                              <select 
                                value={servico.situacao}
                                onChange={(e) => updateServicoQuick(servico.id, 'situacao', e.target.value)}
                                className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border outline-none transition-all bg-amber-100 text-amber-700 border-amber-200"
                              >
                                <option value="Pendente">Pendente</option>
                                <option value="Em Andamento">Em Andamento</option>
                                <option value="Concluído">Concluído</option>
                              </select>
                            </td>
                            <td className="px-3 py-3">
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
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">
                              {formatDateBR(servico.dataAtendimento)}
                            </td>
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
                              <div className="text-xs font-bold text-slate-900 min-w-[120px]">{servico.cliente}</div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] text-slate-600 min-w-[100px]">{servico.local || '---'}</div>
                            </td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">{servico.vendedor || '---'}</td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] font-medium text-slate-700 bg-white/50 px-2 py-1 rounded border border-slate-200/50 inline-block">
                                {servico.equipeServico || '---'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[10px] font-semibold text-slate-600 min-w-[120px]">{servico.servico || '---'}</td>
                            <td className="px-3 py-3 text-xs font-bold text-slate-900 whitespace-nowrap leading-tight">R$ {Number(servico.valor).toLocaleString('pt-BR')}</td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">{servico.equipeInstalou || '---'}</td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">{formatDateBR(servico.dataServico)}</td>
                            <td className="px-3 py-3 text-right">
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
                </div>

                {/* Local Filters for Archive */}
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
              </div>
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
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">N°</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Situação</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prioridade</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Atendimento</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dias</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Local</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Vendedor</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Equipe</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Serviço</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Valor</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Instalou</th>
                      <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data</th>
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
                            className={`hover:bg-slate-50 transition-colors ${selectedIds.has(servico.id) ? 'bg-emerald-100/50' : ''}`}
                          >
                            <td className="px-3 py-3 whitespace-nowrap">
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
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">
                              {formatDateBR(servico.dataAtendimento)}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <div className="text-[10px] font-bold px-2 py-1 rounded inline-block bg-slate-100 text-slate-600">
                                {getDaysDiff(servico.dataAtendimento)} d
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-xs font-bold text-slate-900 min-w-[120px]">{servico.cliente}</div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] text-slate-600 min-w-[100px]">{servico.local || '---'}</div>
                            </td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">{servico.vendedor || '---'}</td>
                            <td className="px-3 py-3">
                              <div className="text-[10px] font-medium text-slate-700 bg-white/50 px-2 py-1 rounded border border-slate-200/50 inline-block">
                                {servico.equipeServico || '---'}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[10px] font-semibold text-slate-600 min-w-[120px]">{servico.servico || '---'}</td>
                            <td className="px-3 py-3 text-xs font-bold text-slate-900 whitespace-nowrap leading-tight">R$ {Number(servico.valor).toLocaleString('pt-BR')}</td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 min-w-[80px]">{servico.equipeInstalou || '---'}</td>
                            <td className="px-3 py-3 text-[10px] text-slate-600 whitespace-nowrap">{formatDateBR(servico.dataServico)}</td>
                            <td className="px-3 py-3 text-right">
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
            </section>
          </>
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
                          value={formData.quantidadePlacas}
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
                              value={valorMaoObraOutros}
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
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="Equipe Responsável">
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
                        <input 
                          type="text" 
                          name="cliente"
                          required
                          value={servicoFormData.cliente}
                          onChange={handleServicoInputChange}
                          placeholder="Nome do cliente"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
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
                          value={servicoFormData.valor}
                          onChange={handleServicoInputChange}
                          placeholder="0,00"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </FormField>
                      <FormField label="Equipe Serviço">
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
                      </FormField>
                      <FormField label="Equipe que Instalou">
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
                          <div className="md:col-span-3">
                            <DetailItem label="Forma de Pagamento" value={selectedObra.formaPagamento || '---'} />
                          </div>
                        </div>
                      </div>

                      <hr className="border-slate-100" />

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
                        <div className="md:col-span-2">
                          <DetailItem label="Local do Serviço" value={selectedServico.local || '---'} icon={<MapPin size={14} />} />
                        </div>
                        <DetailItem label="Valor do Serviço" value={`R$ ${Number(selectedServico.valor).toLocaleString('pt-BR')}`} icon={<DollarSign size={14} />} />
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
                    </>
                  ) : null}
                </div>
              </div>
              
              {/* Footer */}
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-2">
                  {selectedObra && (
                    <button 
                      onClick={() => exportarIndividualTXT(selectedObra)}
                      className="flex items-center gap-2 text-xs font-bold text-emerald-600 hover:bg-emerald-100 px-4 py-2.5 rounded-xl transition-all border border-emerald-200"
                    >
                      <FileText size={16} />
                      Exportar TXT
                    </button>
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
        isAdmin={currentUser.role === 'Admin'}
      />

      {/* Payroll Modal */}
      <PayrollModal 
        isOpen={isPayrollOpen}
        onClose={() => setIsPayrollOpen(false)}
        obras={obras}
        equipes={equipes}
      />
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
function SettingsModal({ isOpen, onClose, vendedores, equipes, inversores, formasPagamento, onSave, onDelete, isAdmin }: any) {
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
          <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 space-y-2">
            <TabButton active={activeTab === 'vendedores'} onClick={() => { setActiveTab('vendedores'); setIsAdding(false); }} icon={<UserIcon size={18} />} label="Vendedores" />
            <TabButton active={activeTab === 'equipes'} onClick={() => { setActiveTab('equipes'); setIsAdding(false); }} icon={<Users size={18} />} label="Equipes" />
            <TabButton active={activeTab === 'inversores'} onClick={() => { setActiveTab('inversores'); setIsAdding(false); }} icon={<BarChart3 size={18} />} label="Inversores" />
            <TabButton active={activeTab === 'formasPagamento'} onClick={() => { setActiveTab('formasPagamento'); setIsAdding(false); }} icon={<DollarSign size={18} />} label="Pagamentos" />
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 capitalize">{activeTab}</h3>
              {isAdmin && !isAdding && (
                <button onClick={() => { setIsAdding(true); setFormData({ ativo: true }); }} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all">
                  <Plus size={18} /> Novo Cadastro
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
              {isAdding ? (
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
function PayrollModal({ isOpen, onClose, obras, equipes }: any) {
  const [period, setPeriod] = useState('Mensal');
  const [selectedEquipe, setSelectedEquipe] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

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
                        <td className="px-6 py-3 text-sm font-bold text-slate-900">{obra.cliente}</td>
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
