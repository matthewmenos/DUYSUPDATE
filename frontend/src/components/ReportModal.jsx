import React, { useState } from 'react';
import { FiX } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/client';

const REASONS = [
  { key: 'spam', label: 'Spam' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'hate', label: 'Hate speech' },
  { key: 'misinformation', label: 'Misinformation' },
  { key: 'violence', label: 'Violence or dangerous content' },
  { key: 'other', label: 'Other' }
];

/**
 * ReportModal — the 6-reason report flow (legacy parity).
 * POSTs to /posts/report and notifies the team.
 */
function ReportModal({ entityType = 'post', entityId, onClose }) {
  const [busy, setBusy] = useState(false);

  const submit = async (reason) => {
    setBusy(true);
    try {
      await api.post('/posts/report', { entityType, entityId, reason });
      toast.success('Report submitted. Our team will review it.');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit report');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 overlay-fade" />
      <div
        className="relative w-full max-w-sm bg-black border border-gray-700 rounded-2xl p-5 drawer-slide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold">Report {entityType}</h3>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center">
            <FiX className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">Why are you reporting this {entityType}?</p>
        <div className="space-y-2">
          {REASONS.map((r) => (
            <button
              key={r.key}
              disabled={busy}
              onClick={() => submit(r.key)}
              className="w-full text-left px-4 py-2.5 rounded-xl border border-gray-700 hover:border-red-500 hover:bg-red-500/5 text-sm text-gray-200 transition disabled:opacity-50"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ReportModal;