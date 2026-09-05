import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiX, FiHeart } from 'react-icons/fi';
import api from '../api/client';
import getErrorMessage from '../utils/errors';

const PRESETS = [10, 50, 100, 500];

/**
 * TipModal — send points (or DUYS) to a user.
 * Presets: 10 / 50 / 100 / 500 (points) or 1 / 5 / 10 / 50 (DUYS).
 */
function TipModal({ toUserId, toName, postId, onClose }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(10);
  const [useDuys, setUseDuys] = useState(false);
  const [custom, setCustom] = useState('');
  const [message, setMessage] = useState('');

  const tipMutation = useMutation({
    mutationFn: async () =>
      (await api.post('/wallet/tip', {
        toUserId,
        amount: custom ? Number(custom) : amount,
        message,
        useDuys
      })).data,
    onSuccess: () => {
      toast.success(`Tip sent to ${toName}!`);
      queryClient.invalidateQueries(['wallet', 'balance']);
      queryClient.invalidateQueries(['economy', 'earn']);
      if (postId) queryClient.invalidateQueries(['posts']);
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const isCustom = custom !== '';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 overlay-fade" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden modal-pop">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/60">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FiHeart className="text-rose-400" /> Tip {toName}
          </h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Currency toggle */}
          <div className="flex rounded-full bg-gray-800 p-1">
            <button
              onClick={() => { setUseDuys(false); setCustom(''); }}
              className={`flex-1 py-1.5 rounded-full text-sm font-semibold transition ${!useDuys ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
            >
              Points
            </button>
            <button
              onClick={() => { setUseDuys(true); setCustom(''); }}
              className={`flex-1 py-1.5 rounded-full text-sm font-semibold transition ${useDuys ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
            >
              DUYS
            </button>
          </div>

          {/* Presets */}
          <div className="grid grid-cols-4 gap-2">
            {(useDuys ? PRESETS.map((p) => p / 10) : PRESETS).map((p) => (
              <button
                key={p}
                onClick={() => { setAmount(p); setCustom(''); }}
                className={`py-2 rounded-xl text-sm font-bold transition ${
                  !isCustom && amount === p ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <input
            type="number"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={useDuys ? 'Custom DUYS amount…' : 'Custom points amount…'}
            min="0"
            step={useDuys ? '0.000001' : '1'}
            className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
          />

          {/* Message */}
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message (optional)"
            maxLength={280}
            className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
          />
        </div>

        <div className="px-5 py-4 border-t border-gray-700/60 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-full bg-gray-800 hover:bg-gray-700 text-sm font-semibold transition">
            Cancel
          </button>
          <button
            onClick={() => tipMutation.mutate()}
            disabled={tipMutation.isPending || (!custom && !amount) || (custom && Number(custom) <= 0)}
            className="flex-1 px-4 py-2.5 rounded-full bg-rose-500 hover:bg-rose-400 text-sm font-bold transition disabled:opacity-50"
          >
            {tipMutation.isPending ? 'Sending…' : `Send ${custom || amount} ${useDuys ? 'DUYS' : 'pts'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TipModal;