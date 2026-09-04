import React, { useState, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import GoogleLoginButton from '../../components/GoogleLoginButton';
import { getErrorMessage } from '../../utils/errors';
import { IconEye, IconEyeOff } from '../../components/icons';
import toast from 'react-hot-toast';

/**
 * Unified auth page â€” glass design with tabbed Login/Signup, referral
 * code field, password strength meter, 2FA challenge redirect and
 * mobile-responsive two-panel layout. Ported from legacy DUYS auth screens.
 */
function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const loginWithGoogleCredential = useAuthStore((s) => s.loginWithGoogleCredential);

  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState(tabParam === 'signup' ? 'signup' : 'login');
  const [showPassword, setShowPassword] = useState(false);
  const [pwStrength, setPwStrength] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const refFromUrl = searchParams.get('ref') || '';

  const [formData, setFormData] = useState({
    email: '', username: '', displayName: '', password: '',
    confirmPassword: '', referralCode: refFromUrl, agreeTerms: false,
  });

  const scorePassword = (pw) => {
    let s = 0;
    if (!pw) return -1;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(s, 4);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
    if (name === 'password') setPwStrength(Math.max(0, scorePassword(value)));
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await login(formData.email, formData.password);
      if (result.twofaRequired) {
        navigate('/auth/2fa', { state: { challengeToken: result.challengeToken } });
        return;
      }
      toast.success('Logged in successfully!');
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Login failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    if (!formData.agreeTerms) return toast.error('Please accept the Terms, Guidelines, and Privacy Policy');
    if (formData.password.length < 8) return toast.error('Password must be at least 8 characters');
    if (formData.password !== formData.confirmPassword) return toast.error('Passwords do not match');
    setIsLoading(true);
    try {
      await useAuthStore.getState().register(
        formData.email, formData.username, formData.password,
        formData.displayName, formData.referralCode || undefined
      );
      toast.success('Account created successfully!');
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Registration failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleCredential = useCallback(async (credential) => {
    setIsLoading(true);
    try {
      const result = await loginWithGoogleCredential(credential, formData.referralCode || undefined);
      if (result.twofaRequired) {
        navigate('/auth/2fa', { state: { challengeToken: result.challengeToken } });
        return;
      }
      toast.success(tab === 'signup' ? 'Account created with Google!' : 'Logged in with Google!');
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Google sign-in failed'));
    } finally {
      setIsLoading(false);
    }
  }, [loginWithGoogleCredential, tab, navigate, formData.referralCode]);

  const pwLabels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const pwColors = ['#f4212e', '#f4212e', '#f5b50a', '#1d9bf6', '#00ba7c'];
return (
    <div className="auth-page">
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />
      <div className="auth-grid">
        <div className="auth-art">
          <img src="/logo.png" width="96" height="96" alt="DUYS"
            className="auth-logo drop-shadow-[0_8px_30px_rgba(29,155,246,0.35)]" />
          <h1 className="auth-brand">DUYS</h1>
          <p className="auth-tagline">Post. Connect. Broadcast. Earn $DUYS.</p>
        </div>
        <div className="auth-card">
          <div className="auth-tabs" role="tablist">
            <button className={'auth-tab' + (tab === 'login' ? ' active' : '')}
              role="tab" onClick={() => setTab('login')}>Login</button>
            <button className={'auth-tab' + (tab === 'signup' ? ' active' : '')}
              role="tab" onClick={() => setTab('signup')}>Sign up</button>
            <span className={'auth-tab-slider' + (tab === 'signup' ? ' right' : '')} />
          </div>

          {formData.referralCode && (
            <div className="ref-note">Referred by <strong>@{formData.referralCode}</strong> â€” you both earn $DUYS!</div>
          )}

          {tab === 'login' && (
            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <div className="field">
                <label htmlFor="login-email">Email or username</label>
                <input id="login-email" type="text" name="email" placeholder="you@example.com"
                  value={formData.email} onChange={handleChange} required autoComplete="username" />
              </div>
              <div className="field">
                <label htmlFor="login-pass">Password</label>
                <div className="pw-wrap">
                  <input id="login-pass" type={showPassword ? 'text' : 'password'} name="password"
                    placeholder="Your password" value={formData.password} onChange={handleChange}
                    required autoComplete="current-password" />
                  <button type="button" className="pw-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
                {isLoading ? 'Logging in...' : 'Log in'}
              </button>
            </form>
          )}
{tab === 'signup' && (
            <form className="auth-form" onSubmit={handleSignupSubmit}>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="su-name">Name</label>
                  <input id="su-name" type="text" name="displayName" placeholder="Your name"
                    value={formData.displayName} onChange={handleChange} required autoComplete="name" />
                </div>
                <div className="field">
                  <label htmlFor="su-username">Username</label>
                  <div className="username-wrap">
                    <span className="username-at">@</span>
                    <input id="su-username" type="text" name="username" placeholder="username"
                      value={formData.username} onChange={handleChange} required minLength="3"
                      maxLength="20" pattern="[A-Za-z0-9_]+" title="3-20 letters, numbers or underscores"
                      autoComplete="off" />
                  </div>
                </div>
              </div>

              <div className="field">
                <label htmlFor="su-email">Email</label>
                <input id="su-email" type="email" name="email" placeholder="you@example.com"
                  value={formData.email} onChange={handleChange} required autoComplete="email" />
              </div>

              <div className="field">
                <label htmlFor="su-ref">Referral code <span className="muted">(optional)</span></label>
                <input id="su-ref" type="text" name="referralCode" placeholder="friend's username"
                  value={formData.referralCode} onChange={handleChange} autoComplete="off" />
              </div>

              <div className="field">
                <label htmlFor="su-pass">Password</label>
                <div className="pw-wrap">
                  <input id="su-pass" type={showPassword ? 'text' : 'password'} name="password"
                    placeholder="At least 8 characters" value={formData.password} onChange={handleChange}
                    required minLength="8" autoComplete="new-password" />
                  <button type="button" className="pw-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
                  </button>
                </div>
                <div className="pw-meter">
                  <div className="pw-meter-bar">
                    <span className="pw-meter-fill"
                      style={{ width: (pwStrength * 25) + '%', background: pwColors[pwStrength] || 'transparent' }} />
                  </div>
                  <span className="pw-meter-label"
                    style={{ color: pwStrength > 0 ? pwColors[pwStrength] : 'inherit' }}>
                    {pwStrength > 0 ? pwLabels[pwStrength] : 'Password strength'}
                  </span>
                </div>
              </div>
<div className="field">
                <label htmlFor="su-pass2">Confirm password</label>
                <div className="pw-wrap">
                  <input id="su-pass2" type={showPassword ? 'text' : 'password'} name="confirmPassword"
                    placeholder="Re-enter password" value={formData.confirmPassword} onChange={handleChange}
                    required autoComplete="new-password" />
                  <button type="button" className="pw-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <IconEyeOff size={20} /> : <IconEye size={20} />}
                  </button>
                </div>
                {formData.password && formData.confirmPassword && (
                  <span className={'pw-match ' + (formData.password === formData.confirmPassword ? 'ok' : 'err')}>
                    {formData.password === formData.confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                  </span>
                )}
              </div>

              <div className="field field-checkbox">
                <label className="checkbox-label" htmlFor="su-agree">
                  <input id="su-agree" name="agreeTerms" type="checkbox"
                    checked={formData.agreeTerms} onChange={handleChange} required />
                  <span>
                    By continuing you agree to the <Link to="/legal/terms">Terms</Link>,{' '}
                    <Link to="/legal/guidelines">Guidelines</Link> &amp; <Link to="/legal/privacy">Privacy Policy</Link>.
                  </span>
                </label>
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
                {isLoading ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          )}

          <div className="auth-or"><span>or</span></div>
          <GoogleLoginButton onCredential={handleGoogleCredential} />

          <div className="auth-switch">
            {tab === 'login' ? (
              <p>Don't have an account? <button onClick={() => setTab('signup')}>Sign up</button></p>
            ) : (
              <p>Already have an account? <button onClick={() => setTab('login')}>Log in</button></p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
