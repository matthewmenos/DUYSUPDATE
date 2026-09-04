import React, { useState } from 'react';
import { FiPlus, FiEdit3, FiVideo } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import CreatePostModal from './CreatePostModal';

/**
 * CreateMenu — floating "+" action button (bottom-right) that opens a small
 * menu for creating a new post or starting a live stream.
 */
function CreateMenu() {
  const [open, setOpen] = useState(false);
  const [showPost, setShowPost] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Create"
        className="md:hidden fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 text-white shadow-lg shadow-blue-500/30 flex items-center justify-center hover:scale-105 transition"
      >
        <FiPlus className={`w-6 h-6 transition-transform ${open ? 'rotate-45' : ''}`} />
      </button>

      {/* Desktop create button in feed is handled inline; this menu is mobile-only */}
      {open && (
        <>
          <div className="md:hidden fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="md:hidden fixed bottom-36 right-4 z-30 flex flex-col items-end gap-3">
            <button
              onClick={() => { setOpen(false); navigate('/live'); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gray-800 border border-gray-700 text-sm font-medium hover:bg-gray-700 transition"
            >
              <FiVideo className="w-4 h-4" /> Go Live
            </button>
            <button
              onClick={() => { setOpen(false); setShowPost(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gray-800 border border-gray-700 text-sm font-medium hover:bg-gray-700 transition"
            >
              <FiEdit3 className="w-4 h-4" /> New Post
            </button>
          </div>
        </>
      )}

      {showPost && (
        <CreatePostModal onClose={() => setShowPost(false)} onCreated={() => window.location.reload()} />
      )}
    </>
  );
}

export default CreateMenu;