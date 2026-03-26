import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import SessionTimeoutModal from './components/SessionTimeoutModal'

import HomePage            from './pages/HomePage'
import LoginPage           from './pages/LoginPage'
import SignUpPage          from './pages/SignUpPage'
import ForgotPasswordPage  from './pages/ForgotPasswordPage'
import ResetPasswordPage   from './pages/ResetPasswordPage'
import ResumePage          from './pages/ResumePage'
import ResumeResultPage   from './pages/ResumeResultPage'
import ResumeGeneratorPage from './pages/ResumeGeneratorPage'
import ContactPage         from './pages/ContactPage'

export default function App() {
  return (
    <AuthProvider>
      {/* Session-timeout modal — rendered above everything else in the stacking context */}
      <SessionTimeoutModal />

      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            {/* Public routes */}
            <Route path="/"                  element={<HomePage />} />
            <Route path="/login"             element={<LoginPage />} />
            <Route path="/signup"            element={<SignUpPage />} />
            <Route path="/forgot-password"   element={<ForgotPasswordPage />} />
            <Route path="/reset-password"    element={<ResetPasswordPage />} />
            <Route path="/contact"           element={<ContactPage />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/resume"         element={<ResumePage />} />
              <Route path="/resume/result"  element={<ResumeResultPage />} />
              <Route path="/generate"       element={<ResumeGeneratorPage />} />
            </Route>

            {/* Fallback — any unknown URL sends the user to login */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </AuthProvider>
  )
}
