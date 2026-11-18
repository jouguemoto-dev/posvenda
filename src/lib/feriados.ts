/**
 * Sistema de Feriados Nacionais do Brasil, Feriados Estaduais de Pernambuco (PE)
 * e Feriados Municipais do Recife (PE).
 *
 * Regra do Sistema:
 * - Todos os feriados exibem alerta visual, mantendo permissão para agendar.
 * - Feriados estaduais (PE) e municipais (Recife) recebem prioridade de destaque visual.
 */

export type TipoFeriado = 'nacional' | 'estadual_pe' | 'municipal_recife' | 'ponto_facultativo';

export interface FeriadoInfo {
  data: string; // YYYY-MM-DD
  nome: string;
  tipo: TipoFeriado;
  tipoDescricao: string;
  bloqueiaAgendamento: boolean;
  prioridade: number; // 1: Recife, 2: Pernambuco, 3: Nacional
  badgeColor: string;
  badgeTextColor: string;
  borderColor: string;
  icone: string;
  descricao?: string;
}

/**
 * Calcula a data do Domingo de Páscoa para qualquer ano pelo algoritmo Meeus/Jones/Butcher
 */
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed month
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day, 12, 0, 0);
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(base: Date, days: number): Date {
  const res = new Date(base.getTime());
  res.setDate(res.getDate() + days);
  return res;
}

/**
 * Cache de feriados por ano para performance máxima
 */
const feriadosCache: Record<number, Record<string, FeriadoInfo>> = {};

/**
 * Retorna todos os feriados mapeados para o ano especificado
 */
