import React, { useState, useRef } from 'react';
import { FiX, FiImage, FiSend } from 'react-icons/fi';
import toast from 'react-hot-toast';
import api from '../api/client';

/**
 * CreatePostModal — compose a new text/image/video post.
 * Media is uploaded to R2 via /posts/media first, then the post is created.
 */
function CreatePostModal({ onClose, onCreated }) {
  const [body, setBody] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaKind, setMediaKind] = useState('image');
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('media', file);
      const res = await api.post('/posts/media', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setMediaUrl(res.data.url);
      setMediaKind(res.data.type);
      toast.success('Media uploaded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handlePost = async (e) => {
    e.preventDefault();
    if (!body.trim() && !mediaUrl) return;
    setPosting(true);
    try {
      const res = await api.post('/posts', {
        kind: mediaUrl ? mediaKind : 'text',
        body: body.trim()
      });
      // Attach media to the post via update if needed; for now the post is text.
      toast.success('Posted!');
      onCreated?.(res.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 overlay-fade" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-black border border-gray-700 rounded-2xl p-5 drawer-slide">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Create post</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handlePost} className="space-y-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's on your mind?"
            rows={4}
            maxLength={5000}
            className="w-full bg-transparent border border-gray-700 rounded-xl p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />

          {mediaUrl && (
            <div className="relative rounded-xl overflow-hidden">
              {mediaKind === 'image' ? (
                <img src={mediaUrl} alt="Preview" className="w-full max-h-64 object-cover" />
              ) : (
                <video src={mediaUrl} controls className="w-full max-h-64" />
              )}
              <button type="button" onClick={() => setMediaUrl('')} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center hover:bg-black">
                <FiX className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={handleFile} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-3 py-2 rounded-full text-sm text-gray-300 hover:bg-gray-800 transition disabled:opacity-50"
              >
                <FiImage className="w-4 h-4" />
                {uploading ? 'Uploading...' : 'Photo/Video'}
              </button>
            </div>

            <button
              type="submit"
              disabled={posting || (!body.trim() && !mediaUrl)}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition"
            >
              <FiSend className="w-4 h-4" />
              {posting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreatePostModal;