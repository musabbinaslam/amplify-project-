import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import classes from './LoginPage.module.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!email.trim() || !/\S+@\S+\.\S+/.test(email))
      return toast.error('Enter a valid email address');
    if (!password) return toast.error('Password is required');

    setSubmitting(true);
    try {
      login(email, password);
      toast.success('Welcome back!');
      navigate('/');
    } catch {
      toast.error('Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={classes.page}>
      <div className={classes.card}>
        <div className={classes.logoBlock}>
          <div className={classes.logoIcon}>
            <span className={classes.logoTriangle} />
          </div>
          <span className={classes.logoText}>AGENTCALLS</span>
        </div>

        <h1 className={classes.heading}>Welcome Back</h1>
        <p className={classes.subtitle}>Sign in to your account</p>

        <form className={classes.form} onSubmit={handleSubmit}>
          <div className={classes.fieldGroup}>
            <label className={classes.label}>Email</label>
            <input
              className={classes.input}
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={classes.fieldGroup}>
            <label className={classes.label}>Password</label>
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
      </div>
    </div>
  );
};

export default LoginPage;
