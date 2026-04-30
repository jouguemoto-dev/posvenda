import React, { useState, useEffect } from 'react';
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
  MoreVertical,
  Check,
  Edit2,
  Activity,
  ArrowLeft,
  UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
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
  createdAt: any;
}

const COLORS = [
  { name: 'Amarelo', bg: 'bg-yellow-100', border: 'border-yellow-200', text: 'text-yellow-700', marker: 'bg-yellow-400' },
  { name: 'Azul', bg: 'bg-blue-100', border: 'border-blue-200', text: 'text-blue-700', marker: 'bg-blue-400' },
  { name: 'Verde', bg: 'bg-emerald-100', border: 'border-emerald-200', text: 'text-emerald-700', marker: 'bg-emerald-400' },
  { name: 'Rosa', bg: 'bg-pink-100', border: 'border-pink-200', text: 'text-pink-700', marker: 'bg-pink-400' },
  { name: 'Roxo', bg: 'bg-purple-100', border: 'border-purple-200', text: 'text-purple-700', marker: 'bg-purple-400' },
  { name: 'Laranja', bg: 'bg-orange-100', border: 'border-orange-200', text: 'text-orange-700', marker: 'bg-orange-400' },
];

const NotebookView: React.FC<{ 
  user: { id: string; name: string }; 
  attendants?: string[];
  onBack: () => void;
}> = ({ user, attendants = [], onBack }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('Todos');
  const [isCustomAttendant, setIsCustomAttendant] = useState(false);
  
  const [newNote, setNewNote] = useState({
    content: '',
    date: new Date().toISOString().split('T')[0],
    status: 'Pendente' as Note['status'],
    color: COLORS[0].bg,
    atendente: user.name
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

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.content.trim()) return;

    try {
      await addDoc(collection(db, 'notes'), {
        ...newNote,
        userId: user.id,
        userName: user.name,
        createdAt: serverTimestamp()
      });
      setNewNote({
        content: '',
        date: new Date().toISOString().split('T')[0],
        status: 'Pendente',
        color: COLORS[0].bg,
        atendente: user.name
      });
      setIsAddingMode(false);
      setIsCustomAttendant(false);
    } catch (error) {
      console.error("Error adding note: ", error);
    }
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

  const filteredNotes = notes.filter(note => {
    const matchesSearch = note.content.toLowerCase().includes(search.toLowerCase()) || 
                         note.userName.toLowerCase().includes(search.toLowerCase()) ||
                         (note.atendente && note.atendente.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = filterStatus === 'Todos' || note.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-all"
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

        <div className="flex items-center gap-2">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Buscar notas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>
          
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="Todos">Todos Status</option>
            <option value="Pendente">Pendentes</option>
            <option value="Em Andamento">Em Andamento</option>
            <option value="Concluído">Concluídos</option>
          </select>

          <button 
            onClick={() => setIsAddingMode(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 transition-all active:scale-95"
          >
            <Plus size={18} />
            Nova Nota
          </button>
        </div>
      </div>

      {/* Adding Modal */}
      <AnimatePresence>
        {isAddingMode && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-800">Adicionar Nota</h3>
                <button onClick={() => {
                  setIsAddingMode(false);
                  setIsCustomAttendant(false);
                }} className="p-2 hover:bg-slate-200 rounded-xl transition-all">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              
              <form onSubmit={handleAddNote} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Conteúdo</label>
                  <textarea 
                    autoFocus
                    required
                    value={newNote.content}
                    onChange={(e) => setNewNote({...newNote, content: e.target.value})}
                    placeholder="O que você deseja lembrar?"
                    className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none font-medium"
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
                        value={newNote.atendente}
                        onChange={(e) => setNewNote({...newNote, atendente: e.target.value})}
                        placeholder="Nome do novo atendente"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                      />
                    ) : (
                      <select 
                        value={newNote.atendente}
                        onChange={(e) => setNewNote({...newNote, atendente: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
                      >
                        <option value={user.name}>{user.name} (Você)</option>
                        {attendants.filter(a => a !== user.name).map(a => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Data</label>
                    <input 
                      type="date"
                      value={newNote.date}
                      onChange={(e) => setNewNote({...newNote, date: e.target.value})}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Status</label>
                    <select 
                      value={newNote.status}
                      onChange={(e) => setNewNote({...newNote, status: e.target.value as Note['status']})}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none"
                    >
                      <option value="Pendente">Pendente</option>
                      <option value="Em Andamento">Em Andamento</option>
                      <option value="Concluído">Concluído</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Cor do Post-it</label>
                  <div className="flex flex-wrap gap-3">
                    {COLORS.map(color => (
                      <button
                        key={color.name}
                        type="button"
                        onClick={() => setNewNote({...newNote, color: color.bg})}
                        className={`w-10 h-10 rounded-xl border-2 transition-all ${color.bg} ${newNote.color === color.bg ? 'border-indigo-500 scale-110 shadow-lg' : 'border-transparent'}`}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsAddingMode(false);
                      setIsCustomAttendant(false);
                    }}
                    className="flex-1 px-6 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredNotes.map((note) => {
          const colorSet = COLORS.find(c => c.bg === note.color) || COLORS[0];
          
          return (
            <motion.div 
              layout
              key={note.id}
              className={`${note.color} ${colorSet.border} border-t-4 ${colorSet.marker.replace('marker', 'border')} p-5 rounded-2xl shadow-sm hover:shadow-md transition-all group relative`}
            >
              {/* Note Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 px-2 py-0.5 bg-white/50 rounded-full border border-white/50 backdrop-blur-sm">
                  <span className={`w-2 h-2 rounded-full ${
                    note.status === 'Concluído' ? 'bg-emerald-500' : 
                    note.status === 'Em Andamento' ? 'bg-blue-500' : 'bg-yellow-500'
                  }`} />
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">{note.status}</span>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => setNoteToDelete(note.firebaseId!)}
                    className="p-1.5 hover:bg-red-100 text-red-500 rounded-lg transition-all"
                    title="Excluir"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Note Content */}
              <p className="text-slate-800 font-medium text-sm leading-relaxed mb-4 whitespace-pre-wrap min-h-[60px]">
                {note.content}
              </p>

              {/* Note Footer */}
              <div className="pt-3 border-t border-black/5 flex items-center justify-between">
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <CalendarIcon size={12} />
                    <span className="text-[10px] font-bold">{new Date(note.date).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">
                    Atendente: <span className="text-slate-600 font-bold">{note.atendente || note.userName}</span>
                  </div>
                </div>

                <div className="flex bg-white/40 p-1 rounded-xl gap-1">
                  <button 
                    onClick={() => handleUpdateStatus(note.firebaseId!, 'Pendente')}
                    className={`p-1 rounded-lg transition-all ${note.status === 'Pendente' ? 'bg-white shadow-sm text-yellow-600' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Marcar como Pendente"
                  >
                    <Clock size={16} />
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(note.firebaseId!, 'Em Andamento')}
                    className={`p-1 rounded-lg transition-all ${note.status === 'Em Andamento' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Marcar em Andamento"
                  >
                    <Activity size={16} />
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(note.firebaseId!, 'Concluído')}
                    className={`p-1 rounded-lg transition-all ${note.status === 'Concluído' ? 'bg-white shadow-sm text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Marcar como Concluído"
                  >
                    <CheckCircle2 size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}

        {filteredNotes.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400">
            <StickyNote size={48} className="mb-4 opacity-20" />
            <p className="font-medium">Nenhuma nota encontrada</p>
            <button 
              onClick={() => setIsAddingMode(true)}
              className="mt-4 text-indigo-600 font-bold hover:underline"
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
