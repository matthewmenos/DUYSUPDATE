import React from 'react';

/**
 * LinkPreviewCard — Open Graph preview card for a post's first URL.
 */
function LinkPreviewCard({ preview }) {
  if (!preview) return null;
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener nofollow"
      onClick={(e) => e.stopPropagation()}
      className="mt-3 block rounded-2xl border border-gray-700 overflow-hidden hover:border-gray-500 transition bg-gray-900/50"
    >
      {preview.image && (
        <div className="max-h-48 overflow-hidden bg-gray-800">
          <img src={preview.image} alt="" className="w-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="px-4 py-3">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{preview.domain}</p>
        {preview.title && <p className="font-semibold text-sm text-white mt-0.5 line-clamp-2">{preview.title}</p>}
        {preview.description && <p className="text-sm text-gray-400 mt-1 line-clamp-2">{preview.description}</p>}
      </div>
    </a>
  );
}

export default LinkPreviewCard;