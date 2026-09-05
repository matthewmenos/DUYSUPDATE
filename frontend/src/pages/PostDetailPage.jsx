import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiArrowLeft, FiHeart, FiMessageCircle, FiRepeat, FiSend } from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import Icon from '../components/icons';
import PollWidget from '../components/PollWidget';
import LinkPreviewCard from '../components/LinkPreviewCard';
import ReportModal from '../components/ReportModal';
import { renderLinkified } from '../utils/linkify';

const PLACEHOLDER = '/avatar-default.svg';

/**
 * PostDetailPage — single post with full context:
 *  - records a deduped view (POST /posts/:id/view) on mount
 *  - polls, exclusive unlock, link previews, reports, pinning
 *  - reply thread + composer
 */
function PostDetailPage() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [pollOptions, setPollOptions] = useState([]);
  const [myVote, setMyVote] = useState(null);
  const [showReport, setShowReport] = useState(false);

  const { data: post, isLoading, isError, error } = useQuery({
    queryKey: ['post', postId],
    queryFn: async () => {
      const res = await api.get(`/posts/${postId}`);
      return res.data;
    },
    onSuccess: (p) => {
      setPollOptions(p.poll_options || []);
      setMyVote(p.my_vote || null);
    }
  });

  // Record a deduped view (best-effort).
  useEffect(() => {
    if (postId) api.post(`/posts/${postId}/view`).catch(() => {});
  }, [postId]);

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

  const handleVote = async (optionId) => {
    try {
      const res = await api.post(`/posts/${postId}/vote`, { optionId });
      setPollOptions(res.data.poll_options);
      setMyVote(optionId);
      toast.success('Vote recorded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to vote');
    }
  };

  const handleUnlock = async () => {
    try {
      const res = await api.post(`/posts/${postId}/unlock`);
      toast.success('Unlocked!');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || err.response?.data?.error || 'Unable to unlock');
    }
  };

  const handlePin = async () => {
    try {
      if (post.is_pinned) {
        await api.delete(`/posts/${postId}/pin`);
        toast.success('Post unpinned');
      } else {
        await api.post(`/posts/${postId}/pin`);
        toast.success('Post pinned to your profile');
      }
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update pin');
    }
  };

  const handleReport = () => setShowReport(true);

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
  };
