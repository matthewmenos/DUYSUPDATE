import React, { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FiArrowLeft,
  FiCalendar,
  FiUpload,
  FiX,
  FiExternalLink
} from 'react-icons/fi';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../api/client';
import useAuthStore from '../stores/authStore';
import Post from '../components/Post';

const PLACEHOLDER = 'https://via.placeholder.com/150';

/**
 * ProfilePage â€” public + own profile.
 *  - Banner, avatar, name, username, bio, location, website, joined date.
 *  - Follow / unfollow button (POST|DELETE /users/:id/follow).
 *  - Tabs: Posts, Media (backed by /feed/user/:id; Replies/Likes need a
 *    dedicated backend endpoint that does not exist yet).
 *  - Edit profile modal (avatar upload via /posts/media, then PATCH /users/me).
 */
function ProfilePage() {
  const { username } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [activeTab, setActiveTab] = useState('posts');
  const [editing, setEditing] = useState(false);
  const [following, setFollowing] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', username],
    queryFn: async () => {
      const res = await api.get(`/users/by-username/${username}`);
      return res.data;
    }
  });

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['profile-posts', profile?.id],
    queryFn: async () => {
      const res = await api.get(`/feed/user/${profile.id}`);
      return res.data.posts;
    },
    enabled: !!profile?.id
  });

  const isOwn = !!profile && !!currentUser && profile.id === currentUser.id;

  const handleFollow = async () => {
    setFollowing(true);
    try {
      if (profile.isFollowing) {
        await api.delete(`/users/${profile.id}/follow`);
      } else {
        await api.post(`/users/${profile.id}/follow`);
      }
      toast.success(profile.isFollowing ? 'Unfollowed' : 'Following');
      queryClient.invalidateQueries({ queryKey: ['profile', username] });
    } catch (e) {
      toast.error(e.response?.data?.error || 'Something went wrong');
    } finally {
      setFollowing(false);
    }
  };

  let visiblePosts = posts;
  if (activeTab === 'media') {
    visiblePosts = posts.filter((p) => p.kind === 'image' || p.kind === 'video');
  }

  if (profileLoading) {
    return (
      <div className="max-w-2xl mx-auto border-l border-r border-gray-700 flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto border-l border-r border-gray-700 p-16 text-center text-gray-500">
        <h2 className="text-xl font-bold mb-2">Profile not found</h2>
        <p className="mb-4">This user may not exist or has been banned.</p>
        <button
          onClick={() => navigate('/')}
          className="text-blue-400 hover:underline"
        >
          Back to feed
        </button>
      </div>
    );
  }const TABS = [
    { key: 'posts', label: 'Posts' },
    { key: 'replies', label: 'Replies' },
    { key: 'likes', label: 'Likes' },
    { key: 'media', label: 'Media' }
  ];

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
        <div>
          <h2 className="font-bold leading-tight">{profile.display_name}</h2>
          <p className="text-xs text-gray-500">{posts.length} posts</p>
        </div>
      </div>

      {/* Banner */}
      <div className="h-40 bg-gradient-to-r from-blue-700 to-blue-500">
        {profile.banner_url && (
          <img src={profile.banner_url} alt="Banner" className="w-full h-full object-cover" />
        )}
      </div>

      {/* Profile row */}
      <div className="px-4">
        <div className="flex justify-between items-start -mt-10">
          <div className="w-24 h-24 rounded-full border-4 border-black overflow-hidden bg-gray-800">
            <img
              src={profile.avatar_url || PLACEHOLDER}
              alt={profile.display_name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="mt-16">
            {isOwn ? (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-1.5 rounded-full border border-gray-600 font-semibold text-sm hover:bg-gray-800 transition"
              >
                Edit profile
              </button>
            ) : (
              <button
                onClick={handleFollow}
                disabled={following}
                className={`px-4 py-1.5 rounded-full font-semibold text-sm transition disabled:opacity-50 ${
                  profile.isFollowing
                    ? 'border border-gray-600 hover:bg-gray-800'
                    : 'bg-white text-black hover:bg-gray-200'
                }`}
              >
                {profile.isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>
        {/* Name / meta */}
        <div className="mt-3">
          <h2 className="text-xl font-bold flex items-center gap-1">
            {profile.display_name}
            {profile.verified_badge && (
              <span className={'text-' + (profile.verified_badge === 'blue' ? 'blue-400' : profile.verified_badge === 'gold' ? 'yellow-500' : 'gray-500')}>?</span>
            )}
          </h2>
          <p className="text-gray-500">@{profile.username}</p>

          {profile.bio && <p className="mt-3 text-white whitespace-pre-wrap">{profile.bio}</p>}

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-gray-500 text-sm">
            {profile.location && <span>?? {profile.location}</span>}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-400 hover:underline"
              >
                <FiExternalLink className="w-3.5 h-3.5" /> {profile.website}
              </a>
            )}
            <span className="flex items-center gap-1">
              <FiCalendar className="w-3.5 h-3.5" />
              Joined {profile.created_at ? format(new Date(profile.created_at), 'MMMM yyyy') : ''}
            </span>
          </div>

          <div className="mt-3 flex gap-5 text-sm">
            <span>
              <span className="font-bold">{profile.following_count || 0}</span>{' '}
              <span className="text-gray-500">Following</span>
            </span>
            <span>
              <span className="font-bold">{profile.followers_count || 0}</span>{' '}
              <span className="text-gray-500">Followers</span>
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex border-b border-gray-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={'flex-1 py-3 font-semibold border-b-2 transition ' + (activeTab === t.key ? 'border-blue-400 text-white' : 'border-transparent text-gray-500 hover:text-gray-300')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {/* Content */}
      <div>
        {activeTab === 'replies' && (
          <div className="text-center py-12 text-gray-500">
            <p>Replies are not available yet on the API.</p>
          </div>
        )}
        {activeTab === 'likes' && (
          <div className="text-center py-12 text-gray-500">
            <p>Likes are not available yet on the API.</p>
          </div>
        )}
        {(activeTab === 'posts' || activeTab === 'media') && (
          postsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
          ) : visiblePosts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>{activeTab === 'media' ? 'No media posts yet.' : 'No posts yet.'}</p>
            </div>
          ) : (
            visiblePosts.map((post) => <Post key={post.id} post={post} />)
          )
        )}
      </div>

      {editing && (
        <EditProfileModal
          profile={profile}
          setUser={setUser}
          onClose={() => setEditing(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: 'profile' });
            queryClient.invalidateQueries({ queryKey: 'profile-posts' });
          }}
        />
      )}
    </div>
  );
}
/**
 * Edit profile modal — avatar upload + editable fields via PATCH /users/me.
 */
function EditProfileModal({ profile, setUser, onClose, onSaved }) {
  const [displayName, setDisplayName] = useState(profile.display_name || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [location, setLocation] = useState(profile.location || '');
  const [website, setWebsite] = useState(profile.website || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('media', file);
      const uploadRes = await api.post('/posts/media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAvatarUrl(uploadRes.data.url);
      toast.success('Avatar uploaded');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.patch('/users/me', {
        displayName,
        bio,
        location,
        website,
        avatarUrl
      });
      setUser(updated.data);
      toast.success('Profile updated');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Edit profile</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-800"><FiX className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-800">
              <img src={avatarUrl || PLACEHOLDER} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-1.5 rounded-full border border-gray-600 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : (
                  <span className="flex items-center gap-1"><FiUpload className="w-4 h-4" /> Change avatar</span>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Website</label>
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="w-full bg-gray-800 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 font-semibold transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ProfilePage;

// Named alias so both import styles resolve predictably.
export { ProfilePage };
