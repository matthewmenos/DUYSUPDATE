import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { FiX, FiShield, FiCheck } from 'react-icons/fi';
import api from '../api/client';
import { getErrorMessage } from '../utils/errors';

const BADGES = [
  { id: 'blue', label: 'Blue', cost: 10000, color: 'bg-blue-500', desc: 'For established, notable creators.' },
  { id: 'gold', label: 'Gold', cost: 25000, color: 'bg-amber-500', desc: 'Top-tier verified accounts.' },
  { id: 'grey', label: 'Grey', cost: 5000, color: 'bg-gray-400', desc: 'Basic account verification.' }
];

function BadgeRequestModal({ onClose, points }) {
  const [selected, setSelected] = useState('blue');
  const [busy, setBusy] = useState(false);
  const badge = BADGES.find((b) => b.id === selected);

  const handleRequest = async () => {
    setBusy(true);
    try {
      const res = await api.post('/verify/badge/request', { badge: selected });
      toast.success('Badge request submitted for review');
      onClose(res.data);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to request badge'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <FiShield className="w-5 h-5 text-blue-400" /> Request verification
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-800"><FiX className="w-5 h-5" /></button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          You have <span className="text-blue-400 font-semibold">{Number(points || 0).toLocaleString()} points</span>. Select a badge to request.
        </p>

        <div className="space-y-3">
          {BADGES.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelected(b.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition ${
                selected === b.id ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-500'
              }`}
            >
              <span className={`w-9 h-9 rounded-full ${b.color} flex items-center justify-center text-white shrink-0`}>
                <FiCheck className="w-4 h-4" />
              </span>
              <span className="flex-1 text-left">
                <span className="block font-semibold">{b.label}</span>
                <span className="block text-xs text-gray-400">{b.desc}</span>
              </span>
              <span className="text-sm font-semibold text-blue-400">{b.cost.toLocaleString()} pts</span>
            </button>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-full border border-gray-700 text-gray-300 hover:bg-gray-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleRequest}
            disabled={busy || (points || 0) < badge.cost}
            className="flex-1 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 font-semibold transition disabled:opacity-50"
          >
            {busy ? 'Submitting...' : `Request ${badge.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BadgeRequestModal;