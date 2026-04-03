import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { AnimatePresence } from 'framer-motion';
import AppShell from './components/layout/AppShell';
import PageLoader from './components/ui/PageLoader';
import ErrorFallback from './components/ui/ErrorFallback';
import PageTransition from './components/ui/PageTransition';
import useAuthStore from './store/authStore';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

const WelcomePage = lazy(() => import('./pages/WelcomePage'));
const TakeCallsPage = lazy(() => import('./pages/TakeCallsPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CallLogsPage = lazy(() => import('./pages/CallLogsPage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const LicensedStatesPage = lazy(() => import('./pages/LicensedStatesPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

const ScriptPage = lazy(() => Promise.resolve({ default: () => <PageTransition><div><h2 style={{color: 'white'}}>Agent Script</h2></div></PageTransition> }));
const LeadsPage = lazy(() => Promise.resolve({ default: () => <PageTransition><div><h2 style={{color: 'white'}}>Leads (Beta)</h2></div></PageTransition> }));
const SettingsPage = lazy(() => Promise.resolve({ default: () => <PageTransition><div><h2 style={{color: 'white'}}>Settings</h2></div></PageTransition> }));

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

const AnimatedRoutes = () => {
  const location = useLocation();
  
  return (
    <>
      <DialerOverlay />
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
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

          {/* Authenticated app under /app */}
          <Route path="/app" element={<ProtectedRoute />}>
            <Route index element={
              <Suspense fallback={<PageLoader />}><PageTransition><WelcomePage /></PageTransition></Suspense>
            } />
            <Route path="take-calls" element={
              <Suspense fallback={<PageLoader />}><PageTransition><TakeCallsPage /></PageTransition></Suspense>
            } />
            <Route path="dashboard" element={
              <Suspense fallback={<PageLoader />}><PageTransition><DashboardPage /></PageTransition></Suspense>
            } />
            <Route path="call-logs" element={
              <Suspense fallback={<PageLoader />}><PageTransition><CallLogsPage /></PageTransition></Suspense>
            } />
            <Route path="script" element={
              <Suspense fallback={<PageLoader />}><PageTransition><ScriptPage /></PageTransition></Suspense>
            } />
            <Route path="billing" element={
              <Suspense fallback={<PageLoader />}><PageTransition><BillingPage /></PageTransition></Suspense>
            } />
            <Route path="licensed-states" element={
              <Suspense fallback={<PageLoader />}><PageTransition><LicensedStatesPage /></PageTransition></Suspense>
            } />
            <Route path="leads" element={
              <Suspense fallback={<PageLoader />}><PageTransition><LeadsPage /></PageTransition></Suspense>
            } />
            <Route path="profile" element={
              <Suspense fallback={<PageLoader />}><PageTransition><ProfilePage /></PageTransition></Suspense>
            } />
            <Route path="settings" element={
              <Suspense fallback={<PageLoader />}><PageTransition><SettingsPage /></PageTransition></Suspense>
            } />
            <Route path="*" element={<PageTransition><div><h2 style={{color: 'white'}}>404 Not Found</h2></div></PageTransition>} />
          </Route>
        </Routes>
      </AnimatePresence>
    </>
  );
};

function App() {
  return (
    <Router>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <AnimatedRoutes />
      </ErrorBoundary>
    </Router>
  );
}

export default App;
