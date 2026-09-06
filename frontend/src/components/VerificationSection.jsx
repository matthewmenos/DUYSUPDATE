import React, { useState, useEffect, useRef } from 'react';
import { FiCheck } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/client';
import { getErrorMessage } from '../utils/errors';

/**
 * VerificationSection — email / phone / face / badge verification status
 * and actions, backed by the existing `/verify/*` endpoints.
 */
function VerificationSection({ user }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState(user?.email || '');
  const [emailCode, setEmailCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneSent, setPhoneSent] = useState(false);

  const [faceBusy, setFaceBusy] = useState(false);
  const faceRef = useRef(null);

  const isVerified = (type) => (status || []).some((v) => v.type === type && v.isVerified);

  const loadStatus = async () => {
    try {
      const r = await api.get('/verify/status');
      setStatus(r.data.verifications || []);
    } catch (e) {
      setStatus([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await api.get('/verify/status');
        if (active) setStatus(r.data.verifications || []);
      } catch (e) {
        if (active) setStatus([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const sendEmail = async () => {
    setBusy(true);
    try {
      await api.post('/verify/email/send', { email });
      setEmailSent(true);
      toast.success('Verification code sent to your email');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send code'));
    } finally {
      setBusy(false);
    }
  };

  const confirmEmail = async () => {
    setBusy(true);
    try {
      await api.post('/verify/email/verify', { email, verificationCode: emailCode });
      toast.success('Email verified');
      setEmailSent(false);
      setEmailCode('');
      loadStatus();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Verification failed'));
    } finally {
      setBusy(false);
    }
  };

  const sendPhone = async () => {
    setBusy(true);
    try {
      await api.post('/verify/phone/send', { phone });
      setPhoneSent(true);
      toast.success('Verification code sent via SMS');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to send code'));
    } finally {
      setBusy(false);
    }
  };

  const confirmPhone = async () => {
    setBusy(true);
    try {
      await api.post('/verify/phone/verify', { phone, verificationCode: phoneCode });
      toast.success('Phone verified');
      setPhoneSent(false);
      setPhoneCode('');
      loadStatus();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Verification failed'));
    } finally {
      setBusy(false);
    }
  };

  const uploadFace = async (file) => {
    setFaceBusy(true);
    const form = new FormData();
    form.append('face', file);
    try {
      await api.post('/verify/face', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Face photo uploaded for review');
      loadStatus();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Upload failed'));
    } finally {
      setFaceBusy(false);
      if (faceRef.current) faceRef.current.value = '';
    }
  };

  const badge = user?.verified_badge;
return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Verified badge</p>
          <p className="text-xs text-gray-500">
            {badge ? `You have a ${badge} badge.` : 'No verified badge yet. Request one from your profile.'}
          </p>
        </div>
        {badge && (
          <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${badge === 'blue' ? 'bg-blue-500' : badge === 'gold' ? 'bg-amber-500' : 'bg-gray-500'}`}>
            {badge}
          </span>
        )}
      </div>

      <div className="border-t border-gray-800 pt-3">
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          Email {isVerified('email') && <FiCheck className="text-green-400" />}
        </p>
        {isVerified('email') ? (
          <p className="text-xs text-green-400">Your email is verified.</p>
        ) : (
          <div className="space-y-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              type="email"
              className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {emailSent && (
              <input
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
                className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            <button
              onClick={emailSent ? confirmEmail : sendEmail}
              disabled={busy || !email}
              className="rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50"
            >
              {busy ? '...' : emailSent ? 'Confirm code' : 'Verify email'}
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800 pt-3">
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          Phone {isVerified('phone') && <FiCheck className="text-green-400" />}
        </p>
        {isVerified('phone') ? (
          <p className="text-xs text-green-400">Your phone is verified.</p>
        ) : (
          <div className="space-y-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              type="tel"
              className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {phoneSent && (
              <input
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
                className="mt-1 w-full bg-gray-900 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
            <button
              onClick={phoneSent ? confirmPhone : sendPhone}
              disabled={busy || !phone}
              className="rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50"
            >
              {busy ? '...' : phoneSent ? 'Confirm code' : 'Verify phone'}
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-gray-800 pt-3">
        <p className="text-sm font-medium mb-1 flex items-center gap-2">
          Face check {isVerified('face') && <FiCheck className="text-green-400" />}
        </p>
        {isVerified('face') ? (
          <p className="text-xs text-green-400">Face verification approved.</p>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-2">
              Upload a clear photo of your face. Reviewed by our moderation team.
            </p>
            <button
              onClick={() => faceRef.current?.click()}
              disabled={faceBusy}
              className="rounded-full border border-gray-600 hover:bg-gray-800 text-white text-xs font-semibold px-4 py-2 disabled:opacity-50"
            >
              {faceBusy ? 'Uploading...' : 'Upload face photo'}
            </button>
            <input
              ref={faceRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadFace(e.target.files[0])}
            />
          </>
        )}
      </div>

      <div className="border-t border-gray-800 pt-3">
        <p className="text-sm font-medium mb-2">Status</p>
        {loading ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : (status || []).length === 0 ? (
          <p className="text-xs text-gray-500">No verification attempts yet.</p>
        ) : (
          <ul className="space-y-1">
            {(status || []).map((v, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="capitalize text-gray-300">{v.type}</span>
                <span className={v.isVerified ? 'text-green-400 font-medium' : 'text-gray-500'}>
                  {v.isVerified ? 'Verified' : 'Pending'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default VerificationSection;