import { useState, useCallback } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';

/**
 * useConfirm — promise-based confirmation dialog built on ConfirmDialog.
 *
 * Usage:
 *   const { ask, dialog } = useConfirm();
 *   const handleDelete = async () => {
 *     const ok = await ask({ title: 'Delete?', message: 'This cannot be undone.', okLabel: 'Delete' });
 *     if (!ok) return;
 *     // proceed with the destructive action
 *   };
 *   // render {dialog} once
 */
export default function useConfirm() {
  const [state, setState] = useState(null);

  const ask = useCallback((opts) => new Promise((resolve) => {
    setState({ ...opts, resolve });
  }), []);

  const close = useCallback(() => setState(null), []);

  const handleConfirm = useCallback(() => {
    if (state) state.resolve(true);
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    if (state) state.resolve(false);
    setState(null);
  }, [state]);

  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      message={state.message}
      icon={state.icon || 'danger'}
      okLabel={state.okLabel}
      cancelLabel={state.cancelLabel}
      okClass={state.okClass}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { ask, dialog };
}