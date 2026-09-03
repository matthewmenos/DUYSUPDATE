import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FiArrowLeft,
  FiHeart,
  FiMessageCircle,
  FiRepeat,
  FiSend
} from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import useAuthStore from '../stores/authStore';

const PLACEHOLDER = 'https://via.placeholder.com/48';

/**
 * PostDetailPage â€” single post with full context, reply thread and composer.
 *  - GET /posts/:postId returns { ...post, media, comments, liked }
 *  - POST /posts/:postId/comment adds a reply
 *  - POST|DELETE /posts/:postId/like toggles like
 *  - POST /posts/:postId/repost shares
 */
function PostDetailPage() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const { data: post, isLoading, isError, error } = useQuery({
    queryKey: ['post', postId],
    queryFn: async () => {
      const res = await api.get(`/posts/${postId}`);
      return res.data;
    }
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['post', postId] });

  const handleLike = async () => {
    if (!post) return;
    try {
      if (post.liked) {
        await api.delete(`/posts/${postId}/like`);
      } else {
        await api.post(`/posts/${postId}/like`);
      }
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to update like');
    }
  };

  const handleRepost = async () => {
    try {
      await api.post(`/posts/${postId}/repost`);
      toast.success('Reposted');
      refresh();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to repost');
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.post(`/posts/${postId}/comment`, { body });
      setBody('');
      toast.success('Reply posted');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to post reply');
    } finally {
      setSending(false);
    }
  };  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto border-l border-r border-gray-700 flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="max-w-2xl mx-auto border-l border-r border-gray-700 p-16 text-center">
        <h2 className="text-xl font-bold mb-2">Post not found</h2>
        <p className="text-gray-500 mb-4">{error?.message || 'This post no longer exists.'}</p>
        <button onClick={() => navigate('/')} className="text-blue-400 hover:underline">
          Back to feed
        </button>
      </div>
    );
  }

  const isOwn = !!currentUser && post.author_id === currentUser.id;

  return (
    <div className="max-w-2xl mx-auto border-l border-r border-gray-700 min-h-full">
      {/* Header */}
      <div className="sticky top-0 bg-black/80 backdrop-blur border-b border-gray-700 p-3 flex items-center gap-4 z-10">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-full hover:bg-gray-800 transition"
          aria-label="Back to feed"
        >
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-bold">Post</h2>
      </div>

      {/* Post body */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex space-x-4">
          <img
            src={post.avatar_url || PLACEHOLDER}
            alt={post.display_name}
            className="w-12 h-12 rounded-full cursor-pointer"
            onClick={() => navigate(`/profile/${post.username}`)}
          />
          <div className="flex-1">
            <div className="flex items-center">
              <span
                className="font-bold hover:underline cursor-pointer"
                onClick={() => navigate(`/profile/${post.username}`)}
              >
                {post.display_name}
              </span>
              {post.verified_badge && (
                <span className={'ml-1 ' + (post.verified_badge === 'blue' ? 'text-blue-400' : post.verified_badge === 'gold' ? 'text-yellow-500' : 'text-gray-500')}>?</span>
              )}
              <span className="text-gray-500 ml-2">@{post.username}</span>
              <span className="text-gray-500 ml-2">
                · {post.created_at ? formatDistanceToNow(new Date(post.created_at), { addSuffix: true }) : ''}
              </span>
            </div>
            <p className="mt-2 text-white whitespace-pre-wrap text-lg">{post.body}</p>
            {post.media && post.media.length > 0 && (
              <div className="mt-3 rounded-2xl overflow-hidden max-h-96 bg-gray-900">
                {post.media[0].kind === 'image' && (
                  <img src={post.media[0].url} alt="Post media" className="w-full" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Engagement row */}
        <div className="mt-4 flex justify-between text-gray-500 max-w-md text-sm">
          <div className="flex items-center space-x-2 hover:text-blue-400 group cursor-pointer">
            <FiMessageCircle className="w-5 h-5" />
            <span>{post.comments?.length || post.comment_count || 0}</span>
          </div>
          <div className="flex items-center space-x-2 hover:text-green-400 group cursor-pointer" onClick={handleRepost}>
            <FiRepeat className="w-5 h-5" />
            <span>{post.repost_count || 0}</span>
          </div>
          <button onClick={handleLike} className="flex items-center space-x-2 hover:text-red-400 group">
            <FiHeart className={'w-5 h-5 ' + (post.liked ? 'fill-red-400 text-red-400' : '')} />
            <span>{post.like_count || 0}</span>
          </button>
        </div>
      </div>
      {/* Reply composer */}
      <div className="p-4 border-b border-gray-700 flex space-x-3">
        <img
          src={currentUser?.avatar_url || PLACEHOLDER}
          alt="You"
          className="w-10 h-10 rounded-full"
        />
        <form onSubmit={handleComment} className="flex-1 flex items-center">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Post your reply"
            className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !body.trim()}
            className="px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 font-semibold text-sm transition disabled:opacity-50 flex items-center"
          >
            <FiSend className="w-4 h-4 mr-1" /> {sending ? 'Posting...' : 'Reply'}
          </button>
        </form>
      </div>

      {/* Comments */}
      <div>
        {post.comments?.length === 0 && (
          <div className="text-center py-10 text-gray-500">
            <p>No replies yet. Start the conversation!</p>
          </div>
        )}
        {(post.comments || []).map((c) => (
          <div key={c.id} className="p-4 border-b border-gray-700 flex space-x-3">
            <img
              src={c.avatar_url || PLACEHOLDER}
              alt={c.display_name}
              className="w-10 h-10 rounded-full cursor-pointer"
              onClick={() => navigate(`/profile/${c.username}`)}
            />
            <div className="flex-1">
              <div className="flex items-center">
                <span
                  className="font-bold hover:underline cursor-pointer"
                  onClick={() => navigate(`/profile/${c.username}`)}
                >
                  {c.display_name}
                </span>
                {c.verified_badge && (
                  <span className={'ml-1 ' + (c.verified_badge === 'blue' ? 'text-blue-400' : c.verified_badge === 'gold' ? 'text-yellow-500' : 'text-gray-500')}>?</span>
                )}
                <span className="text-gray-500 ml-2 text-sm">
                  @{c.username} · {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true }) : ''}
                </span>
              </div>
              <p className="mt-1 text-white whitespace-pre-wrap">{c.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Reply thread container for nested comments (flat list for now) */}
      {isOwn && post.comments?.length > 0 && (
        <div className="p-3 text-center text-xs text-gray-600">
          You can like or delete comments from the post endpoint.
        </div>
      )}
    </div>
  );
}

export default PostDetailPage;
