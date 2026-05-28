import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar as CalendarIcon,
  Search,
  X,
  StickyNote,
  Edit2,
  Activity,
  ArrowLeft,
  Pin
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth } from '../firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';

interface Note {
  id: string;
  firebaseId?: string;
  content: string;
  date: string;
  status: 'Pendente' | 'Em Andamento' | 'Concluído';
  color: string;
  userId: string;
  userName: string;
  atendente?: string;
  categoria?: 'Geral' | 'Instalação' | 'Financeiro' | 'Pós-Venda' | 'Cobrança' | 'Outros';
  createdAt: any;
  pinned?: boolean;
}

const COLORS = [
  { name: 'Amarelo', bg: 'bg-amber-100', border: 'border-amber-200', text: 'text-amber-800', marker: 'border-amber-400' },
  { name: 'Azul', bg: 'bg-sky-100', border: 'border-sky-200', text: 'text-sky-800', marker: 'border-sky-400' },
  { name: 'Verde', bg: 'bg-emerald-100', border: 'border-emerald-200', text: 'text-emerald-800', marker: 'border-emerald-400' },
  { name: 'Rosa', bg: 'bg-rose-100', border: 'border-rose-200', text: 'text-rose-800', marker: 'border-rose-400' },
  { name: 'Roxo', bg: 'bg-purple-100', border: 'border-purple-200', text: 'text-purple-800', marker: 'border-purple-400' },
  { name: 'Laranja', bg: 'bg-orange-100', border: 'border-orange-200', text: 'text-orange-800', marker: 'border-orange-400' },
];

const NotebookView: React.FC<{ 
  user: { id: string; name: string }; 
  attendants?: string[];
  onBack: () => void;
}> = ({ user, attendants = [], onBack }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [filterAttendant, setFilterAttendant] = useState<string>('Todos');
  const [filterCategory, setFilterCategory] = useState<string>('Todos');
  const [isCustomAttendant, setIsCustomAttendant] = useState(false);
  
  const [formData, setFormData] = useState({
    content: '',
    date: new Date().toISOString().split('T')[0],
    status: 'Pendente' as Note['status'],
    color: COLORS[0].bg,
    atendente: user.name,
    categoria: 'Geral' as Note['categoria']
  });

  // Firestore Listeners
  useEffect(() => {
    const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notesList = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        firebaseId: doc.id
      })) as Note[];
      setNotes(notesList);
    });
    return () => unsubscribe();
  }, []);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.content.trim()) return;

    try {
      if (editingNoteId) {
        // Edit existing note
        await updateDoc(doc(db, 'notes', editingNoteId), {
          content: formData.content,
          date: formData.date,
          status: formData.status,
          color: formData.color,
          atendente: formData.atendente,
          categoria: formData.categoria || 'Geral',
          updatedAt: serverTimestamp()
        });
      } else {
        // Create new note
        await addDoc(collection(db, 'notes'), {
          content: formData.content,
          date: formData.date,
          status: formData.status,
          color: formData.color,
          atendente: formData.atendente,
          categoria: formData.categoria || 'Geral',
          userId: auth.currentUser?.uid || user.id,
          userName: user.name,
          createdAt: serverTimestamp(),
          pinned: false
        });
      }
      setIsFormOpen(false);
      setEditingNoteId(null);
      setIsCustomAttendant(false);
      setFormData({
        content: '',
        date: new Date().toISOString().split('T')[0],
        status: 'Pendente',
        color: COLORS[0].bg,
        atendente: user.name,
        categoria: 'Geral'
      });
    } catch (error) {
      console.error("Error saving note: ", error);
    }
  };

  const openAddModal = () => {
    setEditingNoteId(null);
    setFormData({
      content: '',
      date: new Date().toISOString().split('T')[0],
      status: 'Pendente',
      color: COLORS[0].bg,
      atendente: user.name,
      categoria: 'Geral'
    });
    setIsCustomAttendant(false);
    setIsFormOpen(true);
  };

  const openEditModal = (note: Note) => {
    setEditingNoteId(note.firebaseId || note.id);
    setFormData({
      content: note.content || '',
      date: note.date || new Date().toISOString().split('T')[0],
      status: note.status || 'Pendente',
      color: note.color || COLORS[0].bg,
      atendente: note.atendente || note.userName || user.name,
      categoria: note.categoria || 'Geral'
    });
    const isCustom = !attendants.includes(note.atendente || '') && (note.atendente !== user.name);
    setIsCustomAttendant(isCustom);
    setIsFormOpen(true);
  };

  const handleUpdateStatus = async (firebaseId: string, status: Note['status']) => {
    try {
      await updateDoc(doc(db, 'notes', firebaseId), { status });
    } catch (error) {
      console.error("Error updating status: ", error);
    }
  };

  const handleDeleteNote = async (firebaseId: string) => {
    try {
      await deleteDoc(doc(db, 'notes', firebaseId));
      setNoteToDelete(null);
    } catch (error) {
      console.error("Error deleting note: ", error);
    }
  };

  const handleTogglePin = async (note: Note) => {
    const noteId = note.firebaseId || note.id;
    if (!noteId) return;
    try {
      await updateDoc(doc(db, 'notes', noteId), {
        pinned: !note.pinned
      });
    } catch (error) {
      console.error("Error toggling pin status: ", error);
    }
  };

  // Get unique list of attendants present in downloaded notes to build filter dropdown
  const uniqueAttendants = useMemo(() => {
    const list = new Set<string>();
    notes.forEach(note => {
      const att = (note.atendente || note.userName || '').trim();
      if (att) list.add(att);
    });
    return Array.from(list).sort();
  }, [notes]);

  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      const matchesSearch = note.content.toLowerCase().includes(search.toLowerCase()) || 
                           note.userName.toLowerCase().includes(search.toLowerCase()) ||
                           (note.atendente && note.atendente.toLowerCase().includes(search.toLowerCase()));
      
      const matchesStatus = filterStatus === 'Todos' || note.status === filterStatus;
      
      const currentAtendente = note.atendente || note.userName || '';
      const matchesAttendant = filterAttendant === 'Todos' || currentAtendente.toLowerCase() === filterAttendant.toLowerCase();
      
      const matchesCategory = filterCategory === 'Todos' || (note.categoria || 'Geral') === filterCategory;
      
      return matchesSearch && matchesStatus && matchesAttendant && matchesCategory;
    });
  }, [notes, search, filterStatus, filterAttendant, filterCategory]);

  const sortedNotes = useMemo(() => {
    return [...filteredNotes].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0; // maintain default Firestore order (createdAt desc)
    });
  }, [filteredNotes]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-all active:scale-90"
            title="Voltar"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-xl">
              <StickyNote className="text-indigo-600" size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Bloco de Notas</h2>
              <p className="text-xs text-slate-500 font-medium">{notes.length} notas registradas</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] md:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Buscar notas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800"
            />
          </div>
          
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
          >
            <option value="Todos">Filtro: Todos Status</option>
            <option value="Pendente">Pendentes</option>
            <option value="Em Andamento">Em Andamento</option>
            <option value="Concluído">Concluídos</option>
          </select>

          <select 
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
          >
            <option value="Todos">Filtro: Todas Categorias</option>
            <option value="Geral">📂 Geral</option>
            <option value="Instalação">🛠️ Instalação</option>
            <option value="Financeiro">💰 Financeiro</option>
            <option value="Pós-Venda">📞 Pós-Venda</option>
            <option value="Cobrança">⚠️ Cobrança</option>
            <option value="Outros">💡 Outros</option>
          </select>

          <select 
            value={filterAttendant}
            onChange={(e) => setFilterAttendant(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
          >
            <option value="Todos">Filtro: Todos Atendentes</option>
            {uniqueAttendants.map(att => (
              <option key={att} value={att}>{att}</option>
            ))}
          </select>

          <button 
            onClick={openAddModal}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 transition-all active:scale-95 shrink-0"
          >
            <Plus size={18} />
            Nova Nota
          </button>
        </div>
      </div>

      {/* Adding/Editing Modal */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-slate-100"
            >
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800">
                  {editingNoteId ? 'Editar Nota' : 'Nova Nota'}
                </h3>
                <button onClick={() => {
                  setIsFormOpen(false);
                  setEditingNoteId(null);
                  setIsCustomAttendant(false);
                }} className="p-2 hover:bg-slate-200 rounded-xl transition-all">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              
              <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Conteúdo</label>
                  <textarea 
                    autoFocus
                    required
                    value={formData.content}
                    onChange={(e) => setFormData({...formData, content: e.target.value})}
                    placeholder="Escreva algo importante para registrar ou cobrar..."
                    className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-medium text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Atendente</label>
                      <button 
                        type="button"
                        onClick={() => setIsCustomAttendant(!isCustomAttendant)}
                        className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        {isCustomAttendant ? 'Selecionar da Lista' : 'Novo Atendente'}
                      </button>
                    </div>
                    
                    {isCustomAttendant ? (
                      <input 
                        type="text"
                        required
                        value={formData.atendente}
                        onChange={(e) => setFormData({...formData, atendente: e.target.value})}
                        placeholder="Nome do novo atendente"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 text-slate-800"
                      />
                    ) : (
                      <select 
                        value={formData.atendente}
                        onChange={(e) => setFormData({...formData, atendente: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none text-slate-800"
                      >
                        <option value={user.name}>{user.name} (Você)</option>
                        {attendants.filter(a => a !== user.name).map(a => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Data Ref.</label>
                    <input 
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none text-slate-800 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Status</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value as Note['status']})}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none text-slate-800 font-bold"
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Em Andamento">Em Andamento</option>
                      <option value="Concluído">Concluído</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Categoria</label>
                    <select 
                      value={formData.categoria}
                      onChange={(e) => setFormData({...formData, categoria: e.target.value as Note['categoria']})}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none text-slate-800 font-bold"
                    >
                      <option value="Geral">📂 Geral (Fatos / Avisos)</option>
                      <option value="Instalação">🛠️ Instalação (Agendamento / Obras)</option>
                      <option value="Financeiro">💰 Financeiro (Recebimentos / Caixa)</option>
                      <option value="Pós-Venda">📞 Pós-Venda (Retornos / Atendimento)</option>
                      <option value="Cobrança">⚠️ Cobrança (Pendências / Boletos)</option>
                      <option value="Outros">💡 Outros</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Cor do Post-it</label>
                  <div className="flex flex-wrap gap-2.5">
                    {COLORS.map(color => (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => setFormData({...formData, color: color.bg})}
                        className={`w-9 h-9 rounded-xl border-t-4 transition-all ${color.bg} ${color.marker} ${formData.color === color.bg ? 'border-2 border-indigo-600 scale-110 shadow-md' : 'border-transparent hover:scale-105'}`}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsFormOpen(false);
                      setEditingNoteId(null);
                      setIsCustomAttendant(false);
                    }}
                    className="flex-1 px-6 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all text-sm"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95 text-sm"
                  >
                    Salvar Nota
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {noteToDelete && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Excluir Nota?</h3>
                <p className="text-sm text-slate-500 font-medium">Tem certeza que deseja excluir esta nota? Esta ação não pode ser desfeita.</p>
              </div>
              
              <div className="p-6 bg-slate-50 flex gap-3">
                <button 
                  onClick={() => setNoteToDelete(null)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleDeleteNote(noteToDelete)}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notes Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-4">
        {sortedNotes.map((note, index) => {
          const colorSet = COLORS.find(c => c.bg === note.color) || COLORS[0];
          
          return (
            <motion.div 
              layout
              key={note.id}
              className={`${note.color} ${colorSet.border} border-t-4 ${colorSet.marker} p-5 rounded-2xl shadow-xs hover:shadow-lg transition-all duration-300 group relative ${index % 2 === 0 ? 'rotate-[-1deg]' : 'rotate-[1deg]'} hover:rotate-0 hover:-translate-y-1`}
            >
              {/* Retro Paper Sticky Tape Accent */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-14 h-5.5 bg-white/40 backdrop-blur-[1px] rotate-[-2deg] shadow-3xs border-l border-r border-white/20 select-none pointer-events-none" style={{ mixBlendMode: 'soft-light' }} />

              {/* Note Header */}
              <div className="flex items-start justify-between mb-3 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-white/60 rounded-full border border-white/50 backdrop-blur-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      note.status === 'Concluído' ? 'bg-emerald-500' : 
                      note.status === 'Em Andamento' ? 'bg-blue-500' : 'bg-amber-500'
                    }`} />
                    <span className="text-[9px] font-black text-slate-700 uppercase tracking-tight">{note.status}</span>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-tight ${
                    note.categoria === 'Financeiro' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800' :
                    note.categoria === 'Instalação' ? 'bg-amber-500/10 border-amber-500/20 text-amber-800' :
                    note.categoria === 'Pós-Venda' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-800' :
                    note.categoria === 'Cobrança' ? 'bg-rose-500/10 border-rose-500/20 text-rose-800' :
                    note.categoria === 'Outros' ? 'bg-slate-500/10 border-slate-500/20 text-slate-800' :
                    'bg-slate-500/10 border-slate-500/20 text-slate-800'
                  }`}>
                    {note.categoria || 'Geral'}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {note.pinned && (
                    <button 
                      onClick={() => handleTogglePin(note)}
                      className="p-1 text-slate-700 hover:text-slate-900 bg-white/70 rounded-full shadow-xs transition-all hover:scale-110"
                      title="Desfixar"
                    >
                      <Pin size={12} className="fill-indigo-600 text-indigo-600 rotate-45" />
                    </button>
                  )}
                  
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    {!note.pinned && (
                      <button 
                        onClick={() => handleTogglePin(note)}
                        className="p-1 hover:bg-black/5 text-slate-500 rounded-lg transition-all"
                        title="Fixar Nota"
                      >
                        <Pin size={12} />
                      </button>
                    )}
                    <button 
                      onClick={() => openEditModal(note)}
                      className="p-1 hover:bg-black/5 text-slate-600 rounded-lg transition-all"
                      title="Editar Nota"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button 
                      onClick={() => setNoteToDelete(note.firebaseId || note.id)}
                      className="p-1 hover:bg-red-100/55 text-red-500 rounded-lg transition-all"
                      title="Excluir"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Note Content */}
              <p className="text-slate-800 font-semibold text-sm leading-relaxed mb-4 whitespace-pre-wrap min-h-[60px]">
                {note.content}
              </p>

              {/* Note Footer */}
              <div className="pt-3 border-t border-black/5 flex items-center justify-between">
                <div className="flex flex-col min-w-0 flex-1 mr-2">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <CalendarIcon size={12} className="shrink-0" />
                    <span className="text-[10px] font-bold truncate">
                      {(() => {
                        if (!note.date) return '---';
                        try {
                          if (typeof note.date === 'string' && note.date.includes('-')) {
                            const parts = note.date.split('-');
                            if (parts.length === 3) {
                              return `${parts[2]}/${parts[1]}/${parts[0]}`;
                            }
                          }
                          const d = new Date(note.date);
                          return isNaN(d.getTime()) ? '---' : d.toLocaleDateString('pt-BR');
                        } catch (e) {
                          return '---';
                        }
                      })()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate" title={note.atendente || note.userName}>
                    Atend: <span className="text-slate-600 font-black">{note.atendente || note.userName}</span>
                  </div>
                </div>

                <div className="flex bg-white/40 p-0.5 rounded-xl gap-0.5 shrink-0">
                  <button 
                    onClick={() => handleUpdateStatus(note.firebaseId || note.id, 'Pendente')}
                    className={`p-1 rounded-lg transition-all ${note.status === 'Pendente' ? 'bg-white shadow-xs text-yellow-600' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Marcar como Pendente"
                  >
                    <Clock size={14} />
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(note.firebaseId || note.id, 'Em Andamento')}
                    className={`p-1 rounded-lg transition-all ${note.status === 'Em Andamento' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Marcar em Andamento"
                  >
                    <Activity size={14} />
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(note.firebaseId || note.id, 'Concluído')}
                    className={`p-1 rounded-lg transition-all ${note.status === 'Concluído' ? 'bg-white shadow-xs text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Marcar como Concluído"
                  >
                    <CheckCircle2 size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {sortedNotes.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400">
            <StickyNote size={48} className="mb-4 opacity-20" />
            <p className="font-medium text-sm">Nenhuma nota encontrada</p>
            <button 
              onClick={openAddModal}
              className="mt-4 text-indigo-600 font-bold hover:underline text-xs"
            >
              Criar primeira nota
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotebookView;
