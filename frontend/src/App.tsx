import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { PurchaseRequestsListPage } from './pages/PurchaseRequestsListPage'
import { NewPurchaseRequestPage } from './pages/NewPurchaseRequestPage'
import { PurchaseRequestDetailPage } from './pages/PurchaseRequestDetailPage'
import { SuppliersPage } from './pages/SuppliersPage'
import { ApprovalsPage } from './pages/ApprovalsPage'
import { UsersPage } from './pages/UsersPage'
import { DepartmentsPage } from './pages/DepartmentsPage'
import { NotFoundPage } from './pages/NotFoundPage'
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
              <SuppliersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/approvals"
          element={
            <ProtectedRoute roles={['APPROVER', 'ADMIN']}>
              <ApprovalsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/departments"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <DepartmentsPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
