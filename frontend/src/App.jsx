import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import AppShell from './components/layout/AppShell';
import PageLoader from './components/ui/PageLoader';
import ErrorFallback from './components/ui/ErrorFallback';
import useAuthStore from './store/authStore';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const TakeCallsPage = lazy(() => import('./pages/TakeCallsPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CallLogsPage = lazy(() => import('./pages/CallLogsPage'));
const AITrainingPage = lazy(() => import('./pages/AITrainingPage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const LicensedStatesPage = lazy(() => import('./pages/LicensedStatesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));

const ScriptPage = lazy(() => import('./pages/ScriptPage'));
const LeadsPage = lazy(() => Promise.resolve({ default: () => <div><h2 style={{color: 'white'}}>Leads (Beta)</h2></div> }));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ReferralProgramPage = lazy(() => import('./pages/ReferralProgramPage'));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'));
const AdminAITrainingPage = lazy(() => import('./pages/AdminAITrainingPage'));

import DialerOverlay from './components/ui/DialerOverlay';

const ProtectedRoute = () => {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <AppShell />;
};

const GuestRoute = ({ children }) => {
  const token = useAuthStore((s) => s.token);
  if (token) return <Navigate to="/app" replace />;
  return children;
};

const AdminOnly = ({ children }) => {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'admin') return <Navigate to="/app" replace />;
  return children;
};

/** Tiny redirect: /r/AGENT-XXXXXX → /signup?ref=AGENT-XXXXXX */
const ReferralRedirect = () => {
  const { code } = useParams();
  return <Navigate to={`/signup?ref=${encodeURIComponent(code || '')}`} replace />;
};

const AnimatedRoutes = () => {
  return (
    <>
      <DialerOverlay />
      <Routes>
        {/* Public landing page */}
        <Route path="/" element={
          <Suspense fallback={<PageLoader />}><LandingPage /></Suspense>
        } />

        <Route path="/signup" element={
          <Suspense fallback={<PageLoader />}><SignupPage /></Suspense>
        } />
        <Route path="/login" element={
          <GuestRoute>
            <Suspense fallback={<PageLoader />}><LoginPage /></Suspense>
          </GuestRoute>
        } />

        {/* Short referral redirect: /r/AGENT-XXXXXX → /signup?ref=AGENT-XXXXXX */}
        <Route path="/r/:code" element={<ReferralRedirect />} />

        {/* Authenticated app under /app */}
        <Route path="/app" element={<ProtectedRoute />}>
          <Route index element={
            <Suspense fallback={<PageLoader />}><WelcomePage /></Suspense>
          } />
          <Route path="take-calls" element={
            <Suspense fallback={<PageLoader />}><TakeCallsPage /></Suspense>
          } />
          <Route path="dashboard" element={
            <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>
          } />
          <Route path="call-logs" element={
            <Suspense fallback={<PageLoader />}><CallLogsPage /></Suspense>
          } />
          <Route path="ai-training" element={
            <Suspense fallback={<PageLoader />}><AITrainingPage /></Suspense>
          } />
          <Route path="script" element={
            <Suspense fallback={<PageLoader />}><ScriptPage /></Suspense>
          } />
          <Route path="billing" element={
            <Suspense fallback={<PageLoader />}><BillingPage /></Suspense>
          } />
          <Route path="licensed-states" element={
            <Suspense fallback={<PageLoader />}><LicensedStatesPage /></Suspense>
          } />
          <Route path="leads" element={
            <Suspense fallback={<PageLoader />}><LeadsPage /></Suspense>
          } />
          <Route path="profile" element={
            <Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>
          } />
          <Route path="support" element={
            <Suspense fallback={<PageLoader />}><SupportPage /></Suspense>
          } />
          <Route path="settings" element={
            <Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>
          } />
          <Route path="referral-program" element={
            <Suspense fallback={<PageLoader />}><ReferralProgramPage /></Suspense>
          } />
          <Route path="admin" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminDashboardPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/ai-training" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminAITrainingPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="*" element={<div><h2 style={{color: 'white'}}>404 Not Found</h2></div>} />
        </Route>
      </Routes>
    </>
  );
};

function App() {
  return (
    <Router>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <AnimatedRoutes />
        <Analytics />
        <SpeedInsights />
      </ErrorBoundary>
    </Router>
  );
}

export default App;
