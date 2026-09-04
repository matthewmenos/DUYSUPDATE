import React from 'react';

/** Confirm / prompt dialog — ported from the legacy app's duysConfirm modal.
 *  Controlled by parent: render conditionally when `open` is truthy.
 *  - title / message: strings
 *  - icon: 'danger' | 'confirm' (tone applied to the icon circle)
 *  - okLabel / okClass: customize the confirm button
 *  - onConfirm / onCancel: handlers (parent closes by unsetting `open`)
 */
function ConfirmDialog({
  open = true,
  title = 'Confirm',
  message = '',
  icon = 'confirm',
  okLabel = 'OK',
  cancelLabel = 'Cancel',
  okClass = 'bg-blue-600 text-white hover:bg-blue-500',
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  const iconTone = icon === 'danger'
    ? 'bg-rose-500/12 text-rose-400'
    : 'bg-blue-500/12 text-blue-400';
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div className="w-full max-w-sm rounded-3xl border border-gray-700 bg-gray-900 p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className={`mx-auto mb-4 flex h-13 w-13 items-center justify-center rounded-full ${iconTone}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {icon === 'danger' ? (
              <path d="M12 2 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6Z" />
            ) : (
              <path d="M4 3h16v18H4z" /><path d="M8 7h8M8 11h8M8 15h5" />
            )}
          </svg>
        </div>
        <h3 className="text-lg font-bold">{title}</h3>
        {message && <p className="mt-2 text-sm text-gray-400">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-full border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-gray-800">{cancelLabel}</button>
          <button onClick={onConfirm} className={`rounded-full px-4 py-2 text-sm font-semibold ${okClass}`}>{okLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;