export function getFeriadosDoAno(year: number): Record<string, FeriadoInfo> {
  if (feriadosCache[year]) {
    return feriadosCache[year];
  }

  const map: Record<string, FeriadoInfo> = {};

  const addFeriado = (item: FeriadoInfo) => {
    const existing = map[item.data];
    // Se já existe e o novo tem maior prioridade local (1: Recife, 2: PE), mas mantém o bloqueio se algum for nacional
    if (!existing) {
      map[item.data] = item;
    } else {
      const deveBloquear = existing.bloqueiaAgendamento || item.bloqueiaAgendamento;
      // Priorizar feriados municipais de Recife ou de PE no título e badge
      if (item.prioridade < existing.prioridade) {
        map[item.data] = {
          ...item,
          bloqueiaAgendamento: deveBloquear
        };
      } else {
        map[item.data].bloqueiaAgendamento = deveBloquear;
      }
    }
  };

  // ----------------------------------------------------
  // 1. FERIADOS NACIONAIS FIXOS DO BRASIL (Lei Federal)
  // ----------------------------------------------------
  // 01/01 - Confraternização Universal
  addFeriado({
    data: `${year}-01-01`,
    nome: 'Confraternização Universal (Ano Novo)',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '🇧🇷',
    descricao: 'Feriado nacional em todo o Brasil'
  });

  // 21/04 - Tiradentes
  addFeriado({
    data: `${year}-04-21`,
    nome: 'Tiradentes',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '🇧🇷',
    descricao: 'Inconfidência Mineira / Tiradentes'
  });

  // 01/05 - Dia Mundial do Trabalho
  addFeriado({
    data: `${year}-05-01`,
    nome: 'Dia Mundial do Trabalho',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '🇧🇷',
    descricao: 'Dia Internacional do Trabalhador'
  });

  // 07/09 - Independência do Brasil
  addFeriado({
    data: `${year}-09-07`,
    nome: 'Independência do Brasil',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '🇧🇷',
    descricao: 'Grito do Ipiranga / 7 de Setembro'
  });

  // 12/10 - Nossa Senhora Aparecida
  addFeriado({
    data: `${year}-10-12`,
    nome: 'Nossa Senhora Aparecida (Padroeira do Brasil)',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '🇧🇷',
    descricao: 'Padroeira do Brasil e Dia das Crianças'
  });

  // 02/11 - Finados
  addFeriado({
    data: `${year}-11-02`,
    nome: 'Dia de Finados',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '🇧🇷',
    descricao: 'Dia de Finados'
  });

  // 15/11 - Proclamação da República
  addFeriado({
    data: `${year}-11-15`,
    nome: 'Proclamação da República',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '🇧🇷',
    descricao: 'Proclamação da República do Brasil'
  });

  // 20/11 - Dia Nacional de Zumbi e da Consciência Negra (Lei nº 14.759/2023 - Feriado Nacional Oficial)
  addFeriado({
    data: `${year}-11-20`,
    nome: 'Dia Nacional de Zumbi e da Consciência Negra',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '🇧🇷',
    descricao: 'Feriado Nacional (Lei Federal 14.759/2023)'
  });

  // 25/12 - Natal
  addFeriado({
    data: `${year}-12-25`,
    nome: 'Natal',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '🇧🇷',
    descricao: 'Natal'
  });

  // ----------------------------------------------------
  // 2. FERIADOS NACIONAIS MÓVEIS (Baseados na Páscoa)
  // ----------------------------------------------------
  const easter = getEasterDate(year);

  // Carnaval (Segunda-feira -48d, Terça-feira -47d, Quarta de Cinzas -46d)
  const carnavalSeg = addDays(easter, -48);
  const carnavalTer = addDays(easter, -47);
  const quartaCinzas = addDays(easter, -46);

  addFeriado({
    data: formatDateKey(carnavalSeg),
    nome: 'Segunda-feira de Carnaval',
    tipo: 'ponto_facultativo',
    tipoDescricao: 'Carnaval (Feriado Tradicional PE/BR)',
    bloqueiaAgendamento: false,
    prioridade: 2,
    badgeColor: 'bg-purple-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-purple-400',
    icone: '🎭',
    descricao: 'Carnaval tradicional em Pernambuco e no Brasil'
  });

  addFeriado({
    data: formatDateKey(carnavalTer),
    nome: 'Terça-feira de Carnaval (Galo da Madrugada / Frevo)',
    tipo: 'estadual_pe',
    tipoDescricao: 'Feriado de Carnaval em Pernambuco',
    bloqueiaAgendamento: false, // Em Pernambuco e Recife o Carnaval é sagrado e bloqueia operações
    prioridade: 1,
    badgeColor: 'bg-purple-700',
    badgeTextColor: 'text-white',
    borderColor: 'border-purple-500',
    icone: '🎭',
    descricao: 'Carnaval de Pernambuco / Recife'
  });

  addFeriado({
    data: formatDateKey(quartaCinzas),
    nome: 'Quarta-feira de Cinzas',
    tipo: 'ponto_facultativo',
    tipoDescricao: 'Ponto Facultativo',
    bloqueiaAgendamento: false,
    prioridade: 2,
    badgeColor: 'bg-slate-700',
    badgeTextColor: 'text-white',
    borderColor: 'border-slate-500',
    icone: '🕊️',
    descricao: 'Quarta-feira de Cinzas'
  });

  // Sexta-feira Santa (Paixão de Cristo) - 2 dias antes da Páscoa (Feriado Nacional!)
  const sextaSanta = addDays(easter, -2);
  addFeriado({
    data: formatDateKey(sextaSanta),
    nome: 'Sexta-feira Santa (Paixão de Cristo)',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '✝️',
    descricao: 'Sexta-feira da Paixão'
  });

  // Domingo de Páscoa
  addFeriado({
    data: formatDateKey(easter),
    nome: 'Domingo de Páscoa',
    tipo: 'nacional',
    tipoDescricao: 'Feriado Religioso Nacional',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-red-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-red-500',
    icone: '🕊️',
    descricao: 'Páscoa'
  });

  // Corpus Christi - 60 dias após a Páscoa
  const corpusChristi = addDays(easter, 60);
  addFeriado({
    data: formatDateKey(corpusChristi),
    nome: 'Corpus Christi',
    tipo: 'ponto_facultativo',
    tipoDescricao: 'Feriado / Ponto Facultativo',
    bloqueiaAgendamento: false,
    prioridade: 3,
    badgeColor: 'bg-amber-600',
    badgeTextColor: 'text-white',
    borderColor: 'border-amber-500',
    icone: '⛪',
    descricao: 'Corpus Christi'
  });

  // ----------------------------------------------------
  // 3. FERIADOS ESTADUAIS DE PERNAMBUCO (PE)
  // ----------------------------------------------------
  // 06/03 - Revolução Pernambucana de 1817 / Data Magna de Pernambuco (Lei Estadual nº 16.059/2017)
  addFeriado({
    data: `${year}-03-06`,
    nome: 'Data Magna do Estado de Pernambuco',
    tipo: 'estadual_pe',
    tipoDescricao: 'Feriado Estadual (Pernambuco)',
    bloqueiaAgendamento: false, // Feriado oficial em todo o estado de PE
    prioridade: 2,
    badgeColor: 'bg-blue-700',
    badgeTextColor: 'text-white',
    borderColor: 'border-blue-500',
    icone: '🏛️',
    descricao: 'Revolução Pernambucana de 1817 - Lei Estadual nº 16.059/2017'
  });

  // 24/06 - São João (Feriado tradicional e de grande impacto em Pernambuco e Nordeste)
  addFeriado({
    data: `${year}-06-24`,
    nome: 'Dia de São João',
    tipo: 'estadual_pe',
    tipoDescricao: 'Feriado de São João (Pernambuco)',
    bloqueiaAgendamento: false,
    prioridade: 2,
    badgeColor: 'bg-emerald-700',
    badgeTextColor: 'text-white',
    borderColor: 'border-emerald-500',
    icone: '🌽',
    descricao: 'Feriado tradicional dos festejos juninos em Pernambuco'
  });

  // ----------------------------------------------------
  // 4. FERIADOS MUNICIPAIS DA CIDADE DO RECIFE (PE)
  // ----------------------------------------------------
  // 16/07 - Nossa Senhora do Carmo (Padroeira do Recife - Lei Municipal nº 9.777/1967)
  addFeriado({
    data: `${year}-07-16`,
    nome: 'Nossa Senhora do Carmo (Padroeira do Recife)',
    tipo: 'municipal_recife',
    tipoDescricao: 'Feriado Municipal de Recife',
    bloqueiaAgendamento: false,
    prioridade: 1,
    badgeColor: 'bg-amber-700',
    badgeTextColor: 'text-white',
    borderColor: 'border-amber-500',
    icone: '⛪',
    descricao: 'Padroeira da Cidade do Recife (Lei Municipal nº 9.777/1967)'
  });

  // 08/12 - Nossa Senhora da Conceição (Morro da Conceição / Recife - Lei Municipal nº 9.777/1967)
  addFeriado({
    data: `${year}-12-08`,
    nome: 'Nossa Senhora da Conceição (Morro da Conceição)',
    tipo: 'municipal_recife',
    tipoDescricao: 'Feriado Municipal de Recife',
    bloqueiaAgendamento: false,
    prioridade: 1,
    badgeColor: 'bg-blue-800',
    badgeTextColor: 'text-white',
    borderColor: 'border-blue-600',
    icone: '⛪',
    descricao: 'Festa do Morro da Conceição - Lei Municipal nº 9.777/1967'
  });

  feriadosCache[year] = map;
  return map;
}

