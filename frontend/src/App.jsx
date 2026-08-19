import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import AppShell from './components/layout/AppShell';
import PageLoader from './components/ui/PageLoader';
import ErrorFallback from './components/ui/ErrorFallback';
import LandingPage from './pages/LandingPage';
import useAuthStore from './store/authStore';
import { isAgencyAdminUser } from './utils/authRoles';
import { auth } from './config/firebase';
import UpdateBanner from './components/ui/UpdateBanner';
import TermsGatewayModal from './components/TermsGatewayModal';

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
const NotesPage = lazy(() => import('./pages/NotesPage'));
const LeadsPage = lazy(() => import('./pages/LeadsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ReferralProgramPage = lazy(() => import('./pages/ReferralProgramPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const AdminHubPage = lazy(() => import('./pages/admin/AdminHubPage'));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage'));
const AdminLiveOpsPage = lazy(() => import('./pages/admin/AdminLiveOpsPage'));
const AdminCallContestsPage = lazy(() => import('./pages/admin/AdminCallContestsPage'));
const AdminAgentsPage = lazy(() => import('./pages/admin/AdminAgentsPage'));
const AdminCampaignsPage = lazy(() => import('./pages/admin/AdminCampaignsPage'));
const AdminPhoneRoutingPage = lazy(() => import('./pages/admin/AdminPhoneRoutingPage'));
const AdminAgenciesPage = lazy(() => import('./pages/admin/AdminAgenciesPage'));
const AdminManagersPage = lazy(() => import('./pages/admin/AdminManagersPage'));
const AdminAgenciesOpsPage = lazy(() => import('./pages/admin/AdminAgenciesOpsPage'));
const AdminTeamsOpsPage = lazy(() => import('./pages/admin/AdminTeamsOpsPage'));
const AdminAITrainingPage = lazy(() => import('./pages/AdminAITrainingPage'));
const AdminAiFlagsPage = lazy(() => import('./pages/admin/AdminAiFlagsPage'));
const AdminQaRulesPage = lazy(() => import('./pages/admin/AdminQaRulesPage'));
const AdminNotificationSettingsPage = lazy(() => import('./pages/AdminNotificationSettingsPage'));

const QaDashboardPage = lazy(() => import('./pages/QaDashboardPage'));
const QaAITrainingPage = lazy(() => import('./pages/QaAITrainingPage'));
const QaReviewPage = lazy(() => import('./pages/QaReviewPage'));

const TeamDashboardPage = lazy(() => import('./pages/TeamDashboardPage'));
const AgencyDashboardPage = lazy(() => import('./pages/AgencyDashboardPage'));


import DialerOverlay from './components/ui/DialerOverlay';

const ProtectedRoute = () => {
  const token = useAuthStore((s) => s.token);
  const loading = useAuthStore((s) => s.loading);
  const hasFirebaseSession = Boolean(auth?.currentUser);
  if (loading) return <PageLoader fullScreen />;
  if (!token || !hasFirebaseSession) return <Navigate to="/login" replace />;
  return (
    <>
      <TermsGatewayModal />
      <AppShell />
    </>
  );
};

const GuestRoute = ({ children }) => {
  const token = useAuthStore((s) => s.token);
  const loading = useAuthStore((s) => s.loading);
  const hasFirebaseSession = Boolean(auth?.currentUser);
  if (loading) return <PageLoader fullScreen />;
  if (token && hasFirebaseSession) return <Navigate to="/app" replace />;
  return children;
};


const QaOnly = ({ children }) => {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'admin' && role !== 'qa') return <Navigate to="/app" replace />;
  return children;
};

const AdminOnly = ({ children }) => {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'admin') return <Navigate to="/app" replace />;
  return children;
};

const AgencyAdminOnly = ({ children }) => {
  const user = useAuthStore((s) => s.user);
  if (!isAgencyAdminUser(user) && user?.role !== 'manager') {
    return <Navigate to="/app" replace />;
  }
  return children;
};

const ManagerOnly = ({ children }) => {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'admin' && role !== 'manager') {
    return <Navigate to="/app" replace />;
  }
  return children;
};

/** Tiny redirect: /r/AGENT-XXXXXX → /signup?ref=AGENT-XXXXXX */
const ReferralRedirect = () => {
  const { code } = useParams();
  return <Navigate to={`/signup?ref=${encodeURIComponent(code || '')}`} replace />;
};

/** Redirect legacy /admin/ops/agencies/:id → ?selected= */
const OpsAgencyRedirect = () => {
  const { agencyId } = useParams();
  return (
    <Navigate
      to={`/app/admin/ops/agencies?selected=${encodeURIComponent(agencyId || '')}`}
      replace
    />
  );
};

/** Redirect legacy /admin/ops/teams/:uid → ?selected= */
const OpsTeamRedirect = () => {
  const { managerUid } = useParams();
  return (
    <Navigate
      to={`/app/admin/ops/teams?selected=${encodeURIComponent(managerUid || '')}`}
      replace
    />
  );
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
          <Route path="leaderboard" element={
            <Suspense fallback={<PageLoader />}><LeaderboardPage /></Suspense>
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
          <Route path="notes" element={
            <Suspense fallback={<PageLoader />}><NotesPage /></Suspense>
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
                <AdminHubPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/analytics" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminAnalyticsPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/live-ops" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminLiveOpsPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/call-contests" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminCallContestsPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/agents" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminAgentsPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/campaigns" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminCampaignsPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/phone-routing" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminPhoneRoutingPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/agencies" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminAgenciesPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/managers" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminManagersPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/ops/agencies" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminAgenciesOpsPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/ops/agencies/:agencyId" element={<OpsAgencyRedirect />} />
          <Route path="admin/ops/teams" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminTeamsOpsPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/ops/teams/:managerUid" element={<OpsTeamRedirect />} />
          <Route path="admin/ai-training" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminAITrainingPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/ai-flags" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminAiFlagsPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/qa-rules" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminQaRulesPage />
              </AdminOnly>
            </Suspense>
          } />
          <Route path="admin/notifications" element={
            <Suspense fallback={<PageLoader />}>
              <AdminOnly>
                <AdminNotificationSettingsPage />
              </AdminOnly>
            </Suspense>
          } />
          
          <Route path="qa" element={
            <Suspense fallback={<PageLoader />}>
              <QaOnly>
                <QaDashboardPage />
              </QaOnly>
            </Suspense>
          } />
          <Route path="qa/ai-training" element={
            <Suspense fallback={<PageLoader />}>
              <QaOnly>
                <QaAITrainingPage />
              </QaOnly>
            </Suspense>
          } />
          <Route path="qa/review" element={
            <Suspense fallback={<PageLoader />}>
              <QaOnly>
                <QaReviewPage />
              </QaOnly>
            </Suspense>
          } />

          <Route path="agency" element={
            <Suspense fallback={<PageLoader />}>
              <AgencyAdminOnly>
                <AgencyDashboardPage />
              </AgencyAdminOnly>
            </Suspense>
          } />
          <Route path="team-dashboard" element={
            <Suspense fallback={<PageLoader />}>
              <ManagerOnly>
                <TeamDashboardPage />
              </ManagerOnly>
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
        <UpdateBanner />
        <Analytics />
        <SpeedInsights />
      </ErrorBoundary>
    </Router>
  );
}

export default App;
