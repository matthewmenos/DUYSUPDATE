import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiX, FiTrendingUp } from 'react-icons/fi';
import api from '../api/client';
import getErrorMessage from '../utils/errors';

const CTAS = ['Visit Site', 'Learn More', 'Shop Now', 'Sign Up', 'Book Now', 'Contact Us', 'Download'];

/**
 * BoostModal — Facebook-Ads-style sponsored post promotion.
 * Priced in USD/day, charged in in-app DUYS at the live market rate.
 * Ported from legacy `DUYS/duys/templates/boost.html`.
 */
function BoostModal({ post, onClose }) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState(3);
  const [geo, setGeo] = useState('');
  const [audience, setAudience] = useState('');
  const [landingUrl, setLandingUrl] = useState(post?.landing_url || '');
  const [cta, setCta] = useState(CTAS[0]);
  const [ageMin, setAgeMin] = useState(18);
  const [ageMax, setAgeMax] = useState(65);

  const { data: rate } = useQuery({
    queryKey: ['economy', 'boost', 'rate'],
    queryFn: async () => (await api.get('/economy/boost/rate')).data,
  });

  const boostMutation = useMutation({
    mutationFn: async () =>
      (await api.post('/economy/boost', {
        postId: post.id,
        days,
        geo,
        audience,
        landingUrl,
        cta,
        ageMin,
        ageMax
      })).data,
    onSuccess: () => {
      toast.success(`Post boosted for ${days} days!`);
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      onClose();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const totalUsd = (rate?.usd_per_day || 0) * days;
  const totalDuys = (rate?.duys_per_day || 0) * days;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 overlay-fade" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden modal-pop">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/60">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <FiTrendingUp className="text-blue-400" /> Boost post
          </h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Duration */}
          <div>
            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Duration (days)</label>
            <div className="flex gap-2 mt-1.5 flex-wrap">
              {[1, 3, 7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
                    days === d ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Cost preview */}
          <div className="rounded-xl bg-gray-800/50 border border-gray-700/60 p-3 flex items-center justify-between">
            <span className="text-sm text-gray-400">Estimated cost</span>
            <span className="text-lg font-black text-white">
              {rate ? (
                totalDuys > 0 ? `${totalDuys.toFixed(4)} DUYS` : '—'
              ) : '…'}
              {rate?.usd_per_day > 0 && (
                <span className="text-xs text-gray-500 font-medium ml-1.5">≈ ${totalUsd.toFixed(2)}</span>
              )}
            </span>
          </div>
{/* CTA */}
          <div>
            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Call to action</label>
            <select
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
            >
              {CTAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Landing URL */}
          <div>
            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Landing URL</label>
            <input
              value={landingUrl}
              onChange={(e) => setLandingUrl(e.target.value)}
              placeholder="https://…"
              className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
            />
          </div>

          {/* Audience */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Age from</label>
              <input
                type="number"
                value={ageMin}
                onChange={(e) => setAgeMin(Number(e.target.value))}
                min={13}
                max={99}
                className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Age to</label>
              <input
                type="number"
                value={ageMax}
                onChange={(e) => setAgeMax(Number(e.target.value))}
                min={13}
                max={99}
                className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Target location (optional)</label>
            <input
              value={geo}
              onChange={(e) => setGeo(e.target.value)}
              placeholder="e.g. United States"
              maxLength={120}
              className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Audience interests (optional)</label>
            <input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. crypto, music"
              maxLength={200}
              className="mt-1.5 w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
            />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-700/60 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-full bg-gray-800 hover:bg-gray-700 text-sm font-semibold transition">
            Cancel
          </button>
          <button
            onClick={() => boostMutation.mutate()}
            disabled={boostMutation.isPending || !rate || totalDuys <= 0}
            className="flex-1 px-4 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-sm font-bold transition disabled:opacity-50"
          >
            {boostMutation.isPending ? 'Boosting…' : `Boost for ${days} day${days === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BoostModal;