if (isLoading) {
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
  const locked = post.is_exclusive && !post.unlocked;
  const badgeClass = (b) =>
    b === 'blue' ? 'text-blue-400' : b === 'gold' ? 'text-yellow-500' : 'text-gray-400';

  return (
    <div className="max-w-2xl mx-auto border-l border-r border-gray-700 min-h-full">
      {/* Header */}
      <div className="sticky top-0 bg-black/80 backdrop-blur border-b border-gray-700 p-3 flex items-center gap-4 z-10">
        <button onClick={() => navigate(-1)} className="w-8 h-8 rounded-full hover:bg-gray-800 flex items-center justify-center">
          <FiArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="font-bold leading-tight">Post</h2>
          <p className="text-xs text-gray-500">{post.view_count} views</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {post.is_pinned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-semibold">
              <Icon name="pin" size={11} /> Pinned
            </span>
          )}
          {!isOwn && (
            <button onClick={handleReport} className="w-8 h-8 rounded-full hover:bg-gray-800 text-gray-500 hover:text-red-400 flex items-center justify-center" title="Report">
              <Icon name="block" size={18} />
            </button>
          )}
          {isOwn && (
            <button onClick={handlePin} className="px-3 py-1.5 rounded-full border border-gray-700 text-xs text-gray-300 hover:text-white hover:border-blue-500 transition">
              {post.is_pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
        </div>
      </div>

      {/* Post body */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex space-x-3">
          <img
            src={post.avatar_url || PLACEHOLDER}
            alt={post.display_name}
            className="w-12 h-12 rounded-full object-cover cursor-pointer"
            onClick={() => navigate(`/profile/${post.username}`)}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-1">
              <span className="font-bold hover:underline cursor-pointer" onClick={() => navigate(`/profile/${post.username}`)}>
                {post.display_name}
              </span>
              {post.verified_badge && <span className={`${badgeClass(post.verified_badge)}`}>✓</span>}
              <span className="text-gray-500 text-sm">@{post.username}</span>
              <span className="text-gray-600 text-sm">·</span>
              <span className="text-gray-500 text-sm">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </span>
            </div>

            {post.kind === 'article' && post.title && (
              <h1 className="mt-3 text-2xl font-bold text-white leading-tight">{post.title}</h1>
            )}

            {post.kind === 'article' && !locked ? (
              <div className="post-article-rich mt-3" dangerouslySetInnerHTML={{ __html: post.body }} />
            ) : (
              <p className="mt-3 text-white whitespace-pre-wrap">{renderLinkified(post.body)}</p>
            )}

            {!locked && post.media && post.media.length > 0 && (
              <div className="mt-3 rounded-2xl overflow-hidden max-h-[480px]">
                {post.media[0].kind === 'image' && <img src={post.media[0].url} alt="Post media" className="w-full" />}
                {post.media[0].kind === 'video' && <video src={post.media[0].url} controls className="w-full" />}
              </div>
            )}

            {!locked && post.kind === 'poll' && (
              <PollWidget postId={post.id} options={pollOptions} myVote={myVote} onVote={handleVote} disabled={!!myVote} />
            )}

            {!locked && post.link_preview && <LinkPreviewCard preview={post.link_preview} />}
{/* Exclusive lock gate */}
            {locked && (
              <div className="mt-4 rounded-2xl border border-gray-700 bg-gray-900/60 p-6 text-center">
                <Icon name="star" size={26} className="mx-auto text-yellow-500 mb-2" />
                <p className="font-bold text-white">Exclusive Content</p>
                <p className="text-sm text-gray-400 mt-1">
                  {Number(post.unlock_price) > 0 ? `Unlock for ${post.unlock_price} DUYS` : 'This post is exclusive'}
                </p>
                <button
                  onClick={handleUnlock}
                  className="mt-4 px-6 py-2.5 rounded-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold transition"
                >
                  Unlock
                </button>
              </div>
            )}

            {/* Action bar */}
            <div className="mt-4 flex justify-between text-gray-500 max-w-md text-sm">
              <span className="flex items-center space-x-2 hover:text-blue-400 group cursor-pointer" title="Reply">
                <FiMessageCircle className="w-5 h-5" />
                <span>{post.comments?.length || post.comment_count || 0}</span>
              </span>
              <button onClick={handleRepost} className="flex items-center space-x-2 hover:text-green-400 group cursor-pointer" title="Repost">
                <FiRepeat className="w-5 h-5" />
                <span>{post.repost_count || 0}</span>
              </button>
              <button onClick={handleLike} className="flex items-center space-x-2 hover:text-red-400 group" title="Like">
                <FiHeart className={'w-5 h-5 ' + (post.liked ? 'fill-red-400 text-red-400' : '')} />
                <span>{post.like_count || 0}</span>
              </button>
              <span className="flex items-center space-x-2" title="Views">
                <Icon name="chart" size={18} />
                <span>{post.view_count || 0}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
{/* Reply composer */}
      <div className="p-4 border-b border-gray-700 flex space-x-3">
        <img src={currentUser?.avatar_url || PLACEHOLDER} alt="You" className="w-10 h-10 rounded-full" />
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
              className="w-10 h-10 rounded-full object-cover cursor-pointer"
              onClick={() => navigate(`/profile/${c.username}`)}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-1">
                <span className="font-bold hover:underline cursor-pointer" onClick={() => navigate(`/profile/${c.username}`)}>
                  {c.display_name}
                </span>
                {c.verified_badge && <span className={`${badgeClass(c.verified_badge)}`}>✓</span>}
                <span className="text-gray-500 ml-1 text-sm">
                  @{c.username} · {c.created_at ? formatDistanceToNow(new Date(c.created_at), { addSuffix: true }) : ''}
                </span>
              </div>
              <p className="mt-1 text-white whitespace-pre-wrap">{renderLinkified(c.body)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Report modal */}
      {showReport && <ReportModal entityType="post" entityId={post.id} onClose={() => setShowReport(false)} />}
    </div>
  );
}

export default PostDetailPage;