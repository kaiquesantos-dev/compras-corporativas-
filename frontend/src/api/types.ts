// Espelha os enums e formatos do backend (prisma/schema.prisma e os DTOs em
// src/**/dto/*.dto.ts). Mantido manualmente, já que os dois projetos vivem
// em repositórios/processos de build separados.

export type Role = 'REQUESTER' | 'BUYER' | 'APPROVER' | 'ADMIN'

export type PurchaseRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_QUOTATION'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'CANCELLED'

export interface AuthenticatedUser {
  id: number
  email: string
  role: Role
  // Delegação temporária de acesso ADMIN (ex: cobrir férias do admin) —
  // ver GET /auth/me, que revalida isso no banco a cada chamada.
  isAdminDelegate: boolean
}

export interface User {
  id: number
  name: string
  email: string
  role: Role
  departmentId: number | null
  createdAt: string
  // Delegação temporária de acesso ADMIN (ex: cobrir férias do admin) —
  // só faz sentido quando role === 'APPROVER'.
  isAdminDelegate: boolean
}

export interface Department {
  id: number
  name: string
}

export interface Supplier {
  id: number
  document: string
  legalName: string
  tradeName: string | null
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  isActive: boolean
}

export interface PurchaseItem {
  id: number
  description: string
  quantity: number
  unit: string
  // Prisma serializa campos Decimal como string no JSON (nunca number, para
  // não perder precisão) — converta com Number(...) só na hora de exibir.
  estimatedUnitPrice: string | null
}

export interface PurchaseRequest {
  id: number
  title: string
  justification: string
  status: PurchaseRequestStatus
  requesterId: number
  departmentId: number
  createdAt: string
  submittedAt: string | null
  decidedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  items: PurchaseItem[]
  requester?: { id: number; name: string; email: string }
  // Só presente na listagem (GET /purchase-requests) quando já existe uma
  // cotação vencedora selecionada — permite mostrar o valor financeiro
  // direto na lista/painel sem abrir o detalhe de cada solicitação.
  selectedQuote?: Quote | null
}

export interface PurchaseRequestStatusHistoryEntry {
  id: number
  fromStatus: PurchaseRequestStatus | null
  toStatus: PurchaseRequestStatus
  changedByUserId: number
  changedBy: { id: number; name: string }
  changedAt: string
  note: string | null
}

export interface Quote {
  id: number
  supplierId: number
  totalValue: string
  validUntil: string | null
  notes: string | null
  status: 'RECEIVED' | 'SELECTED' | 'DISCARDED'
  proposalFileName: string | null
  supplier?: Supplier
}

export interface Paginated<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

export interface PurchaseMetrics {
  // Só traz as chaves de status que realmente têm alguma solicitação —
  // nunca assuma que todo PurchaseRequestStatus está presente.
  countByStatus: Partial<Record<PurchaseRequestStatus, number>>
  totalApprovedValue: number
  averageApprovalTimeHours: number | null
  // Datas do período considerado; null quando não há limite naquela ponta
  // (ex: periodStart null + periodEnd definido = "até tal data", sem piso).
  periodStart: string | null
  periodEnd: string | null
}
