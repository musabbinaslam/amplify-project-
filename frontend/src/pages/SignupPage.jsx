import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
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

const SignupPage = () => {
  const navigate = useNavigate();
  const signup = useAuthStore((s) => s.signup);
  const googleLogin = useAuthStore((s) => s.googleLogin);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    weeklySpend: '',
    usedInbound: '',
    verticals: '',
    hearAbout: '',
    password: '',
    confirmPassword: '',
  });

  const [submitting, setSubmitting] = useState(false);

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.fullName.trim()) return toast.error('Full name is required');
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email))
      return toast.error('Enter a valid email address');
    if (!form.phone.trim()) return toast.error('Phone number is required');
    if (!form.weeklySpend) return toast.error('Select your weekly lead spend');
    if (!form.usedInbound) return toast.error('Select whether you have used inbound calls');
    if (!form.verticals) return toast.error('Select a vertical');
    if (!form.hearAbout) return toast.error('Select how you heard about us');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');

    setSubmitting(true);
    try {
      signup(form);
      toast.success('Account created!');
      navigate('/');
    } catch {
      toast.error('Something went wrong');
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

        <h1 className={classes.heading}>Create Agent Account</h1>
        <p className={classes.subtitle}>Sign up to start receiving calls</p>

        <div className={classes.googleBtnWrapper}>
          <GoogleLogin
            onSuccess={(resp) => {
              googleLogin(resp.credential);
              toast.success('Account created!');
              navigate('/');
            }}
            onError={() => toast.error('Google sign-in failed')}
            theme="filled_black"
            size="large"
            width="396"
            text="signup_with"
            shape="rectangular"
          />
        </div>

        <div className={classes.divider}>
          <span className={classes.dividerLine} />
          <span className={classes.dividerText}>or</span>
          <span className={classes.dividerLine} />
        </div>

        <form className={classes.form} onSubmit={handleSubmit}>
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

          <div className={classes.fieldGroup}>
            <label className={classes.label}>Phone</label>
            <input
              className={classes.input}
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
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
      </div>
    </div>
  );
};

export default SignupPage;
