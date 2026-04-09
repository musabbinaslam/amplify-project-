import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import classes from './LoginPage.module.css';

const FIREBASE_ERROR_MAP = {
  'auth/user-not-found': 'No account found with this email',
  'auth/wrong-password': 'Incorrect password',
  'auth/invalid-credential': 'Invalid email or password',
  'auth/too-many-requests': 'Too many attempts. Please try again later',
  'auth/user-disabled': 'This account has been disabled',
  'auth/invalid-email': 'Invalid email address',
  'auth/no-account-yet':
    'No account found for this Google account. Please sign up first. Use Sign up below.',
};

const getFirebaseErrorMessage = (error) => {
  const code = error?.code;
  return FIREBASE_ERROR_MAP[code] || error?.message || 'Something went wrong';
};

const LoginPage = () => {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const googleSignIn = useAuthStore((s) => s.googleSignIn);
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim() || !/\S+@\S+\.\S+/.test(email))
      return toast.error('Enter a valid email address');
    if (!password) return toast.error('Password is required');

    setSubmitting(true);
    try {
      await login(email, password);
      toast.success('Welcome back!');
      navigate('/app');
    } catch (err) {
      toast.error(getFirebaseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (googleSubmitting) return;
    setGoogleSubmitting(true);
    try {
      await googleSignIn();
      toast.success('Welcome back!');
      navigate('/app');
    } catch (err) {
      toast.error(getFirebaseErrorMessage(err));
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      return toast.error('Enter your email above first');
    }
    try {
      await resetPassword(email);
      toast.success('Password reset email sent! Check your inbox.');
    } catch (err) {
      toast.error(getFirebaseErrorMessage(err));
    }
  };

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

        <h1 className={classes.heading}>Agent Portal</h1>
        <p className={classes.subtitle}>Sign in to access your dashboard</p>

        <button
          type="button"
          className={classes.googleBtn}
          onClick={handleGoogleLogin}
          disabled={googleSubmitting}
        >
          <svg className={classes.googleIcon} viewBox="0 0 24 24" width="20" height="20">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {googleSubmitting ? 'Signing in...' : 'Sign in with Google'}
        </button>

        <div className={classes.divider}>
          <span className={classes.dividerLine} />
          <span className={classes.dividerText}>or</span>
          <span className={classes.dividerLine} />
        </div>

        <form className={classes.form} onSubmit={handleSubmit}>
          <div className={classes.fieldGroup}>
            <label className={classes.label}>Email</label>
            <input
              className={classes.input}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={classes.fieldGroup}>
            <div className={classes.labelRow}>
              <label className={classes.label}>Password</label>
              <button
                type="button"
                className={classes.forgotLink}
                onClick={handleForgotPassword}
              >
                Forgot password?
              </button>
            </div>
            <input
              className={classes.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className={classes.submitBtn} type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className={classes.footer}>
          Don&apos;t have an account?{' '}
          <Link to="/signup" className={classes.footerLink}>Sign up</Link>
        </p>
        <Link to="/" className={classes.backHomeLink}>
          Back to Landing Page
        </Link>
      </motion.div>
    </div>
  );
};

export default LoginPage;
