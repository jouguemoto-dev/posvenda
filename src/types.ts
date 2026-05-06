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
  observacoes: string;
  createdBy?: string;
  createdAt?: any;
}

export interface Servico {
  id: number;
  firebaseId?: string;
  numeroRegistro: string;
  situacao: Situacao;
  prioridade: Prioridade;
  dataAtendimento: string;
  cliente: string;
  local: string;
  vendedor: string;
  equipeServico: string;
  servico: string;
  valor: number;
  equipeInstalou: string;
  dataServico: string;
  formaPagamento: string;
  observacao: string;
  createdBy?: string;
  createdAt?: any;
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
