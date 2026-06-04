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
  AlertCircle
} from 'lucide-react';
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

  // --- Metrics Calculations ---
  
  // Obras calculations
  const totalObrasCount = obras.length;
  const obrasConcluidas = useMemo(() => obras.filter(o => o.situacao === 'Concluído'), [obras]);
  const obrasEmAndamento = useMemo(() => obras.filter(o => o.situacao === 'Em Andamento'), [obras]);
  const obrasPendentes = useMemo(() => obras.filter(o => o.situacao === 'Pendente'), [obras]);
  const obrasEmEspera = useMemo(() => obras.filter(o => o.situacao === 'Em Espera'), [obras]);

  const valorTotalObrasAberto = useMemo(() => 
    obras.filter(o => o.situacao !== 'Concluído').reduce((sum, o) => sum + (o.valorReceber || 0), 0)
  , [obras]);

  const valorTotalObrasConcluido = useMemo(() => 
    obrasConcluidas.reduce((sum, o) => sum + (o.valorReceber || 0), 0)
  , [obrasConcluidas]);

  const totalPlacasInstaladas = useMemo(() => 
    obras.reduce((sum, o) => sum + (Number(o.quantidadePlacas) || 0), 0)
  , [obras]);

  // Serviços calculations
  const totalServicosCount = servicos.length;
  const servicosConcluidos = useMemo(() => servicos.filter(s => s.situacao === 'Concluído'), [servicos]);
  const servicosEmAndamento = useMemo(() => servicos.filter(s => s.situacao === 'Em Andamento'), [servicos]);
  const servicosPendentes = useMemo(() => servicos.filter(s => s.situacao === 'Pendente'), [servicos]);
  const servicosEmEspera = useMemo(() => servicos.filter(s => s.situacao === 'Em Espera'), [servicos]);

  const valorTotalServicosAberto = useMemo(() => 
    servicos.filter(s => s.situacao !== 'Concluído').reduce((sum, s) => sum + (s.valor || 0), 0)
  , [servicos]);

  const valorTotalServicosConcluido = useMemo(() => 
    servicosConcluidos.reduce((sum, s) => sum + (s.valor || 0), 0)
  , [servicosConcluidos]);

  // Total finances
  const totalConsolidadoAberto = valorTotalObrasAberto + valorTotalServicosAberto;
  const totalConsolidadoConcluido = valorTotalObrasConcluido + valorTotalServicosConcluido;

  // --- Breakdown charts / lists ---

  // Vendedores rankings
  const rankingVendedores = useMemo(() => {
    const map: Record<string, { nome: string, count: number, valor: number }> = {};
    obras.forEach(o => {
      const vName = (o.vendedor || 'Não Definido').trim();
      if (!map[vName]) {
        map[vName] = { nome: vName, count: 0, valor: 0 };
      }
      map[vName].count += 1;
      map[vName].valor += (o.valorReceber || 0);
    });

    return Object.values(map).sort((a, b) => b.valor - a.valor);
  }, [obras]);

  // Equipes productivity
  const produtividadeEquipes = useMemo(() => {
    const map: Record<string, { nome: string, countObras: number, placas: number, valorObras: number }> = {};
    
    // Add known teams to ensure they appear
    equipes.forEach(eq => {
      map[eq.nome] = { nome: eq.nome, countObras: 0, placas: 0, valorObras: 0 };
    });

    obras.forEach(o => {
      const eqName = (o.equipe || 'Sem Equipe').trim();
      if (!map[eqName]) {
        map[eqName] = { nome: eqName, countObras: 0, placas: 0, valorObras: 0 };
      }
      map[eqName].countObras += 1;
      map[eqName].placas += (Number(o.quantidadePlacas) || 0);
      map[eqName].valorObras += (o.valorReceber || 0);
    });

    return Object.values(map).sort((a, b) => b.placas - a.placas);
  }, [obras, equipes]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header section with back button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
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
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <BarChart3 className="text-indigo-600" size={24} />
              Painel de Desempenho Cloud
            </h1>
            <p className="text-slate-500 text-xs mt-0.5">Visão consolidada, financeira e produtividade em tempo real.</p>
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
                <p className="text-slate-500 text-xs">Atendimentos e obras com status ativo nas duas carteiras.</p>
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
                  Total de Placas Instaladas
                </span>
                <div className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                  {totalPlacasInstaladas.toLocaleString('pt-BR')} 
                </div>
                <p className="text-slate-500 text-xs">Módulos fotovoltaicos agendados ou concluídos no sistema.</p>
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 font-bold px-2 py-0.5 rounded-full">
                  <Sparkles size={10} /> Alta eficiência cadastrada
                </span>
              </div>
            </div>

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
                <p className="text-xs text-slate-500">Divisão percentual de {totalObrasCount} obras cadastradas.</p>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { label: 'Concluído', count: obrasConcluidas.length, color: 'bg-emerald-500', text: 'text-emerald-750' },
                  { label: 'Em Andamento', count: obrasEmAndamento.length, color: 'bg-indigo-500', text: 'text-indigo-750' },
                  { label: 'Pendente', count: obrasPendentes.length, color: 'bg-amber-500', text: 'text-amber-750' },
                  { label: 'Em Espera', count: obrasEmEspera.length, color: 'bg-slate-400', text: 'text-slate-700' }
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
                <p className="text-xs text-slate-500">Visualização de {totalServicosCount} agendamentos de serviços.</p>
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
                Sucesso Operacional
              </span>
              <div className="text-3xl font-black text-slate-900">{obrasConcluidas.length}</div>
              <div className="text-xs text-slate-500 font-medium mt-1">Obras concluídas com entrega formal</div>
              <div className="text-[10px] font-mono text-slate-400 mt-2">
                Faturamento: R$ {valorTotalObrasConcluido.toLocaleString('pt-BR')}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full inline-block mb-3">
                Carteira de Ativo
              </span>
              <div className="text-3xl font-black text-slate-900">{obras.length - obrasConcluidas.length}</div>
              <div className="text-xs text-slate-500 font-medium mt-1">Obras ativas em pipeline</div>
              <div className="text-[10px] font-mono text-slate-400 mt-2">
                A Receber: R$ {valorTotalObrasAberto.toLocaleString('pt-BR')}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <span className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full inline-block mb-3">
                Potência Total Cadastrada
              </span>
              <div className="text-3xl font-black text-slate-900">
                {(totalPlacasInstaladas * 0.55).toFixed(1)} kWp
              </div>
              <div className="text-xs text-slate-500 font-medium mt-1">Potência estimada instalada (550Wp/Placa)</div>
              <div className="text-[10px] font-mono text-slate-400 mt-2">
                Módulos ativos totais: {totalPlacasInstaladas}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="font-bold text-slate-950 text-sm mb-4">Divisão de Obras por Nível de Prioridade</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { label: 'Alta', count: obras.filter(o => o.prioridade === 'Alta').length, color: 'bg-red-500', text: 'text-red-600' },
                { label: 'Média', count: obras.filter(o => o.prioridade === 'Média').length, color: 'bg-amber-500', text: 'text-amber-600' },
                { label: 'Baixa', count: obras.filter(o => o.prioridade === 'Baixa').length, color: 'bg-emerald-500', text: 'text-emerald-600' }
              ].map((item) => {
                const total = obras.length || 1;
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
              <span className="text-[10px] font-bold uppercase tracking-wider block text-slate-400">Total de Agendamentos</span>
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
            <h3 className="font-bold text-slate-950 text-sm mb-4">Serviços solicitados por categoria</h3>
            <p className="text-xs text-slate-500 mb-4">Estimativa das palavras-chave mais comuns na descrição dos serviços cadastrados.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { tag: 'Manutenção / Limpeza', regex: /limpeza|manutenc|sujeira/gi },
                { tag: 'Inversor', regex: /inversor|configurac/gi },
                { tag: 'Conexão Wi-Fi', regex: /wifi|wi-fi|confect|internet/gi },
                { tag: 'Assistência Técnica', regex: /asistenci|reclamac|reparo|consert/gi }
              ].map((cat) => {
                const count = servicos.filter(s => cat.regex.test(s.servico || '') || cat.regex.test(s.observacao || '')).length;
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
              Desempenho Comercial (Vendas de Obras)
            </h3>
            <p className="text-xs text-slate-500">Valor das obras comercializadas por vendedor.</p>
          </div>

          {rankingVendedores.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">Ainda não há dados comercializados para ranquear.</div>
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
                        <h4 className="font-bold text-slate-900 text-xs truncate">{v.nome}</h4>
                        <span className="text-[9px] text-slate-400 font-bold">{v.count} {v.count === 1 ? 'Obra' : 'Obras'} vendida(s)</span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                        <span>Participação comercial</span>
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
              Faturamento Operacional e Módulos por Equipe
            </h3>
            <p className="text-xs text-slate-500">Métricas de instalação estimadas por equipe com base nas obras cadastradas.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Top Equipes por Instalação (Placas)</h4>
              {produtividadeEquipes.length === 0 ? (
                <div className="text-xs text-slate-400 py-4">Nenhum dado cadastrado.</div>
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
                <div className="text-xs text-slate-400 py-4">Nenhum dado cadastrado.</div>
              ) : (
                <div className="space-y-3">
                  {produtividadeEquipes.slice().sort((a, b) => b.valorObras - a.valorObras).map((item, idx) => (
                    <div key={item.nome} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 bg-indigo-50 text-indigo-600 font-black text-[10px] rounded flex items-center justify-center">#{idx + 1}</span>
                        <span className="text-xs font-black text-slate-900">{item.nome}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-mono font-black text-slate-900 block">R$ {item.valorObras.toLocaleString('pt-BR')}</span>
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
