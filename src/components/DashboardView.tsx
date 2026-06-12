import React, { useMemo, useState } from 'react';
import { 
  Wallet, 
  CheckCircle2, 
  Activity, 
  TrendingUp, 
  Wrench, 
  BarChart3, 
  Users, 
  User,
  ArrowLeft,
  Calendar,
  Layers,
  Sparkles,
  ClipboardList,
  AlertCircle,
  Search,
  Filter,
  X,
  RefreshCw,
  ShoppingBag
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { Obra, Servico, Equipe, Vendedor } from '../types';

interface DashboardViewProps {
  obras: Obra[];
  servicos: Servico[];
  equipes: Equipe[];
  vendedores: Vendedor[];
  onBack?: () => void;
}

export default function DashboardView({ obras, servicos, equipes, vendedores, onBack }: DashboardViewProps) {
  const [selectedSubTab, setSelectedSubTab] = useState<'geral' | 'obras' | 'servicos' | 'vendedores' | 'equipes'>('geral');

  // --- Filter states ---
  const [filterVendedor, setFilterVendedor] = useState<string>('');
  const [filterEquipe, setFilterEquipe] = useState<string>('');
  const [filterPrioridade, setFilterPrioridade] = useState<string>('');
  const [filterFormaPagamento, setFilterFormaPagamento] = useState<string>('');
  const [filterDateStart, setFilterDateStart] = useState<string>('');
  const [filterDateEnd, setFilterDateEnd] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Pre-calculated ranges for convenience
  const dateRanges = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    
    // Este Mês
    const firstDayMonth = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDayMonth = `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`;
    
    // Este Ano
    const firstDayYear = `${y}-01-01`;
    const lastDayYear = `${y}-12-31`;
    
    // Últimos 30 dias
    const past30 = new Date();
    past30.setDate(now.getDate() - 30);
    const formatDate = (d: Date) => {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    return {
      esteMes: { start: firstDayMonth, end: lastDayMonth },
      esteAno: { start: firstDayYear, end: lastDayYear },
      ultimos30: { start: formatDate(past30), end: formatDate(now) }
    };
  }, []);

  // Quick helper ranges
  const applyRange = (type: 'mes' | 'ano' | '30dias' | 'limpar') => {
    if (type === 'mes') {
      setFilterDateStart(dateRanges.esteMes.start);
      setFilterDateEnd(dateRanges.esteMes.end);
    } else if (type === 'ano') {
      setFilterDateStart(dateRanges.esteAno.start);
      setFilterDateEnd(dateRanges.esteAno.end);
    } else if (type === '30dias') {
      setFilterDateStart(dateRanges.ultimos30.start);
      setFilterDateEnd(dateRanges.ultimos30.end);
    } else {
      setFilterDateStart('');
      setFilterDateEnd('');
    }
  };

  const clearAllFilters = () => {
    setFilterVendedor('');
    setFilterEquipe('');
    setFilterPrioridade('');
    setFilterFormaPagamento('');
    setFilterDateStart('');
    setFilterDateEnd('');
    setFilterSearch('');
  };

  const hasActiveFilters = useMemo(() => {
    return !!(filterVendedor || filterEquipe || filterFormaPagamento || filterPrioridade || filterDateStart || filterDateEnd || filterSearch);
  }, [filterVendedor, filterEquipe, filterFormaPagamento, filterPrioridade, filterDateStart, filterDateEnd, filterSearch]);

  // Extract unique sellers & teams present in either data (supplementing registered lists)
  const uniqueSellersFromData = useMemo(() => {
    const list = new Set<string>();
    obras.forEach(o => { if (o.vendedor) list.add(o.vendedor.trim()); });
    servicos.forEach(s => { if (s.vendedor) list.add(s.vendedor.trim()); });
    vendedores.forEach(v => { if (v.nome) list.add(v.nome.trim()); });
    return Array.from(list).sort();
  }, [obras, servicos, vendedores]);

  const uniqueEquipesFromData = useMemo(() => {
    const list = new Set<string>();
    obras.forEach(o => { if (o.equipe) list.add(o.equipe.trim()); });
    servicos.forEach(s => { if (s.equipeServico) list.add(s.equipeServico.trim()); });
    equipes.forEach(eq => { if (eq.nome) list.add(eq.nome.trim()); });
    return Array.from(list).sort();
  }, [obras, servicos, equipes]);

  const uniqueFormasPagamentoFromData = useMemo(() => {
    const list = new Set<string>();
    obras.forEach(o => { if (o.formaPagamento) list.add(o.formaPagamento.trim()); });
    servicos.forEach(s => { if (s.formaPagamento) list.add(s.formaPagamento.trim()); });
    return Array.from(list).sort();
  }, [obras, servicos]);

  // --- Filtering Execution ---

  const filteredObras = useMemo(() => {
    return obras.filter(o => {
      // 1. Vendedor
      if (filterVendedor && o.vendedor !== filterVendedor) return false;
      // 2. Equipe
      if (filterEquipe && o.equipe !== filterEquipe) return false;
      // 3. Prioridade
      if (filterPrioridade && o.prioridade !== filterPrioridade) return false;
      // 3.5. Forma de Pagamento
      if (filterFormaPagamento && o.formaPagamento !== filterFormaPagamento) return false;
      // 4. Date range
      if (filterDateStart) {
        const d = o.dataObra || o.dataConclusao;
        if (!d || d < filterDateStart) return false;
      }
      if (filterDateEnd) {
        const d = o.dataObra || o.dataConclusao;
        if (!d || d > filterDateEnd) return false;
      }
      // 5. Search text (by cliente, local, numeroRegistro, inversor)
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const inCliente = o.cliente?.toLowerCase().includes(q);
        const inLocal = o.local?.toLowerCase().includes(q);
        const inNum = o.numeroRegistro?.toLowerCase().includes(q);
        const inInv = o.inversor?.toLowerCase().includes(q);
        if (!inCliente && !inLocal && !inNum && !inInv) return false;
      }
      return true;
    });
  }, [obras, filterVendedor, filterEquipe, filterPrioridade, filterFormaPagamento, filterDateStart, filterDateEnd, filterSearch]);

  const filteredServicos = useMemo(() => {
    return servicos.filter(s => {
      // 1. Vendedor
      if (filterVendedor && s.vendedor !== filterVendedor) return false;
      // 2. Equipe
      if (filterEquipe && s.equipeServico !== filterEquipe) return false;
      // 3. Prioridade
      if (filterPrioridade && s.prioridade !== filterPrioridade) return false;
      // 3.5. Forma de Pagamento
      if (filterFormaPagamento && s.formaPagamento !== filterFormaPagamento) return false;
      // 4. Date range
      if (filterDateStart) {
        const d = s.dataServico || s.dataAtendimento;
        if (!d || d < filterDateStart) return false;
      }
      if (filterDateEnd) {
        const d = s.dataServico || s.dataAtendimento;
        if (!d || d > filterDateEnd) return false;
      }
      // 5. Search text (by cliente, local, numeroRegistro, servico)
      if (filterSearch) {
        const q = filterSearch.toLowerCase();
        const inCliente = s.cliente?.toLowerCase().includes(q);
        const inLocal = s.local?.toLowerCase().includes(q);
        const inNum = s.numeroRegistro?.toLowerCase().includes(q);
        const inServ = s.servico?.toLowerCase().includes(q);
        if (!inCliente && !inLocal && !inNum && !inServ) return false;
      }
      return true;
    });
  }, [servicos, filterVendedor, filterEquipe, filterPrioridade, filterFormaPagamento, filterDateStart, filterDateEnd, filterSearch]);

  // --- Metrics Calculations (Based on Filtered Sets) ---
  
  // Obras filtered collections
  const totalObrasCount = filteredObras.length;
  const obrasConcluidas = useMemo(() => filteredObras.filter(o => o.situacao === 'Concluído'), [filteredObras]);
  const obrasEmAndamento = useMemo(() => filteredObras.filter(o => o.situacao === 'Em Andamento'), [filteredObras]);
  const obrasPendentes = useMemo(() => filteredObras.filter(o => o.situacao === 'Pendente'), [filteredObras]);
  const obrasEmEspera = useMemo(() => filteredObras.filter(o => o.situacao === 'Em Espera'), [filteredObras]);

  const valorTotalObrasAberto = useMemo(() => 
    filteredObras.filter(o => o.situacao !== 'Concluído').reduce((sum, o) => sum + (o.valorReceber || 0), 0)
  , [filteredObras]);

  const valorTotalObrasConcluido = useMemo(() => 
    obrasConcluidas.reduce((sum, o) => sum + (o.valorReceber || 0), 0)
  , [obrasConcluidas]);

  const totalPlacasInstaladas = useMemo(() => 
    filteredObras.reduce((sum, o) => sum + (Number(o.quantidadePlacas) || 0), 0)
  , [filteredObras]);

  // Serviços filtered collections
  const totalServicosCount = filteredServicos.length;
  const servicosConcluidos = useMemo(() => filteredServicos.filter(s => s.situacao === 'Concluído'), [filteredServicos]);
  const servicosEmAndamento = useMemo(() => filteredServicos.filter(s => s.situacao === 'Em Andamento'), [filteredServicos]);
  const servicosPendentes = useMemo(() => filteredServicos.filter(s => s.situacao === 'Pendente'), [filteredServicos]);
  const servicosEmEspera = useMemo(() => filteredServicos.filter(s => s.situacao === 'Em Espera'), [filteredServicos]);

  const valorTotalServicosAberto = useMemo(() => 
    filteredServicos.filter(s => s.situacao !== 'Concluído').reduce((sum, s) => sum + (s.valor || 0), 0)
  , [filteredServicos]);

  const valorTotalServicosConcluido = useMemo(() => 
    servicosConcluidos.reduce((sum, s) => sum + (s.valor || 0), 0)
  , [servicosConcluidos]);

  // Total finances
  const totalConsolidadoAberto = valorTotalObrasAberto + valorTotalServicosAberto;
  const totalConsolidadoConcluido = valorTotalObrasConcluido + valorTotalServicosConcluido;

  // --- Breakdown charts / lists ---

  // Vendedores rankings based on filtered Obras
  const rankingVendedores = useMemo(() => {
    const map: Record<string, { nome: string, count: number, valor: number }> = {};
    filteredObras.forEach(o => {
      const vName = (o.vendedor || 'Não Definido').trim();
      if (!map[vName]) {
        map[vName] = { nome: vName, count: 0, valor: 0 };
      }
      map[vName].count += 1;
      map[vName].valor += (o.valorReceber || 0);
    });

    return Object.values(map).sort((a, b) => b.valor - a.valor);
  }, [filteredObras]);

  // Equipes productivity based on filtered Obras
  const produtividadeEquipes = useMemo(() => {
    const map: Record<string, { nome: string, countObras: number, placas: number, valorObras: number }> = {};
    
    // Initialize standard/active teams to ensure structural alignment in visual grids
    uniqueEquipesFromData.forEach(eqName => {
      map[eqName] = { nome: eqName, countObras: 0, placas: 0, valorObras: 0 };
    });

    filteredObras.forEach(o => {
      const eqName = (o.equipe || 'Sem Equipe').trim();
      if (!map[eqName]) {
        map[eqName] = { nome: eqName, countObras: 0, placas: 0, valorObras: 0 };
      }
      map[eqName].countObras += 1;
      map[eqName].placas += (Number(o.quantidadePlacas) || 0);
      map[eqName].valorObras += (o.valorReceber || 0);
    });

    return Object.values(map).sort((a, b) => b.placas - a.placas);
  }, [filteredObras, uniqueEquipesFromData]);

  // --- Faturamento Concluído por Mês para Gráfico (Fluxo de Caixa) ---
  const faturamentoMensalConcluido = useMemo(() => {
    const map: Record<string, { label: string, sortKey: string, total: number, count: number }> = {};
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    obrasConcluidas.forEach(o => {
      const dStr = (o.dataConclusao || o.dataObra || '').trim();
      if (!dStr) return;

      let year = '';
      let monthNum = '';

      if (dStr.includes('-')) {
        const parts = dStr.split('-');
        if (parts[0].length === 4) {
          year = parts[0];
          monthNum = parts[1];
        } else if (parts[2]?.length === 4) {
          year = parts[2];
          monthNum = parts[1];
        }
      } else if (dStr.includes('/')) {
        const parts = dStr.split('/');
        if (parts[2]?.length === 4) {
          year = parts[2];
          monthNum = parts[1];
        } else if (parts[0].length === 4) {
          year = parts[0];
          monthNum = parts[1];
        }
      }

      if (!year || !monthNum) return;

      const monthIdx = parseInt(monthNum, 10) - 1;
      if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return;

      const label = `${monthNames[monthIdx]}/${year.substring(2)}`;
      const sortKey = `${year}-${monthNum.padStart(2, '0')}`;

      if (!map[sortKey]) {
        map[sortKey] = { label, sortKey, total: 0, count: 0 };
      }

      map[sortKey].total += (o.valorReceber || 0);
      map[sortKey].count += 1;
    });

    return Object.values(map).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [obrasConcluidas]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header section with back button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm animate-fade-in">
        <div className="flex items-center gap-3">
          {onBack && (
            <button 
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-xl transition-all border border-slate-200"
              title="Voltar"
            >
              <ArrowLeft size={18} className="text-slate-600" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 px-2.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 tracking-wider uppercase">
                Métricas E Indicadores
              </span>
              {hasActiveFilters && (
                <span className="p-1 px-2.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 tracking-wider uppercase inline-flex items-center gap-1 animate-pulse">
                  <Filter size={10} /> Filtros Ativos
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="text-indigo-600" size={24} />
              Painel de Desempenho Cloud
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">Visão consolidada, financeira e produtividade em tempo real com filtros avançados.</p>
          </div>
        </div>

        {/* Local Tab Selector */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 flex-wrap gap-1">
          {[
            { id: 'geral', label: 'Geral Consolidado' },
            { id: 'obras', label: 'Obras' },
            { id: 'servicos', label: 'Serviços' },
            { id: 'vendedores', label: 'Vendedores' },
            { id: 'equipes', label: 'Equipes' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedSubTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedSubTab === tab.id 
                  ? 'bg-white text-indigo-700 shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* FILTER CONTROL CARD */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs sm:space-y-4 space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-xs font-bold uppercase text-slate-500 tracking-widest flex items-center gap-1.5">
            <Filter size={14} className="text-slate-400" />
            Filtros do Dashboard
          </h2>
          {hasActiveFilters && (
            <button 
              onClick={clearAllFilters}
              className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
            >
              <X size={12} />
              Limpar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          {/* Group 1: Search text */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400 block">Busca Textual</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 text-slate-400" size={14} />
              <input 
                type="text"
                placeholder="Cliente, cidade, registro..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>

          {/* Group 2: Vendedor */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400 block">Vendedor</label>
            <select
              value={filterVendedor}
              onChange={(e) => setFilterVendedor(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-800"
            >
              <option value="">-- Todos Vendedores --</option>
              {uniqueSellersFromData.map((seller) => (
                <option key={seller} value={seller}>{seller}</option>
              ))}
            </select>
          </div>

          {/* Group 3: Equipe */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400 block">Equipe</label>
            <select
              value={filterEquipe}
              onChange={(e) => setFilterEquipe(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-800"
            >
              <option value="">-- Todas Equipes --</option>
              {uniqueEquipesFromData.map((eq) => (
                <option key={eq} value={eq}>{eq}</option>
              ))}
            </select>
          </div>

          {/* Group 4: Prioridade */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400 block">Prioridade</label>
            <select
              value={filterPrioridade}
              onChange={(e) => setFilterPrioridade(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-800"
            >
              <option value="">-- Todas Prioridades --</option>
              <option value="Alta">Alta</option>
              <option value="Média">Média</option>
              <option value="Baixa">Baixa</option>
            </select>
          </div>

          {/* Group 4.5: Forma de Pagamento */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400 block">Tipo de Pagamento</label>
            <select
              value={filterFormaPagamento}
              onChange={(e) => setFilterFormaPagamento(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-800"
            >
              <option value="">-- Todos Tipos --</option>
              {uniqueFormasPagamentoFromData.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Group 5: Data Inicial */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400 block">Data Inicial</label>
            <input 
              type="date"
              value={filterDateStart}
              onChange={(e) => setFilterDateStart(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-800"
            />
          </div>

          {/* Group 6: Data Final */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-slate-400 block">Data Final</label>
            <input 
              type="date"
              value={filterDateEnd}
              onChange={(e) => setFilterDateEnd(e.target.value)}
              className="w-full py-1.5 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all font-medium text-slate-800"
            />
          </div>
        </div>

        {/* Quick range selector indicators */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Períodos Rápidos:</span>
            <button 
              onClick={() => applyRange('mes')}
              className="px-2.5 py-1 text-[10px] bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 rounded-lg font-bold transition-all border border-indigo-100/50 shadow-2xs"
            >
              Este Mês
            </button>
            <button 
              onClick={() => applyRange('30dias')}
              className="px-2.5 py-1 text-[10px] bg-sky-50 hover:bg-sky-100/80 text-sky-700 rounded-lg font-bold transition-all border border-sky-100/50 shadow-2xs"
            >
              Últimos 30 dias
            </button>
            <button 
              onClick={() => applyRange('ano')}
              className="px-2.5 py-1 text-[10px] bg-amber-50 hover:bg-amber-100/80 text-amber-700 rounded-lg font-bold transition-all border border-amber-100/50 shadow-2xs"
            >
              Este Ano (Jan-Dez)
            </button>
            <button 
              onClick={() => applyRange('limpar')}
              className="px-2.5 py-1 text-[10px] bg-slate-50 hover:bg-slate-100/80 text-slate-600 rounded-lg font-bold transition-all border border-slate-200/50 shadow-2xs"
            >
              Limpar Datas
            </button>
          </div>

          <div className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2.5 py-1 rounded-lg">
            Retorno: <span className="text-slate-700 font-black">{totalObrasCount}</span> Obras e <span className="text-slate-700 font-black">{totalServicosCount}</span> Serviços filtrados
          </div>
        </div>
      </div>

      {/* SUBTAB CONTENT: GERAL / CONSOLIDADO */}
      {selectedSubTab === 'geral' && (
        <div className="space-y-6">
          {/* Card stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 text-indigo-50 translate-x-3 translate-y-3 group-hover:scale-105 transition-transform duration-300">
                <Wallet size={96} strokeWidth={1} />
              </div>
              <div className="relative z-10 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Consolidado em Aberto
                </span>
                <div id="finance-consolidado-aberto" className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                  R$ {totalConsolidadoAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  Obras: R$ {valorTotalObrasAberto.toLocaleString('pt-BR')}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Serviços: R$ {valorTotalServicosAberto.toLocaleString('pt-BR')}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 text-emerald-50 translate-x-3 translate-y-3 group-hover:scale-105 transition-transform duration-300">
                <CheckCircle2 size={96} strokeWidth={1} />
              </div>
              <div className="relative z-10 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Consolidado Concluído
                </span>
                <div id="finance-consolidado-concluido" className="text-2xl font-black text-slate-900 tracking-tight font-mono">
                  R$ {totalConsolidadoConcluido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Obras: R$ {valorTotalObrasConcluido.toLocaleString('pt-BR')}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Serviços: R$ {valorTotalServicosConcluido.toLocaleString('pt-BR')}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 text-sky-50 translate-x-3 translate-y-3 group-hover:scale-105 transition-transform duration-300">
                <Activity size={96} strokeWidth={1} />
              </div>
              <div className="relative z-10 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Em Execução Agora
                </span>
                <div className="text-3xl font-black text-slate-900 tracking-tight">
                  {obrasEmAndamento.length + servicosEmAndamento.length}
                </div>
                <p className="text-slate-500 text-xs">Atendimentos para os registros com status ativo na carteira filtrada.</p>
                <div className="flex gap-2 pt-1">
                  <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                    {obrasEmAndamento.length} Obras
                  </span>
                  <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    {servicosEmAndamento.length} Serviços
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs relative overflow-hidden group">
              <div className="absolute right-0 bottom-0 text-amber-50 translate-x-3 translate-y-3 group-hover:scale-105 transition-transform duration-300">
                <Layers size={96} strokeWidth={1} />
              </div>
              <div className="relative z-10 space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                  Placas Instaladas (Filtro)
                </span>
                <div className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {totalPlacasInstaladas.toLocaleString('pt-BR')} 
                </div>
                <p className="text-slate-500 text-xs">Módulos fotovoltaicos agendados ou concluídos no escopo filtrado.</p>
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 font-bold px-2 py-0.5 rounded-full">
                  <Sparkles size={10} /> Alta eficiência cadastrada
                </span>
              </div>
            </div>

          </div>

          {/* Gráfico de Fluxo de Caixa Mensal */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-950 flex items-center gap-1.5 text-sm">
                  <TrendingUp size={16} className="text-emerald-600" />
                  Fluxo de Caixa: Faturamento Mensal de Obras Concluidas
                </h3>
                <p className="text-xs text-slate-500">
                  Comparativo de receita acumulada por mês para todas as obras entregues (com base no filtro ativo).
                </p>
              </div>
              <div className="text-[10px] bg-slate-100 hover:bg-slate-200/60 font-bold px-2.5 py-1 rounded-lg text-slate-600 font-mono transition-all">
                Faturamento Total Filtrado: R$ {valorTotalObrasConcluido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            {faturamentoMensalConcluido.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                <BarChart3 className="text-slate-300 mb-2" size={32} />
                Nenhuma obra concluída com data registrada no período selecionado.
              </div>
            ) : (
              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={faturamentoMensalConcluido}
                    margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="label" 
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }}
                    />
                    <YAxis 
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }}
                      tickFormatter={(value) => `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`}
                    />
                    <Tooltip 
                      formatter={(value: any) => [
                        `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
                        'Faturamento Concluído'
                      ]}
                      labelFormatter={(label) => `Período: ${label}`}
                      contentStyle={{ 
                        backgroundColor: '#FFFFFF', 
                        border: '1px solid #E2E8F0', 
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        fontSize: '12px'
                      }}
                    />
                    <Bar 
                      dataKey="total" 
                      fill="#10B981" 
                      radius={[6, 6, 0, 0]} 
                      maxBarSize={50} 
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Quick analysis lists - Bento style */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Obras distribution visual progress */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div>
                <h3 className="font-bold text-slate-950 flex items-center gap-1.5 text-sm">
                  <ClipboardList size={16} className="text-indigo-600" />
                  Divisão de Status das Obras
                </h3>
                <p className="text-xs text-slate-500">Divisão percentual de {totalObrasCount} obras cadastradas (filtrado).</p>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { label: 'Concluído', count: obrasConcluidas.length, color: 'bg-emerald-500' },
                  { label: 'Em Andamento', count: obrasEmAndamento.length, color: 'bg-indigo-500' },
                  { label: 'Pendente', count: obrasPendentes.length, color: 'bg-amber-500' },
                  { label: 'Em Espera', count: obrasEmEspera.length, color: 'bg-slate-400' }
                ].map((item) => {
                  const pct = totalObrasCount > 0 ? (item.count / totalObrasCount) * 100 : 0;
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between items-center text-xs font-semibold">
                        <span className="text-slate-700">{item.label}</span>
                        <span className="text-slate-500 font-mono">
                          {item.count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`${item.color} h-full rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Serviços distribution visual progress */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div>
                <h3 className="font-bold text-slate-950 flex items-center gap-1.5 text-sm">
                  <Wrench size={16} className="text-blue-600" />
                  Divisão de Status de Serviços
                </h3>
                <p className="text-xs text-slate-500">Visualização de {totalServicosCount} agendamentos de serviços (filtrado).</p>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { label: 'Concluído', count: servicosConcluidos.length, color: 'bg-emerald-500' },
                  { label: 'Em Andamento', count: servicosEmAndamento.length, color: 'bg-blue-500' },
                  { label: 'Pendente', count: servicosPendentes.length, color: 'bg-orange-500' },
                  { label: 'Em Espera', count: servicosEmEspera.length, color: 'bg-slate-400' }
                ].map((item) => {
                  const pct = totalServicosCount > 0 ? (item.count / totalServicosCount) * 100 : 0;
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex justify-between items-center text-xs font-semibold">
                        <span className="text-slate-700">{item.label}</span>
                        <span className="text-slate-500 font-mono">
                          {item.count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`${item.color} h-full rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB CONTENT: OBRAS */}
      {selectedSubTab === 'obras' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full inline-block mb-3">
                Sucesso Operacional (Filtrado)
              </span>
              <div className="text-3xl font-black text-slate-900">{obrasConcluidas.length}</div>
              <div className="text-xs text-slate-500 font-medium mt-1">Obras concluídas com entrega formal</div>
              <div className="text-[10px] font-mono text-slate-400 mt-2">
                Faturamento: R$ {valorTotalObrasConcluido.toLocaleString('pt-BR')}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full inline-block mb-3">
                Carteira de Ativo (Filtrado)
              </span>
              <div className="text-3xl font-black text-slate-900">{totalObrasCount - obrasConcluidas.length}</div>
              <div className="text-xs text-slate-500 font-medium mt-1">Obras ativas em pipeline</div>
              <div className="text-[10px] font-mono text-slate-400 mt-2">
                A Receber: R$ {valorTotalObrasAberto.toLocaleString('pt-BR')}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full inline-block mb-3">
                Potência Filtro Atual
              </span>
              <div className="text-3xl font-black text-slate-900">
                {(totalPlacasInstaladas * 0.55).toFixed(1)} kWp
              </div>
              <div className="text-xs text-slate-500 font-medium mt-1">Estimativa correspondente ao grupo atual</div>
              <div className="text-[10px] font-mono text-slate-400 mt-2">
                Módulos ativos totais: {totalPlacasInstaladas}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="font-bold text-slate-950 text-sm mb-4">Divisão de Obras por Nível de Prioridade (Filtrado)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { label: 'Alta', count: filteredObras.filter(o => o.prioridade === 'Alta').length, color: 'bg-red-500', text: 'text-red-600' },
                { label: 'Média', count: filteredObras.filter(o => o.prioridade === 'Média').length, color: 'bg-amber-500', text: 'text-amber-600' },
                { label: 'Baixa', count: filteredObras.filter(o => o.prioridade === 'Baixa').length, color: 'bg-emerald-500', text: 'text-emerald-600' }
              ].map((item) => {
                const total = totalObrasCount || 1;
                const pct = (item.count / total) * 100;
                return (
                  <div key={item.label} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-between space-y-3">
                    <div className="flex justify-between items-center">
                      <span className={`text-xs font-black uppercase ${item.text}`}>{item.label}</span>
                      <span className="text-xs font-mono font-bold text-slate-600">{item.count}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 text-right">{pct.toFixed(0)}% das Obras</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB CONTENT: SERVICOS */}
      {selectedSubTab === 'servicos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider block text-slate-400">Total de Agendamentos (Filtrado)</span>
              <div className="text-3xl font-black text-slate-950 mt-1">{totalServicosCount}</div>
              <div className="text-[10px] text-slate-500 font-bold mt-2">Visitas, assistências técnicas e retoques de serviços</div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider block text-slate-400">Faturamento Realizado</span>
              <div className="text-3xl font-black text-slate-950 mt-1">R$ {valorTotalServicosConcluido.toLocaleString('pt-BR')}</div>
              <div className="text-[10px] text-emerald-600 font-bold mt-2 flex items-center gap-1">
                <CheckCircle2 size={12} /> {servicosConcluidos.length} atendimentos concluídos
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider block text-slate-400">Em Aberto / Agendamentos Activos</span>
              <div className="text-3xl font-black text-slate-950 mt-1">R$ {valorTotalServicosAberto.toLocaleString('pt-BR')}</div>
              <div className="text-[10px] text-indigo-600 font-bold mt-2">
                Pendente ou em andamento
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="font-bold text-slate-950 text-sm mb-4">Serviços por categoria (Filtrado)</h3>
            <p className="text-xs text-slate-500 mb-4">Estimativa das palavras-chave mais comuns na descrição dos serviços cadastrados.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { tag: 'Manutenção / Limpeza', regex: /limpeza|manutenc|sujeira/gi },
                { tag: 'Inversor', regex: /inversor|configurac/gi },
                { tag: 'Conexão Wi-Fi', regex: /wifi|wi-fi|confect|internet/gi },
                { tag: 'Assistência Técnica', regex: /asistenci|reclamac|reparo|consert/gi }
              ].map((cat) => {
                const count = filteredServicos.filter(s => cat.regex.test(s.servico || '') || cat.regex.test(s.observacao || '')).length;
                return (
                  <div key={cat.tag} className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center">
                    <span className="text-[10px] font-bold text-slate-500 block truncate">{cat.tag}</span>
                    <span className="text-2xl font-black text-indigo-700 block mt-2">{count}</span>
                    <span className="text-[9px] text-slate-400 block font-medium">atendimentos</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB CONTENT: VENDEDORES */}
      {selectedSubTab === 'vendedores' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-950 flex items-center gap-1.5 text-sm">
              <User size={16} className="text-indigo-600" />
              Desempenho Comercial (Vendas de Obras - Filtrado)
            </h3>
            <p className="text-xs text-slate-500">Valor das obras comercializadas por vendedor no escopo de filtros atual.</p>
          </div>

          {rankingVendedores.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs text-medium">Sem vendas de obras correspondentes aos filtros aplicados.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rankingVendedores.map((v, idx) => {
                const totalSales = rankingVendedores.reduce((sum, curr) => sum + curr.valor, 0) || 1;
                const ratio = (v.valor / totalSales) * 100;
                return (
                  <div key={v.nome} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <div className="h-8 w-8 text-xs font-black bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                        #{idx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-00 text-xs truncate">{v.nome}</h4>
                        <span className="text-[9px] text-slate-400 font-bold">{v.count} {v.count === 1 ? 'Obra' : 'Obras'} vendida(s)</span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                        <span>Participação comercial grupo</span>
                        <span>{ratio.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    </div>

                    <div className="md:text-right shrink-0">
                      <div className="text-xs font-black text-slate-900 font-mono">
                        R$ {v.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB CONTENT: EQUIPES */}
      {selectedSubTab === 'equipes' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-950 flex items-center gap-1.5 text-sm">
              <Users size={16} className="text-emerald-600" />
              Faturamento Operacional e Módulos por Equipe (Filtrado)
            </h3>
            <p className="text-xs text-slate-500">Métricas de instalação correspondentes aos filtros atuais.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Instalação por Equipe (Placas)</h4>
              {produtividadeEquipes.length === 0 ? (
                <div className="text-xs text-slate-400 py-4">Sem dados correspondentes aos filtros aplicados.</div>
              ) : (
                <div className="space-y-3">
                  {produtividadeEquipes.map((item, idx) => (
                    <div key={item.nome} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 bg-emerald-50 text-emerald-600 font-black text-[10px] rounded flex items-center justify-center">#{idx + 1}</span>
                        <div>
                          <span className="text-xs font-black text-slate-900 block leading-tight">{item.nome}</span>
                          <span className="text-[10px] text-slate-500 font-medium">{item.countObras} {item.countObras === 1 ? 'Obra' : 'Obras'} instalada(s)</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-black text-emerald-600 block">{item.placas}</span>
                        <span className="text-[9px] text-slate-450 uppercase font-black tracking-widest block">painéis</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Faturamento Operacional por Equipe</h4>
              {produtividadeEquipes.length === 0 ? (
                <div className="text-xs text-slate-400 py-4">Sem dados correspondentes aos filtros aplicados.</div>
              ) : (
                <div className="space-y-3">
                  {produtividadeEquipes.slice().sort((a, b) => b.valorObras - a.valorObras).map((item, idx) => (
                    <div key={item.nome} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 font-black text-[10px] rounded flex items-center justify-center">#{idx + 1}</span>
                        <span className="text-xs font-black text-slate-900">{item.nome}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-black text-slate-900 block font-mono">R$ {item.valorObras.toLocaleString('pt-BR')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
