import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchPurchaseRequests } from '../api/purchase-requests'
import { StatusBadge } from '../components/ui/StatusBadge'
import { Button } from '../components/ui/Button'
import { Pagination } from '../components/ui/Pagination'
import { useAuthStore } from '../store/auth-store'

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

export function PurchaseRequestsListPage() {
  const [page, setPage] = useState(1)
  const user = useAuthStore((state) => state.user)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['purchase-requests', page],
    queryFn: () => fetchPurchaseRequests({ page, pageSize: 20 }),
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-sans text-3xl font-bold text-accent italic">_Solicitações</h1>
        {user?.role === 'REQUESTER' && (
          <Link to="/purchase-requests/new">
            <Button>Nova solicitação</Button>
          </Link>
        )}
      </div>

      {isLoading && <p className="text-ink-muted">Carregando...</p>}
      {isError && <p className="text-accent-text">Não foi possível carregar as solicitações.</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-[6px] bg-surface-card shadow-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-grey1 text-xs font-semibold text-ink-muted uppercase">
                <tr>
                  <th className="px-4 py-3">Título</th>
                  <th className="px-4 py-3">Solicitante</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Criada em</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((pr) => (
                  <tr key={pr.id} className="border-t border-grey1 align-top hover:bg-surface-muted">
                    <td className="px-4 py-3">
                      <Link to={`/purchase-requests/${pr.id}`} className="font-semibold text-ink hover:text-accent">
                        {pr.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{pr.requester?.name ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={pr.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{dateFormatter.format(new Date(pr.createdAt))}</td>
                  </tr>
                ))}
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink-muted">
                      Nenhuma solicitação encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
