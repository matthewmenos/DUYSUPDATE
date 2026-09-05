import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import Icon from './icons';
import PollWidget from './PollWidget';
import LinkPreviewCard from './LinkPreviewCard';
import ReportModal from './ReportModal';
import { renderLinkified } from '../utils/linkify';

const REPORT_REASONS = ['spam', 'harassment', 'hate', 'misinformation', 'violence', 'other'];

/**
 * Post — full card (legacy parity):
 *  - linkified body (@mentions / #hashtags / URLs)
 *  - kind tags (Article / Poll / Promoted), pinned badge
 *  - exclusive paid-unlock gate + unlock flow
 *  - media, polls, link previews, sponsored CTA
 *  - actions: reply / repost / like / views / share, plus a menu with
 *    pin (own) + report (any).
 */
function Post({ post: initialPost, onLikeChange }) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [post, setPost] = useState(initialPost);
  const [liked, setLiked] = useState(post.liked || false);
  const [likeCount, setLikeCount] = useState(post.like_count || 0);
  const [pollOptions, setPollOptions] = useState(post.poll_options || []);
  const [myVote, setMyVote] = useState(post.my_vote || null);
  const [unlocked, setUnlocked] = useState(post.unlocked ?? !post.is_exclusive);
  const [isLoading, setIsLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const isOwn = !!currentUser && post.author_id === currentUser.id;

  const goDetail = () => navigate(`/posts/${post.id}`);

  const handleLike = async (e) => {
    e.stopPropagation();
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (liked) {
        await api.delete(`/posts/${post.id}/like`);
        setLikeCount((c) => Math.max(0, c - 1));
        setLiked(false);
      } else {
        await api.post(`/posts/${post.id}/like`);
        setLikeCount((c) => c + 1);
        setLiked(true);
      }
    } catch (error) {
      toast.error('Failed to like post');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (optionId) => {
    try {
      const res = await api.post(`/posts/${post.id}/vote`, { optionId });
      setPollOptions(res.data.poll_options);
      setMyVote(optionId);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to vote');
    }
  };

  const handleUnlock = async (e) => {
    e.stopPropagation();
    try {
      const res = await api.post(`/posts/${post.id}/unlock`);
      const p = res.data.post || post;
      setUnlocked(true);
      setPost(p);
      if (p.poll_options) setPollOptions(p.poll_options);
      if (p.my_vote) setMyVote(p.my_vote);
      toast.success('Unlocked!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Unable to unlock');
    }
  };

  const handlePin = async (e) => {
    e.stopPropagation();
    try {
      if (post.is_pinned) {
        await api.delete(`/posts/${post.id}/pin`);
        setPost((p) => ({ ...p, is_pinned: false }));
        toast.success('Post unpinned');
      } else {
        await api.post(`/posts/${post.id}/pin`);
        setPost((p) => ({ ...p, is_pinned: true }));
        toast.success('Post pinned to your profile');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update pin');
    } finally {
      setMenuOpen(false);
    }
  };

  const handleShare = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/posts/${post.id}`);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };
const badgeClass = (b) =>
    b === 'blue' ? 'text-blue-400' : b === 'gold' ? 'text-yellow-500' : 'text-gray-400';

  return (
    <article
      className="border-b border-gray-700 p-4 hover:bg-gray-900/50 transition cursor-pointer"
      onClick={goDetail}
    >
      <div className="flex space-x-4">
        {/* Avatar */}
        <img
          src={post.avatar_url || '/avatar-default.svg'}
          alt={post.display_name}
          onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }}
          className="w-12 h-12 rounded-full object-cover shrink-0 cursor-pointer"
        />

        <div className="flex-1 min-w-0">
          {/* Header: name + badges + kind tags + menu */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1 flex-wrap">
              <span
                onClick={(e) => { e.stopPropagation(); navigate(`/profile/${post.username}`); }}
                className="font-bold hover:underline cursor-pointer"
              >
                {post.display_name}
              </span>
              {post.verified_badge && (
                <span className={`text-lg leading-none ${badgeClass(post.verified_badge)}`}>✓</span>
              )}
              <span className="text-gray-500 text-sm">@{post.username}</span>
              <span className="text-gray-600 text-sm">·</span>
              <span className="text-gray-500 text-sm">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </span>
              {post.is_pinned && (
                <span className="inline-flex items-center gap-1 text-xs text-blue-400 font-semibold">
                  <Icon name="pin" size={12} /> Pinned
                </span>
              )}
            </div>

            {/* Kind tags + menu */}
            <div className="flex items-center gap-1 shrink-0">
              {post.kind === 'article' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-xs font-semibold">
                  <Icon name="article" size={11} /> Article
                </span>
              )}
              {post.kind === 'poll' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs font-semibold">
                  <Icon name="poll" size={11} /> Poll
                </span>
              )}
              {post.is_sponsored && post.boost_until && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold">
                  <Icon name="boost" size={11} /> Promoted
                </span>
              )}

              {/* Menu (pin own / report) */}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpen((m) => !m); }}
                  className="w-7 h-7 rounded-full hover:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-200"
                  aria-label="Post menu"
                >
                  <Icon name="more-vertical" size={18} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-8 w-48 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden z-30 py-1">
                    {isOwn && (
                      <button
                        onClick={handlePin}
                        className="w-full px-4 py-2.5 text-sm text-left text-gray-200 hover:bg-gray-800 flex items-center gap-2"
                      >
                        <Icon name="pin" size={15} />
                        {post.is_pinned ? 'Unpin from profile' : 'Pin to profile'}
                      </button>
                    )}
                    {!isOwn && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowReport(true); setMenuOpen(false); }}
                        className="w-full px-4 py-2.5 text-sm text-left text-red-400 hover:bg-gray-800 flex items-center gap-2"
                      >
                        <Icon name="block" size={15} />
                        Report post
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Article title */}
          {post.kind === 'article' && post.title && (
            <h3 className="mt-1.5 text-lg font-bold text-white leading-snug">{post.title}</h3>
          )}

          {/* Exclusive badge */}
          {post.is_exclusive && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-500 text-xs font-semibold">
              <Icon name="star" size={12} />
              Exclusive{Number(post.unlock_price) > 0 && ` · ${post.unlock_price} DUYS`}
            </div>
          )}
{/* Body — linkified; articles render rich HTML */}
          <div className={`mt-2 text-white whitespace-pre-wrap ${post.kind === 'article' ? 'post-article-body' : ''}`}>
            {post.kind === 'article' && (unlocked || !post.is_exclusive)
              ? <ArticleBody html={post.body} />
              : renderLinkified(post.body)}
          </div>

          {post.kind === 'article' && (unlocked || !post.is_exclusive) && (
            <span onClick={(e) => { e.stopPropagation(); }} className="text-blue-400 text-sm font-semibold hover:underline cursor-pointer">
              Read full article →
            </span>
          )}

          {/* Exclusive lock gate */}
          {post.is_exclusive && !unlocked && (
            <div className="mt-3 rounded-2xl border border-gray-700 bg-gray-900/60 p-4 text-center">
              <Icon name="star" size={22} className="mx-auto text-yellow-500 mb-1" />
              <p className="font-bold text-sm text-white">Exclusive Content</p>
              <p className="text-xs text-gray-400 mt-1">
                {Number(post.unlock_price) > 0
                  ? `Unlock for ${post.unlock_price} DUYS`
                  : 'This post is exclusive to subscribers'}
              </p>
              <button
                onClick={handleUnlock}
                className="mt-3 px-5 py-2 rounded-full bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-bold transition"
              >
                Unlock
              </button>
            </div>
          )}

          {/* Media — only when unlocked */}
          {(!post.is_exclusive || unlocked) && post.media && post.media.length > 0 && (
            <div className="mt-3 rounded-2xl overflow-hidden max-h-96">
              {post.media[0].kind === 'image' && (
                <img src={post.media[0].url} alt="Post media" className="w-full" onClick={(e) => e.stopPropagation()} />
              )}
              {post.media[0].kind === 'video' && (
                <video src={post.media[0].url} controls className="w-full max-h-96" onClick={(e) => e.stopPropagation()} />
              )}
            </div>
          )}

          {/* Poll — only when unlocked */}
          {post.kind === 'poll' && (!post.is_exclusive || unlocked) && (
            <div onClick={(e) => e.stopPropagation()}>
              <PollWidget
                postId={post.id}
                options={pollOptions}
                myVote={myVote}
                onVote={handleVote}
                disabled={!!myVote}
              />
            </div>
          )}

          {/* Link preview — inline, non-interactive on card (opens in new tab) */}
          {(!post.is_exclusive || unlocked) && post.link_preview && (
            <div onClick={(e) => e.stopPropagation()}>
              <LinkPreviewCard preview={post.link_preview} />
            </div>
          )}

          {/* Sponsored CTA */}
          {post.is_sponsored && post.boost_until && post.landing_url && (
            <a
              href={post.landing_url}
              target="_blank"
              rel="noopener nofollow sponsored"
              onClick={(e) => e.stopPropagation()}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition"
            >
              {post.cta || 'Learn more'} →
            </a>
          )}
{/* Action bar */}
          <div className="mt-3 flex justify-between text-gray-500 max-w-md text-sm">
            <span
              onClick={(e) => { e.stopPropagation(); navigate(`/posts/${post.id}`); }}
              className="flex items-center space-x-2 hover:text-blue-400 group cursor-pointer"
            >
              <Icon name="comment" size={18} />
              <span>{post.comment_count || ''}</span>
            </span>

            <span
              onClick={(e) => { e.stopPropagation(); navigate(`/posts/${post.id}`); }}
              className="flex items-center space-x-2 hover:text-green-400 group cursor-pointer"
            >
              <Icon name="repost" size={18} />
              <span>{post.repost_count || ''}</span>
            </span>

            <button
              onClick={handleLike}
              disabled={isLoading}
              className={`flex items-center space-x-2 group ${liked ? 'text-red-400' : 'hover:text-red-400'}`}
            >
              <Icon name="heart" size={18} className={liked ? 'text-red-400' : 'group-hover:text-red-400'} />
              <span>{likeCount}</span>
            </button>

            <span className="flex items-center space-x-2" title="Views">
              <Icon name="chart" size={18} />
              <span>{post.view_count || ''}</span>
            </span>

            <button onClick={handleShare} className="flex items-center space-x-2 hover:text-blue-400 group">
              <Icon name="share-out" size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Report modal */}
      {showReport && (
        <ReportModal
          entityType="post"
          entityId={post.id}
          onClose={() => setShowReport(false)}
        />
      )}
    </article>
  );
}

/** Render a sanitized article body (backend sanitizes on write). */
function ArticleBody({ html }) {
  return <div className="post-article-rich" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default Post;