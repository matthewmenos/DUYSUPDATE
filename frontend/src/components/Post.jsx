import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiHeart, FiMessageCircle, FiRepeat, FiShare } from 'react-icons/fi';
import { formatDistanceToNow } from 'date-fns';
import api from '../api/client';
import toast from 'react-hot-toast';

function Post({ post, onLikeChange }) {
  const [liked, setLiked] = useState(post.liked || false);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isLoading, setIsLoading] = useState(false);

  const handleLike = async () => {
    setIsLoading(true);
    try {
      if (liked) {
        await api.delete(`/posts/${post.id}/like`);
        setLikeCount(likeCount - 1);
        setLiked(false);
      } else {
        await api.post(`/posts/${post.id}/like`);
        setLikeCount(likeCount + 1);
        setLiked(true);
      }
    } catch (error) {
      toast.error('Failed to like post');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border-b border-gray-700 p-4 hover:bg-gray-900/50 transition cursor-pointer">
      <div className="flex space-x-4">
        {/* Avatar */}
        <img
          src={post.avatar_url || 'https://via.placeholder.com/48'}
          alt={post.display_name}
          className="w-12 h-12 rounded-full"
        />

        <div className="flex-1">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <Link
                to={`/profile/${post.username}`}
                className="font-bold hover:underline"
              >
                {post.display_name}
              </Link>
              <span className="text-gray-500 ml-2">@{post.username}</span>
              {post.verified_badge && (
                <span className={`ml-1 text-lg ${
                  post.verified_badge === 'blue' ? 'text-blue-400' :
                  post.verified_badge === 'gold' ? 'text-yellow-500' :
                  'text-gray-500'
                }`}>
                  ✓
                </span>
              )}
            </div>
            <span className="text-gray-500 text-sm">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </span>
          </div>

          {/* Content */}
          <Link to={`/posts/${post.id}`} className="mt-2 block">
            <p className="text-white whitespace-pre-wrap">{post.body}</p>
            {post.media && post.media.length > 0 && (
              <div className="mt-3 rounded-2xl overflow-hidden max-h-96">
                {post.media[0].kind === 'image' && (
                  <img src={post.media[0].url} alt="Post media" className="w-full" />
                )}
              </div>
            )}
          </Link>

          {/* Engagement */}
          <div className="mt-3 flex justify-between text-gray-500 max-w-md text-sm">
            <div className="flex items-center space-x-2 hover:text-blue-400 group cursor-pointer">
              <FiMessageCircle className="w-4 h-4 group-hover:bg-blue-400/20 group-hover:rounded-full group-hover:p-2 group-hover:w-8 group-hover:h-8" />
              <span>{post.comment_count}</span>
            </div>

            <div className="flex items-center space-x-2 hover:text-green-400 group cursor-pointer">
              <FiRepeat className="w-4 h-4 group-hover:bg-green-400/20 group-hover:rounded-full group-hover:p-2 group-hover:w-8 group-hover:h-8" />
              <span>{post.repost_count}</span>
            </div>

            <button
              onClick={handleLike}
              disabled={isLoading}
              className="flex items-center space-x-2 hover:text-red-400 group"
            >
              <FiHeart
                className={`w-4 h-4 group-hover:bg-red-400/20 group-hover:rounded-full group-hover:p-2 group-hover:w-8 group-hover:h-8 transition ${
                  liked ? 'fill-red-400 text-red-400' : ''
                }`}
              />
              <span>{likeCount}</span>
            </button>

            <div className="flex items-center space-x-2 hover:text-blue-400 group cursor-pointer">
              <FiShare className="w-4 h-4 group-hover:bg-blue-400/20 group-hover:rounded-full group-hover:p-2 group-hover:w-8 group-hover:h-8" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Post;
