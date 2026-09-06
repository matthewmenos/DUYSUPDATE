import React from 'react';

/**
 * EmptyState — consistent empty/placeholder layout.
 * Props:
 *  - icon: React node (e.g. <FiUsers />)
 *  - title: short headline (default 'Nothing here yet')
 *  - message: optional secondary line
 *  - action: optional React node (button/call-to-action)
 *  - compact: smaller padding (for lists/panes)
 */
function EmptyState({ icon, title = 'Nothing here yet', message, action, compact = false }) {
  return (
    <div className={compact ? 'py-8 text-center' : 'py-16 text-center'}>
      {icon && (
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-800/60 text-gray-500">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-300">{title}</h3>
      {message && <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;