export type Situacao = 'Pendente' | 'Em Andamento' | 'Concluído' | 'Em Espera';
export type Prioridade = 'Alta' | 'Média' | 'Baixa';
export type UserRole = 'Admin' | 'Manager' | 'Worker';

export interface User {
  id: string;
  name: string;
  role: UserRole;
}

export interface Obra {
  id: number;
  firebaseId?: string;
  numeroRegistro: string;
  situacao: Situacao;
  prioridade: Prioridade;
  cliente: string;
  vendedor: string;
  local: string;
  dataChegadaPlacas: string;
  dataContrato: string;
  quantidadePlacas: number;
  valorMaoObra: number;
  valorReceber: number;
  dataObra: string;
  dataConclusao: string;
  equipe: string;
  inversor: string;
  formaPagamento: string;
  situacaoPagamento?: string;
  observacoes: string;
  createdBy?: string;
  createdAt?: any;
  txtFile?: {
    name: string;
    content: string;
  };
}

export interface Servico {
  id: number;
  firebaseId?: string;
  numeroRegistro: string;
  situacao: Situacao;
  prioridade: Prioridade;
  tipoAtendimento?: 'Técnico' | 'Administrativo';
  dataAtendimento: string;
  cliente: string;
  local: string;
  vendedor: string;
  equipeServico: string;
  equipes?: string[];
  servico: string;
  valor: number;
  equipeInstalou: string;
  dataServico: string;
  formaPagamento: string;
  situacaoPagamento?: string;
  observacao: string;
  createdBy?: string;
  createdAt?: any;
  txtFile?: {
    name: string;
    content: string;
  };
}

export interface Vendedor {
  id?: string;
  nome: string;
  ativo: boolean;
}

export interface Equipe {
  id?: string;
  nome: string;
  lider: string;
  ativo: boolean;
}

export interface Inversor {
  id?: string;
  modelo: string;
  marca: string;
  ativo: boolean;
}

export interface FormaPagamento {
  id?: string;
  nome: string;
  ativo: boolean;
}

export interface Filtros {
  situacao: string;
  prioridade: string;
  cliente: string;
  vendedor: string;
  equipe: string;
  formaPagamento?: string;
  tipoAtendimento?: string;
}

export interface TeamMember {
  id?: string;
  name: string;
}

export interface Schedule {
  id?: string;
  weekOffset: number;
  data: string; // JSON string
  updatedAt: any;
}

export interface Lembrete {
  id?: string;
  titulo: string;
  dataAlarme: string;
  descricao: string;
  importante: boolean;
  concluido: boolean;
  createdBy: string;
  createdAt: any;
  obraId?: string | number;
  tipo?: string;
}

export function getServicoTeams(s: Partial<Servico>): string[] {
  const result = new Set<string>();
  if (Array.isArray(s.equipes)) {
    s.equipes.forEach(eq => {
      const trimmed = String(eq || '').trim();
      if (trimmed) result.add(trimmed);
    });
  }
  if (s.equipeServico) {
    s.equipeServico.split(/[,;/]/).forEach(eq => {
      const trimmed = eq.trim();
      if (trimmed) result.add(trimmed);
    });
  }
  // Fallback to equipeInstalou only if no service team was designated
  if (result.size === 0 && s.equipeInstalou) {
    s.equipeInstalou.split(/[,;/]/).forEach(eq => {
      const trimmed = eq.trim();
      if (trimmed) result.add(trimmed);
    });
  }
  return Array.from(result);
}
