import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Navigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import AuthShell from '../components/auth/AuthShell';
import {
  COUNTRY_DIAL_CODES,
  DEFAULT_PHONE_COUNTRY,
  buildInternationalPhone,
} from '../constants/countryDialCodes';
import classes from './SignupPage.module.css';
import { referralService } from '../services/referralService';
import { initMetaPixelOnSignupPage, trackSignupComplete } from '../services/metaPixel';
import PersonaVerificationBlocker from '../components/auth/PersonaVerificationBlocker';

import { TOS_VERSION, TOS_HEADER, TOS_TEXT } from '../utils/legalText';

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
  const reduceMotion = useReducedMotion();
  const token = useAuthStore((s) => s.token);
  const signup = useAuthStore((s) => s.signup);
  const googleLogin = useAuthStore((s) => s.googleLogin);
  const saveGoogleOnboarding = useAuthStore((s) => s.saveGoogleOnboarding);

  const [step, setStep] = useState('credentials');
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
  });

  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTosModal, setShowTosModal] = useState(false);

  const [searchParams] = useSearchParams();
  const [refCode] = useState(() => searchParams.get('ref')?.trim().toUpperCase() || '');

  useEffect(() => {
    initMetaPixelOnSignupPage();
  }, []);

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
    return true;
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
      if (refCode) {
        try {
          await referralService.claimCode(refCode);
          toast.success('Referral code applied! You\'re helping your referrer earn a discount.');
        } catch (refErr) {
          console.warn('[Referral] Claim failed:', refErr.message);
        }
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
      if (refCode) {
        try {
          await referralService.claimCode(refCode);
          toast.success('Referral code applied! Complete all steps to unlock your discount.');
        } catch (refErr) {
          console.warn('[Referral] Claim failed:', refErr.message);
        }
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

  const renderOnboardingFields = () => (
    <>
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

  const renderBrandPanel = (eyebrow, heading, subtitle) => (
    <>
      <div className={classes.logoBlock}>
        <img
          src="/logo.png"
          alt="Callsflow logo"
          className={classes.logoImg}
          loading="eager"
          decoding="async"
        />
        <span className={classes.logoText}>CALLSFLOW</span>
      </div>
      <span className={classes.eyebrow}>{eyebrow}</span>
      <h1 className={classes.heading}>{heading}</h1>
      <p className={classes.subtitle}>{subtitle}</p>
      <Link to="/" className={classes.backHomeLink}>
        <ArrowLeft size={14} aria-hidden />
        Back to Landing Page
      </Link>
    </>
  );

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
        'Join CallsFlow',
        'Create your agent account',
        'Sign up to receive qualified inbound calls in your verticals.',
      )}
    >
      {refCode && (
        <div className={classes.referralBanner}>
          <span className={classes.referralIcon} aria-hidden>✦</span>
          <span>
            Referral code{' '}
            <strong className={classes.referralCode}>{refCode}</strong>
            {' '}applied — welcome aboard!
          </span>
        </div>
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
    </AuthShell>
  );
};

export default SignupPage;
