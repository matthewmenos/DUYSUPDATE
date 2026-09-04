import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';
import { getErrorMessage } from '../../utils/errors';
import toast from 'react-hot-toast';

/**
 * Two-Factor Authentication challenge screen.
 * The user lands here after login when twofaRequired is returned.
 * Verifies a 6-digit TOTP code via POST /auth/2fa/challenge.
 */
function TwoFactorChallenge() {
  const navigate = useNavigate();
  const location = useLocation();
  const verifyTwoFactor = useAuthStore((s) => s.verifyTwoFactor);

  const challengeToken = location.state?.challengeToken;
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // If we don't have a challenge token, bounce back to login.
  useEffect(() => {
    if (!challengeToken) {
      navigate('/login', { replace: true });
    }
  }, [challengeToken, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!challengeToken) return;
    if (code.trim().length !== 6) {
      toast.error('Enter the 6-digit code from your authenticator app');
      return;
    }
    setIsLoading(true);
    try {
      await verifyTwoFactor(challengeToken, code.trim());
      toast.success('Verified! Welcome back.');
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Invalid code. Try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-grid">
        <div className="auth-art">
          <img src="/logo.png" width="96" height="96" alt="DUYS"
            className="auth-logo drop-shadow-[0_8px_30px_rgba(29,155,246,0.35)]" />
          <h1 className="auth-brand">DUYS</h1>
          <p className="auth-tagline">Two-factor authentication</p>
        </div>
        <div className="auth-card">
          <h2 className="text-2xl font-bold mb-1">Enter your code</h2>
          <p className="text-sm text-gray-400 mb-6">
            Open your authenticator app and enter the 6-digit code to finish signing in.
          </p>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="otp-code">6-digit code</label>
              <input
                id="otp-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength="6"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                style={{ textAlign: 'center', fontSize: 28, letterSpacing: 12, fontWeight: 700 }}
                autoFocus
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Verify & sign in'}
            </button>
          </form>

          <div className="auth-switch">
            <Link to="/login">← Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TwoFactorChallenge;