/**
 * Consulta se uma determinada data (no formato YYYY-MM-DD ou Date) é feriado
 */
export function getFeriado(dateInput: string | Date | undefined | null): FeriadoInfo | null {
  if (!dateInput) return null;

  let dateStr = '';
  if (dateInput instanceof Date) {
    dateStr = formatDateKey(dateInput);
  } else if (typeof dateInput === 'string') {
    dateStr = dateInput.split('T')[0].trim();
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const year = parseInt(dateStr.substring(0, 4), 10);
  if (isNaN(year)) return null;

  const feriados = getFeriadosDoAno(year);
  return feriados[dateStr] || null;
}

/**
 * Verifica se a data é estritamente um feriado nacional do Brasil
 */
export function isFeriadoNacional(dateInput: string | Date | undefined | null): boolean {
  const f = getFeriado(dateInput);
  return !!f && f.tipo === 'nacional';
}

/**
 * Retorna se o agendamento deve ser bloqueado e a razão detalhada
 */
export function isDataBloqueadaParaAgendamento(dateInput: string | Date | undefined | null): {
  bloqueada: boolean;
  motivo?: string;
  feriado?: FeriadoInfo;
} {
  const f = getFeriado(dateInput);
  if (!f) return { bloqueada: false };

  const localInfo = f.tipo === 'municipal_recife'
    ? 'Feriado Municipal do Recife'
    : f.tipo === 'estadual_pe'
    ? 'Feriado Estadual de Pernambuco'
    : f.tipo === 'nacional'
    ? 'Feriado Nacional do Brasil'
    : 'Ponto Facultativo';

  return {
    bloqueada: false,
    motivo: `Alerta: ${f.nome} (${localInfo}) — Agendamento permitido.`,
    feriado: f
  };
}
