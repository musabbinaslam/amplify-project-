import React, { useState, useRef } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import {
  COUNTRY_DIAL_CODES,
  DEFAULT_PHONE_COUNTRY,
  buildInternationalPhone,
} from '../constants/countryDialCodes';
import classes from './SignupPage.module.css';

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

  // Redirect authenticated users UNLESS Google onboarding is in progress
  if (token && step === 'credentials' && !googleFlowActive.current) {
    return <Navigate to="/app" replace />;
  }

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const validateOnboarding = () => {
    const digits = form.phone.replace(/\D/g, '');
    if (!digits || digits.length < 6) {
      toast.error('Enter a valid phone number (country + local digits)');
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

    setSubmitting(true);
    try {
      await signup({
        ...form,
        phone: buildInternationalPhone(form.phoneCountry, form.phone),
      });
      toast.success('Account created!');
      navigate('/app');
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

    setSubmitting(true);
    try {
      await saveGoogleOnboarding({
        ...form,
        phone: buildInternationalPhone(form.phoneCountry, form.phone),
      });
      toast.success('Account created!');
      googleFlowActive.current = false;
      navigate('/app');
    } catch (err) {
      toast.error(err?.message || 'Failed to save profile');
    } finally {
      setSubmitting(false);
    }
  };

  const renderOnboardingFields = () => (
    <>
      <div className={classes.fieldGroup}>
        <label className={classes.label}>Phone</label>
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
        <label className={classes.label}>
          How much are you currently spending per week on leads?
          <span className={classes.required}>*</span>
        </label>
        <select
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
        <label className={classes.label}>
          Have you ever used inbound calls before?
          <span className={classes.required}>*</span>
        </label>
        <div className={classes.radioGroup}>
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

      <div className={classes.fieldGroup}>
        <label className={classes.label}>
          Which verticals are you interested in?
          <span className={classes.required}>*</span>
        </label>
        <div className={classes.verticalsList}>
          {VERTICALS.map((v) => (
            <label key={v} className={classes.radioLabel}>
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

      <div className={classes.fieldGroup}>
        <label className={classes.label}>
          How did you hear about us?
          <span className={classes.required}>*</span>
        </label>
        <select
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
    </>
  );

  if (step === 'onboarding') {
    return (
      <div className={classes.page}>
        <motion.div
          className={classes.card}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className={classes.logoBlock}>
            <div className={classes.logoIcon}>
              <span className={classes.logoTriangle} />
            </div>
            <span className={classes.logoText}>CALLSFLOW</span>
          </div>

          <h1 className={classes.heading}>Complete Your Profile</h1>
          <p className={classes.subtitle}>Just a few more details to get you started</p>

          <form className={classes.form} onSubmit={handleOnboardingSubmit}>
            {renderOnboardingFields()}

            <button className={classes.submitBtn} type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Complete Setup'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={classes.page}>
      <motion.div
        className={classes.card}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <div className={classes.logoBlock}>
          <div className={classes.logoIcon}>
            <span className={classes.logoTriangle} />
          </div>
          <span className={classes.logoText}>CALLSFLOW</span>
        </div>

        <h1 className={classes.heading}>Create Agent Account</h1>
        <p className={classes.subtitle}>Sign up to start receiving calls</p>

        <button type="button" className={classes.googleBtn} onClick={handleGoogleSignup} disabled={submitting}>
          <svg className={classes.googleIcon} viewBox="0 0 24 24" width="20" height="20">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign up with Google
        </button>

        <div className={classes.divider}>
          <span className={classes.dividerLine} />
          <span className={classes.dividerText}>or</span>
          <span className={classes.dividerLine} />
        </div>

        <form className={classes.form} onSubmit={handleEmailSubmit}>
          <div className={classes.fieldGroup}>
            <label className={classes.label}>Full Name</label>
            <input
              className={classes.input}
              type="text"
              placeholder="John Doe"
              value={form.fullName}
              onChange={(e) => update('fullName', e.target.value)}
            />
          </div>

          <div className={classes.fieldGroup}>
            <label className={classes.label}>Email</label>
            <input
              className={classes.input}
              type="email"
              placeholder="john@example.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>

          {renderOnboardingFields()}

          <div className={classes.fieldGroup}>
            <label className={classes.label}>Password</label>
            <input
              className={classes.input}
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
            />
          </div>

          <div className={classes.fieldGroup}>
            <label className={classes.label}>Confirm Password</label>
            <input
              className={classes.input}
              type="password"
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => update('confirmPassword', e.target.value)}
            />
          </div>

          <button className={classes.submitBtn} type="submit" disabled={submitting}>
            {submitting ? 'Creating Account...' : 'Continue'}
          </button>
        </form>

        <p className={classes.footer}>
          Already have an account?{' '}
          <Link to="/login" className={classes.footerLink}>Sign in</Link>
        </p>
      </motion.div>
    </div>
  );
};

export default SignupPage;
