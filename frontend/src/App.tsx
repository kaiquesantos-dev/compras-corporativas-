import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { PurchaseRequestsListPage } from './pages/PurchaseRequestsListPage'
import { NewPurchaseRequestPage } from './pages/NewPurchaseRequestPage'
import { PurchaseRequestDetailPage } from './pages/PurchaseRequestDetailPage'
import { ComingSoonPage } from './pages/ComingSoonPage'
import { ProtectedRoute } from './routes/ProtectedRoute'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-requests"
          element={
            <ProtectedRoute>
              <PurchaseRequestsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-requests/new"
          element={
            <ProtectedRoute roles={['REQUESTER']}>
              <NewPurchaseRequestPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-requests/:id"
          element={
            <ProtectedRoute>
              <PurchaseRequestDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute roles={['BUYER', 'ADMIN']}>
              <ComingSoonPage title="Fornecedores" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/approvals"
          element={
            <ProtectedRoute roles={['APPROVER', 'ADMIN']}>
              <ComingSoonPage title="Aprovações" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <ComingSoonPage title="Usuários" />
            </ProtectedRoute>
          }
        />
        <Route
          path="/departments"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <ComingSoonPage title="Departamentos" />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
