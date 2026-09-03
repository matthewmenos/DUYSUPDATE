import { io } from 'socket.io-client';

/**
 * Singleton Socket.io connection for notifications.
 * Because the sidebar (always mounted) and the NotificationsPage both need
 * real-time notification events, we share a single connection instead of
 * opening a new one per component.
 */

let socket = null;
const listeners = new Set();

function ensureSocket(token) {
  if (socket && socket.connected) return socket;
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
    auth: { token }
  });

  socket.on('notification:new', (notification) => {
    listeners.forEach((fn) => fn(notification));
  });
  socket.on('notification:read', (notification) => {
    listeners.forEach((fn) => fn(notification));
  });
  socket.on('notification:deleted', ({ id }) => {
    listeners.forEach((fn) => fn({ deletedId: id }));
  });

  return socket;
}

/**
 * Subscribe to real-time notification events.
 * Returns an unsubscribe function.
 */
export function onNotification(listener) {
  listeners.add(listener);
  const token = localStorage.getItem('accessToken');
  ensureSocket(token);
  return () => listeners.delete(listener);
}

/**
 * Get the shared socket (lazily connecting if needed).
 */
export function getNotificationSocket() {
  const token = localStorage.getItem('accessToken');
  return ensureSocket(token);
}

export default { onNotification, getNotificationSocket };