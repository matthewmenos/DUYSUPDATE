import React from 'react';

/**
 * PollWidget — poll options with live percentage bars.
 * - Not voted: options are tappable; tapping POSTs /posts/:id/vote.
 * - Voted (or poll locked): shows results with the user's choice highlighted.
 */
function PollWidget({ postId, options = [], myVote = null, onVote, disabled = false }) {
  const total = options.reduce((sum, o) => sum + (o.votes || 0), 0);
  const pct = (v) => (total > 0 ? Math.floor(((v || 0) / total) * 100) : 0);

  return (
    <div className="poll mt-3 space-y-2">
      {options.map((opt) => {
        const isMine = myVote === opt.id;
        const width = pct(opt.votes);
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled || !!myVote || !onVote}
            onClick={() => onVote?.(opt.id)}
            className={`relative w-full text-left rounded-xl border transition overflow-hidden ${
              isMine
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-700 hover:border-gray-500 bg-gray-900/40'
            } ${disabled || myVote ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {/* Fill bar */}
            {!!myVote && (
              <span
                className={`absolute inset-y-0 left-0 ${isMine ? 'bg-blue-500/25' : 'bg-blue-500/10'}`}
                style={{ width: `${width}%` }}
              />
            )}
            <span className="relative flex items-center justify-between px-4 py-2.5 text-sm">
              <span className={`font-medium ${isMine ? 'text-blue-300' : 'text-gray-200'}`}>
                {opt.label}
                {isMine && <span className="ml-2 text-xs text-blue-400">✓ Your vote</span>}
              </span>
              {!!myVote && <span className="font-bold text-gray-300">{width}%</span>}
            </span>
          </button>
        );
      })}
      <p className="text-xs text-gray-500 px-1">{total} vote{total === 1 ? '' : 's'}</p>
    </div>
  );
}

export default PollWidget;