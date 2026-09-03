import React from 'react';
import { Link } from 'react-router-dom';
import { FiHome } from 'react-icons/fi';

/** 404 — shown for any unmatched route. */
function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-blue-400 mb-3">
        404
      </h1>
      <h2 className="text-xl font-semibold mb-2">Page not found</h2>
      <p className="text-gray-400 mb-6 max-w-sm">
        The page you are looking for doesn't exist or may have been moved.
      </p>
      <Link
        to="/"
        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 text-white font-semibold text-sm hover:opacity-90 transition"
      >
        <FiHome /> Back to home
      </Link>
    </div>
  );
}

export default NotFoundPage;