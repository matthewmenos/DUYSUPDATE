import React from 'react';

/**
 * Extract a guaranteed-string, human-readable message from any thrown error
 * (axios errors, API error objects, plain strings, Error instances).
 * Never return an object — react-hot-toast crashes React when asked to
 * render a non-renderable child ("Objects are not valid as a React child").
 */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;

  if (typeof error === 'string') return error;

  if (typeof error.message === 'string' && error.message) {
    // Network failures surface as raw JS messages; make them friendlier.
    if (/Network Error/i.test(error.message)) return 'Cannot reach the server. Check your connection and try again.';
    return error.message;
  }

  const data = error.response?.data;
  if (data) {
    if (typeof data.error === 'string' && data.error) return data.error;
    if (typeof data.message === 'string' && data.message) return data.message;
  }

  return fallback;
}

export default getErrorMessage;