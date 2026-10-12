import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Navigate, Link, useSearchParams, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import AuthShell from '../components/auth/AuthShell';
import SlidingTabs from '../components/ui/SlidingTabs';
import {
  COUNTRY_DIAL_CODES,
  DEFAULT_PHONE_COUNTRY,
  buildInternationalPhone,
} from '../constants/countryDialCodes';
import classes from './SignupPage.module.css';
import { referralService } from '../services/referralService';
import {
  resolveAgencyInvite,
  claimAgencyInvite,
  registerAgencyApplication,
} from '../services/agencyService';
import { AGENCY_POST_AUTH_RETRY_KEY } from '../utils/agencyGate';
import { initMetaPixelOnSignupPage, trackSignupComplete } from '../services/metaPixel';
import PersonaVerificationBlocker from '../components/auth/PersonaVerificationBlocker';
import { EASE_SMOOTH } from '../motion/appMotion';

import { TOS_VERSION, TOS_HEADER, TOS_TEXT } from '../utils/legalText';

const TRACKS = [
  { id: 'agent', label: 'Agent' },
  { id: 'join', label: 'Join agency' },
  { id: 'agency', label: 'Start agency' },
];

const BRAND_BY_TRACK = {
  agent: {
    eyebrow: 'Join CallsFlow',
    title: 'Create your agent account',
    highlight: 'agent',
    subtitle: 'Sign up to receive qualified inbound calls in your verticals.',
  },
  join: {
    eyebrow: 'Agency agents',
    title: 'Join your agency',
    highlight: 'agency',
    subtitle: 'Use the invite code or link from your agency admin to get assigned automatically.',
  },
  agency: {
    eyebrow: 'Agency partners',
    title: 'Start your agency',
    highlight: 'agency',
    subtitle: 'Apply as an agency admin. We review applications before you can invite agents.',
  },
};

function highlightTitle(title, highlight) {
  if (!highlight || !title.toLowerCase().includes(highlight.toLowerCase())) {
    return title;
  }
  const idx = title.toLowerCase().indexOf(highlight.toLowerCase());
  const before = title.slice(0, idx);
  const mid = title.slice(idx, idx + highlight.length);
  const after = title.slice(idx + highlight.length);
  return (
    <>
      {before}
      <span className={classes.titleHighlight}>{mid}</span>
      {after}
    </>
  );
}

const TosModal = ({ onAccept, onDecline }) =>
  createPortal(
    <div className={classes.tosModalOverlay} role="dialog" aria-modal="true" aria-labelledby="tos-modal-title">
      <div className={classes.tosModal}>
        <div className={classes.tosModalHeader}>
          <h2 id="tos-modal-title" className={classes.tosModalTitle}>Terms of Service — Calls Flow LLC</h2>
          <button className={classes.tosModalClose} onClick={onDecline} aria-label="Close">×</button>
        </div>
        <div className={classes.tosModalBody}>{TOS_TEXT}</div>
        <div className={classes.tosModalFooter}>
          <button className={classes.tosDeclineBtn} onClick={onDecline}>Decline</button>
          <button className={classes.tosAcceptBtn} onClick={onAccept}>I Agree &amp; Continue</button>
        </div>
      </div>
    </div>,
    document.body,
  );

const SPENDING_OPTIONS = [
  'Less than $500',
  '$500 - $1,000',
  '$1,000 - $2,500',
  '$2,500 - $5,000',
  '$5,000+',
  'Not currently spending',
];

const HEAR_ABOUT_OPTIONS = [
  'Google Search',
  'Facebook / Instagram',
  'YouTube',
  'Referral',
  'Discord',
  'Other',
];

const VERTICALS = [
  'Final Expense',
  'Spanish Final Expense',
  'ACA',
  'Medicare',
  'Leads',
];

const FIREBASE_ERROR_MAP = {
  'auth/email-already-in-use': 'An account with this email already exists',
  'auth/weak-password': 'Password must be at least 6 characters',
  'auth/invalid-email': 'Invalid email address',
  'auth/operation-not-allowed': 'Email/password sign-up is not enabled',
};

const getFirebaseErrorMessage = (error) => {
  const code = error?.code;
  return FIREBASE_ERROR_MAP[code] || error?.message || 'Something went wrong';
};

const SignupPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const token = useAuthStore((s) => s.token);
  const signup = useAuthStore((s) => s.signup);
  const googleLogin = useAuthStore((s) => s.googleLogin);
  const saveGoogleOnboarding = useAuthStore((s) => s.saveGoogleOnboarding);
  const refreshUserRole = useAuthStore((s) => s.refreshUserRole);

  const [searchParams] = useSearchParams();
  const [refCode] = useState(() => searchParams.get('ref')?.trim().toUpperCase() || '');
  const agencyParam = useMemo(
    () => searchParams.get('agency')?.trim().toUpperCase() || '',
    [searchParams],
  );
  const forceAgencyTrack = location.pathname.startsWith('/signup/agency');
  const trackLocked = Boolean(agencyParam) || forceAgencyTrack;

  const initialTrack = forceAgencyTrack ? 'agency' : agencyParam ? 'join' : 'agent';

  const [step, setStep] = useState('credentials');
  const [track, setTrack] = useState(initialTrack);
  const googleFlowActive = useRef(false);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phoneCountry: DEFAULT_PHONE_COUNTRY,
    phone: '',
    weeklySpend: '',
    usedInbound: '',
    verticals: '',
    hearAbout: '',
    password: '',
    confirmPassword: '',
    inviteCode: agencyParam || '',
    agencyName: '',
    agencyWebsite: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTosModal, setShowTosModal] = useState(false);
  const [invitePreview, setInvitePreview] = useState(null);
  const [invitePreviewError, setInvitePreviewError] = useState('');

  useEffect(() => {
    initMetaPixelOnSignupPage();
  }, []);

  useEffect(() => {
    if (agencyParam) {
      setTrack('join');
      setForm((prev) => ({ ...prev, inviteCode: agencyParam }));
    } else if (forceAgencyTrack) {
      setTrack('agency');
    }
  }, [agencyParam, forceAgencyTrack]);

  useEffect(() => {
    if (track !== 'join') {
      setInvitePreview(null);
      setInvitePreviewError('');
      return undefined;
    }
    const code = String(form.inviteCode || '').trim().toUpperCase();
    if (code.length < 8) {
      setInvitePreview(null);
      setInvitePreviewError('');
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const out = await resolveAgencyInvite(code);
        if (cancelled) return;
        setInvitePreview(out);
        setInvitePreviewError('');
      } catch (err) {
        if (cancelled) return;
        setInvitePreview(null);
        setInvitePreviewError(err?.message || 'Invalid invite code');
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [track, form.inviteCode]);

  const formStagger = reduceMotion
    ? { visible: { transition: { staggerChildren: 0 } } }
    : { visible: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } } };

  const fieldMotion = reduceMotion
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
        },
      };

  if (token && step === 'credentials' && !googleFlowActive.current && !submitting) {
    return <Navigate to="/app" replace />;
  }

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const validateOnboarding = () => {
    const digits = form.phone.replace(/\D/g, '');
    if (!digits || digits.length < 10) {
      toast.error('Enter a valid phone number (at least 10 digits)');
      return false;
    }
    if (!form.weeklySpend) { toast.error('Select your weekly lead spend'); return false; }
    if (!form.usedInbound) { toast.error('Select whether you have used inbound calls'); return false; }
    if (!form.verticals) { toast.error('Select a vertical'); return false; }
    if (!form.hearAbout) { toast.error('Select how you heard about us'); return false; }
    if (track === 'join') {
      const code = String(form.inviteCode || '').trim().toUpperCase();
      if (!code) { toast.error('Enter your agency invite code'); return false; }
      if (invitePreviewError) { toast.error(invitePreviewError); return false; }
    }
    if (track === 'agency' && !String(form.agencyName || '').trim()) {
      toast.error('Enter your agency name');
      return false;
    }
    return true;
  };

  const finishPostAuth = async () => {
    if (refCode && (track === 'agent' || track === 'join')) {
      try {
        await referralService.claimCode(refCode);
        toast.success('Referral code applied!');
      } catch (refErr) {
        console.warn('[Referral] Claim failed:', refErr.message);
      }
    }
    if (track === 'join') {
      const code = String(form.inviteCode || '').trim().toUpperCase();
      await claimAgencyInvite(code);
      await refreshUserRole();
      toast.success(invitePreview?.name
        ? `Joined ${invitePreview.name}`
        : 'Joined agency');
    }
    if (track === 'agency') {
      await registerAgencyApplication({
        name: String(form.agencyName || '').trim(),
        website: String(form.agencyWebsite || '').trim() || undefined,
      });
      await refreshUserRole();
      toast.success('Agency application submitted — awaiting approval');
    }
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!form.fullName.trim()) return toast.error('Full name is required');
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email))
      return toast.error('Enter a valid email address');
    if (!validateOnboarding()) return;
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');
    if (!termsAccepted) {
      toast.error('You must accept the Terms of Service to continue');
      setShowTosModal(true);
      return;
    }

    setSubmitting(true);
    try {
      await signup({
        ...form,
        phone: buildInternationalPhone(form.phoneCountry, form.phone),
        tosAccepted: true,
        tosVersion: TOS_VERSION,
        tosAcceptedAt: new Date().toISOString(),
      });
      await trackSignupComplete({
        email: form.email,
        phone: buildInternationalPhone(form.phoneCountry, form.phone),
        fullName: form.fullName,
      });
      try {
        await finishPostAuth();
        try { sessionStorage.removeItem(AGENCY_POST_AUTH_RETRY_KEY); } catch { /* ignore */ }
      } catch (postErr) {
        try {
          sessionStorage.setItem(AGENCY_POST_AUTH_RETRY_KEY, JSON.stringify({
            track,
            inviteCode: String(form.inviteCode || '').trim().toUpperCase(),
            agencyName: String(form.agencyName || '').trim(),
            agencyWebsite: String(form.agencyWebsite || '').trim(),
            at: Date.now(),
          }));
        } catch { /* ignore */ }
        toast.error(postErr?.message || 'Account created, but agency step failed — you can retry from Profile');
      }
      toast.success('Account created!');
      setStep('verification');
    } catch (err) {
      toast.error(getFirebaseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    if (submitting) return;
    setSubmitting(true);
    googleFlowActive.current = true;
    try {
      const { needsOnboarding } = await googleLogin();
      if (needsOnboarding) {
        setStep('onboarding');
      } else {
        toast.success('Welcome back!');
        googleFlowActive.current = false;
        navigate('/app');
      }
    } catch (err) {
      googleFlowActive.current = false;
      const ignorable = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];
      if (!ignorable.includes(err?.code)) {
        toast.error(getFirebaseErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOnboardingSubmit = async (e) => {
    e.preventDefault();
    if (!validateOnboarding()) return;
    if (!termsAccepted) {
      toast.error('You must accept the Terms of Service to continue');
      setShowTosModal(true);
      return;
    }

    setSubmitting(true);
    try {
      await saveGoogleOnboarding({
        ...form,
        phone: buildInternationalPhone(form.phoneCountry, form.phone),
        tosAccepted: true,
        tosVersion: TOS_VERSION,
        tosAcceptedAt: new Date().toISOString(),
      });
      const authUser = useAuthStore.getState().user;
      await trackSignupComplete({
        email: authUser?.email || '',
        phone: buildInternationalPhone(form.phoneCountry, form.phone),
        fullName: form.fullName || authUser?.name || '',
      });
      try {
        await finishPostAuth();
        try { sessionStorage.removeItem(AGENCY_POST_AUTH_RETRY_KEY); } catch { /* ignore */ }
      } catch (postErr) {
        try {
          sessionStorage.setItem(AGENCY_POST_AUTH_RETRY_KEY, JSON.stringify({
            track,
            inviteCode: String(form.inviteCode || '').trim().toUpperCase(),
            agencyName: String(form.agencyName || '').trim(),
            agencyWebsite: String(form.agencyWebsite || '').trim(),
            at: Date.now(),
          }));
        } catch { /* ignore */ }
        toast.error(postErr?.message || 'Account created, but agency step failed — you can retry from Profile');
      }
      toast.success('Account created!');
      googleFlowActive.current = false;
      setStep('verification');
    } catch (err) {
      toast.error(err?.message || 'Failed to save profile');
    } finally {
      setSubmitting(false);
    }
  };

  const renderTrackFields = () => {
    if (track === 'join') {
      return (
        <div className={`${classes.fieldGroup} ${classes.spanFull}`}>
          <label className={classes.label} htmlFor="signup-invite-code">
            Agency invite code
            <span className={classes.required}>*</span>
          </label>
          <input
            id="signup-invite-code"
            className={classes.input}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="AGENCY-XXXXXX"
            value={form.inviteCode}
            onChange={(e) => update('inviteCode', e.target.value.toUpperCase())}
            readOnly={Boolean(agencyParam)}
          />
          {invitePreview?.name ? (
            <p className={classes.inviteHint}>Joining <strong>{invitePreview.name}</strong></p>
          ) : null}
          {invitePreviewError ? (
            <p className={classes.inviteError}>{invitePreviewError}</p>
          ) : null}
        </div>
      );
    }
    if (track === 'agency') {
      return (
        <>
          <div className={`${classes.fieldGroup} ${classes.spanFull}`}>
            <label className={classes.label} htmlFor="signup-agency-name">
              Agency name
              <span className={classes.required}>*</span>
            </label>
            <input
              id="signup-agency-name"
              className={classes.input}
              type="text"
              placeholder="Acme Insurance Group"
              value={form.agencyName}
              onChange={(e) => update('agencyName', e.target.value)}
            />
          </div>
          <div className={`${classes.fieldGroup} ${classes.spanFull}`}>
            <label className={classes.label} htmlFor="signup-agency-website">
              Website <span className={classes.optional}>(optional)</span>
            </label>
            <input
              id="signup-agency-website"
              className={classes.input}
              type="url"
              placeholder="https://"
              value={form.agencyWebsite}
              onChange={(e) => update('agencyWebsite', e.target.value)}
            />
          </div>
        </>
      );
    }
    return null;
  };

  const brandCopy = BRAND_BY_TRACK[track] || BRAND_BY_TRACK.agent;

  // In-place text swap: short travel + light blur (avoid heavy filter that ghosts underlines).
  const textSwap = reduceMotion
    ? {
      initial: false,
      animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
      exit: { opacity: 1, y: 0, filter: 'blur(0px)' },
      transition: { duration: 0 },
    }
    : {
      initial: { opacity: 0, y: 4, filter: 'blur(2px)' },
      animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
      exit: { opacity: 0, y: -4, filter: 'blur(2px)' },
      transition: { duration: 0.15, ease: 'easeInOut' },
    };

  const panelSwap = reduceMotion
    ? {
      initial: false,
      animate: { opacity: 1, height: 'auto' },
      exit: { opacity: 1 },
      transition: { duration: 0 },
    }
    : {
      initial: { opacity: 0, y: 10, height: 0 },
      animate: { opacity: 1, y: 0, height: 'auto' },
      exit: { opacity: 0, y: -6, height: 0 },
      transition: { duration: 0.3, ease: EASE_SMOOTH },
    };

  const renderOnboardingFields = () => (
    <>
      <div className={classes.trackFieldsSlot}>
        <AnimatePresence mode="wait" initial={false}>
          {(track === 'join' || track === 'agency') ? (
            <motion.div
              key={track}
              className={classes.trackFieldsInner}
              {...panelSwap}
            >
              {renderTrackFields()}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <div className={`${classes.fieldGroup} ${classes.spanFull}`}>
        <label className={classes.label} htmlFor="signup-phone-local">
          Phone
          <span className={classes.required}>*</span>
        </label>
        <div className={classes.phoneRow}>
          <select
            className={classes.countrySelect}
            value={form.phoneCountry}
            onChange={(e) => update('phoneCountry', e.target.value)}
            aria-label="Country"
          >
            {COUNTRY_DIAL_CODES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.dial})
              </option>
            ))}
          </select>
          <input
            id="signup-phone-local"
            className={classes.phoneInput}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="Mobile number (no country code)"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
          />
        </div>
      </div>

      <div className={classes.fieldGroup}>
        <label className={classes.label} htmlFor="signup-weekly-spend">
          Weekly lead spend
          <span className={classes.required}>*</span>
        </label>
        <select
          id="signup-weekly-spend"
          className={classes.select}
          value={form.weeklySpend}
          onChange={(e) => update('weeklySpend', e.target.value)}
        >
          <option value="" disabled>Select an option</option>
          {SPENDING_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className={classes.fieldGroup}>
        <label className={classes.label} htmlFor="signup-hear-about">
          How did you hear about us?
          <span className={classes.required}>*</span>
        </label>
        <select
          id="signup-hear-about"
          className={classes.select}
          value={form.hearAbout}
          onChange={(e) => update('hearAbout', e.target.value)}
        >
          <option value="" disabled>Select an option</option>
          {HEAR_ABOUT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div className={`${classes.fieldGroup} ${classes.spanFull}`}>
        <span className={classes.label}>
          Used inbound calls before?
          <span className={classes.required}>*</span>
        </span>
        <div className={classes.radioGroup} role="group" aria-label="Inbound call experience">
          <label className={classes.radioLabel}>
            <input
              className={classes.radioInput}
              type="radio"
              name="usedInbound"
              value="Yes"
              checked={form.usedInbound === 'Yes'}
              onChange={(e) => update('usedInbound', e.target.value)}
            />
            Yes
          </label>
          <label className={classes.radioLabel}>
            <input
              className={classes.radioInput}
              type="radio"
              name="usedInbound"
              value="No"
              checked={form.usedInbound === 'No'}
              onChange={(e) => update('usedInbound', e.target.value)}
            />
            No
          </label>
        </div>
      </div>

      <div className={`${classes.fieldGroup} ${classes.spanFull}`}>
        <span className={classes.label}>
          Vertical interest
          <span className={classes.required}>*</span>
        </span>
        <div className={classes.verticalsWrap} role="group" aria-label="Vertical interest">
          {VERTICALS.map((v) => (
            <label key={v} className={classes.verticalPill}>
              <input
                className={classes.radioInput}
                type="radio"
                name="verticals"
                value={v}
                checked={form.verticals === v}
                onChange={(e) => update('verticals', e.target.value)}
              />
              {v}
            </label>
          ))}
        </div>
      </div>
    </>
  );

  const renderBrandPanel = (eyebrow, heading, subtitle, { animateKey, highlight } = {}) => {
    const key = animateKey || `${eyebrow}|${heading}`;
    return (
      <div className={classes.brandCopy}>
        <div className={classes.brandLine}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`eyebrow-${key}`}
              className={classes.eyebrow}
              {...textSwap}
            >
              {eyebrow}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className={classes.brandHeadingWrap}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={`title-${key}`}
              className={classes.heading}
              {...textSwap}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.15, ease: 'easeInOut', delay: 0.02 }
              }
            >
              {highlightTitle(heading, highlight)}
            </motion.h1>
          </AnimatePresence>
        </div>
        <div className={classes.brandLine}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={`sub-${key}`}
              className={classes.subtitle}
              {...textSwap}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.15, ease: 'easeInOut', delay: 0.04 }
              }
            >
              {subtitle}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    );
  };

  if (step === 'onboarding') {
    return (
      <>
        <AuthShell
          brand={renderBrandPanel(
            'Profile',
            'Complete your profile',
            'A few details so we can route the right calls to you.',
          )}
        >
          <motion.div initial="hidden" animate="visible" variants={formStagger}>
            <motion.form
              className={`${classes.form} ${classes.formGrid}`}
              onSubmit={handleOnboardingSubmit}
              variants={fieldMotion}
            >
              {renderOnboardingFields()}

              {/* Inline ToS Box */}
              <div className={`${classes.tosInlineWrap} ${classes.spanFull}`}>
                <div className={classes.tosInlineBox}>
                  <strong className={classes.tosInlineHeader}>{TOS_HEADER}</strong>
                  {TOS_TEXT}
                </div>
                <div className={classes.tosRow}>
                  <input
                    id="tos-check-onboarding"
                    type="checkbox"
                    className={classes.tosCheckbox}
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                  />
                  <label htmlFor="tos-check-onboarding" className={classes.tosLabel}>
                    I have read and agree to the Terms of Service above
                  </label>
                </div>
              </div>

              <button
                className={`${classes.submitBtn} ${classes.spanFull}`}
                type="submit"
                disabled={submitting || !termsAccepted}
              >
                {submitting ? 'Saving...' : 'Complete Setup'}
              </button>
            </motion.form>
          </motion.div>
        </AuthShell>
      </>
    );
  }

  if (step === 'verification') {
    return (
      <AuthShell
        brand={renderBrandPanel(
          'Verification',
          'Secure your account',
          'Complete a quick identity check to finalize your setup.',
        )}
      >
        <motion.div initial="hidden" animate="visible" variants={formStagger}>
          <PersonaVerificationBlocker onComplete={() => navigate('/app')} />
        </motion.div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      brand={renderBrandPanel(
        brandCopy.eyebrow,
        brandCopy.title,
        brandCopy.subtitle,
        { animateKey: track, highlight: brandCopy.highlight },
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {refCode && (track === 'agent' || track === 'join') ? (
          <motion.div
            key={`ref-${refCode}`}
            className={classes.referralBanner}
            initial={reduceMotion ? false : { opacity: 0, y: -6, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4, filter: 'blur(2px)' }}
            transition={{ duration: 0.25, ease: EASE_SMOOTH }}
          >
            <span className={classes.referralIcon} aria-hidden>✦</span>
            <span>
              Referral code{' '}
              <strong className={classes.referralCode}>{refCode}</strong>
              {' '}applied — welcome aboard!
            </span>
          </motion.div>
        ) : null}

        {invitePreview?.name && track === 'join' ? (
          <motion.div
            key={`invite-${invitePreview.name}`}
            className={classes.referralBanner}
            initial={reduceMotion ? false : { opacity: 0, y: -6, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4, filter: 'blur(2px)' }}
            transition={{ duration: 0.25, ease: EASE_SMOOTH }}
          >
            <span className={classes.referralIcon} aria-hidden>✦</span>
            <span>
              Joining agency{' '}
              <strong className={classes.referralCode}>{invitePreview.name}</strong>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!trackLocked ? (
        <motion.div
          className={classes.trackSwitchWrap}
          initial={reduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_SMOOTH }}
        >
          <SlidingTabs
            tabs={TRACKS}
            activeKey={track}
            onChange={setTrack}
            className={classes.trackSwitch}
            ariaLabel="Signup type"
          />
        </motion.div>
      ) : (
        <motion.div
          className={classes.lockedTrackChip}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.28, ease: EASE_SMOOTH }}
        >
          {track === 'join' ? 'Joining via invite link' : 'Agency admin signup'}
        </motion.div>
      )}

      <motion.div initial="hidden" animate="visible" variants={formStagger}>
        <motion.div variants={fieldMotion}>
          <button type="button" className={classes.googleBtn} onClick={handleGoogleSignup} disabled={submitting}>
            <svg className={classes.googleIcon} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign up with Google
          </button>
        </motion.div>

        <motion.div className={classes.divider} variants={fieldMotion}>
          <span className={classes.dividerLine} />
          <span className={classes.dividerText}>or</span>
          <span className={classes.dividerLine} />
        </motion.div>

        <motion.form
          className={`${classes.form} ${classes.formGrid}`}
          onSubmit={handleEmailSubmit}
          variants={fieldMotion}
        >
          <div className={classes.fieldGroup}>
            <label className={classes.label} htmlFor="signup-full-name">Full Name</label>
            <input
              id="signup-full-name"
              className={classes.input}
              type="text"
              autoComplete="name"
              placeholder="John Doe"
              value={form.fullName}
              onChange={(e) => update('fullName', e.target.value)}
            />
          </div>

          <div className={classes.fieldGroup}>
            <label className={classes.label} htmlFor="signup-email">Email</label>
            <input
              id="signup-email"
              className={classes.input}
              type="email"
              autoComplete="email"
              placeholder="john@example.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>

          {renderOnboardingFields()}

          <div className={classes.fieldGroup}>
            <label className={classes.label} htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              className={classes.input}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
            />
          </div>

          <div className={classes.fieldGroup}>
            <label className={classes.label} htmlFor="signup-password-confirm">Confirm Password</label>
            <input
              id="signup-password-confirm"
              className={classes.input}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
            />
          </div>

          {/* Inline ToS Box */}
          <div className={`${classes.tosInlineWrap} ${classes.spanFull}`}>
            <div className={classes.tosInlineBox}>
              <strong className={classes.tosInlineHeader}>{TOS_HEADER}</strong>
              {TOS_TEXT}
            </div>
            <div className={classes.tosRow}>
              <input
                id="tos-check-email"
                type="checkbox"
                className={classes.tosCheckbox}
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <label htmlFor="tos-check-email" className={classes.tosLabel}>
                I have read and agree to the Terms of Service above
              </label>
            </div>
          </div>

          <button
            className={`${classes.submitBtn} ${classes.spanFull}`}
            type="submit"
            disabled={submitting || !termsAccepted}
          >
            {submitting ? 'Creating Account...' : 'Continue'}
          </button>
        </motion.form>
      </motion.div>

      <p className={classes.footer}>
        Already have an account?{' '}
        <Link to="/login" className={classes.footerLink}>Sign in</Link>
      </p>

      {showTosModal ? (
        <TosModal
          onAccept={() => {
            setTermsAccepted(true);
            setShowTosModal(false);
          }}
          onDecline={() => setShowTosModal(false)}
        />
      ) : null}
    </AuthShell>
  );
};

export default SignupPage;
