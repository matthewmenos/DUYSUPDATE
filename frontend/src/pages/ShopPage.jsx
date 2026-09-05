import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FiPlus, FiDelete, FiDownload, FiCheck, FiX } from 'react-icons/fi';
import Avatar from '../components/Avatar';
import Badge from '../components/Badge';
import api from '../api/client';
import getErrorMessage from '../utils/errors';

const fmtDuys = (n) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(Number(n ?? 0));

/**
 * Creator shop — verified users sell downloadable files for DUYS.
 * Ported from legacy `DUYS/duys/templates/shop/seller.html`.
 */
function ShopPage() {
  const { username } = useParams();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priceDuys: '0' });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['shop', username],
    queryFn: async () => (await api.get(`/wallet/shop/${username}`)).data,
    enabled: !!username,
  });

  const isSelf = data?.seller?.isSelf;

  const buyMutation = useMutation({
    mutationFn: async (listingId) => (await api.post(`/wallet/shop/purchases/${listingId}`)).data,
    onSuccess: (res, listingId) => {
      if (res.alreadyOwned) {
        toast('You already own this item');
      } else {
        toast.success('Purchased! Enjoy your download.');
        window.open(res.fileUrl, '_blank', 'noopener');
      }
      queryClient.invalidateQueries(['shop', username]);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const toggleMutation = useMutation({
    mutationFn: async (listingId) => (await api.post(`/wallet/shop/listings/${listingId}/toggle`)).data,
    onSuccess: () => {
      toast.success('Listing updated');
      queryClient.invalidateQueries(['shop', username]);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (listingId) => (await api.delete(`/wallet/shop/listings/${listingId}`)).data,
    onSuccess: () => {
      toast.success('Listing deleted');
      queryClient.invalidateQueries(['shop', username]);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  // Upload file helper — uses the backend /upload endpoint.
  const uploadFile = async () => {
    if (!file) return { key: '', url: '' };
    const fd = new FormData();
    fd.append('file', file);
    fd.append('purpose', 'shop');
    const res = await api.post('/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return { key: res.data.key, url: res.data.url };
  };

  const handleCreate = async () => {
    if (!form.title.trim()) return toast('Give your item a title');
    if (!file) return toast('Choose a file to sell');
    setUploading(true);
    try {
      const { key, url } = await uploadFile();
      await api.post('/wallet/shop/listings', {
        title: form.title.trim(),
        description: form.description.trim(),
        priceDuys: Number(form.priceDuys) || 0,
        fileKey: key,
        fileUrl: url,
        fileName: file.name
      });
      toast.success('Listing created!');
      setShowCreate(false);
      setForm({ title: '', description: '', priceDuys: '0' });
      setFile(null);
      queryClient.invalidateQueries(['shop', username]);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-gray-800/40 animate-pulse" />
        ))}
      </div>
    );
  }

  const listings = data?.listings || [];
  const purchasedIds = data?.purchasedIds || [];
  const seller = data?.seller;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="rounded-2xl p-5 bg-gradient-to-br from-blue-600/20 via-blue-800/10 to-transparent border border-blue-500/20 flex items-center gap-4">
        <Avatar src={seller?.avatar_url} name={seller?.display_name || username} size={56} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black flex items-center gap-2 truncate">
            {seller?.display_name || username}'s Shop
            {seller?.verified_badge && <Badge type={seller.verified_badge} />}
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {listings.length} item{listings.length === 1 ? '' : 's'}
          </p>
        </div>
        {isSelf && seller?.verified_badge && (
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition flex items-center gap-1.5"
          >
            <FiPlus /> {showCreate ? 'Close' : 'Add item'}
          </button>
        )}
      </div>

      {isSelf && !seller?.verified_badge && (
        <p className="rounded-xl px-4 py-3 bg-gray-800/30 border border-gray-700/60 text-sm text-gray-400">
          Only verified creators can open a shop. Apply for verification from your settings.
        </p>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-2xl p-5 bg-gray-800/30 border border-gray-700/60 space-y-3">
          <h3 className="font-bold">Add a new item</h3>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Title"
            maxLength={128}
            className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            maxLength={1000}
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm resize-none"
          />
          <div className="flex gap-2 items-center">
            <label className="flex-1 px-4 py-2.5 rounded-xl bg-gray-700/60 hover:bg-gray-600/60 text-sm font-semibold cursor-pointer flex items-center gap-2 justify-center">
              <FiPlus /> {file ? file.name : 'Choose file'}
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={form.priceDuys}
                onChange={(e) => setForm({ ...form, priceDuys: e.target.value })}
                placeholder="0"
                min="0"
                step="0.0001"
                className="w-28 px-3 py-2.5 rounded-xl bg-black/40 border border-gray-700 focus:border-blue-500 outline-none text-sm"
              />
              <span className="text-xs text-gray-400 whitespace-nowrap">DUYS</span>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={uploading}
            className="w-full px-4 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : 'Create listing'}
          </button>
        </div>
      )}
{/* Listings */}
      {listings.length ? (
        <div className="grid gap-3">
          {listings.map((item) => {
            const owned = purchasedIds.includes(item.id);
            return (
              <div
                key={item.id}
                className={`rounded-2xl p-4 bg-gray-800/30 border transition ${
                  item.active ? 'border-gray-700/60' : 'border-gray-700/40 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{item.title}</div>
                    {item.description && (
                      <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                  {!item.active && isSelf && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 uppercase whitespace-nowrap">
                      Inactive
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm font-bold text-amber-300">
                  {item.price_duys > 0 ? `${fmtDuys(item.price_duys)} DUYS` : 'Free'}
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {isSelf ? (
                    <>
                      <button
                        onClick={() => toggleMutation.mutate(item.id)}
                        disabled={toggleMutation.isPending}
                        className="px-3 py-1.5 rounded-full bg-gray-700/70 hover:bg-gray-600 text-xs font-semibold transition"
                      >
                        {item.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Delete this listing?')) deleteMutation.mutate(item.id);
                        }}
                        disabled={deleteMutation.isPending}
                        className="px-3 py-1.5 rounded-full bg-rose-600/80 hover:bg-rose-600 text-xs font-semibold transition flex items-center gap-1"
                      >
                        <FiDelete /> Delete
                      </button>
                      {item.active && (
                        <a
                          href={item.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-full bg-gray-700/70 hover:bg-gray-600 text-xs font-semibold transition flex items-center gap-1"
                        >
                          <FiDownload /> Preview
                        </a>
                      )}
                    </>
                  ) : owned ? (
                    <>
                      <a
                        href={item.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-xs font-semibold transition flex items-center gap-1"
                      >
                        <FiDownload /> Download
                      </a>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center gap-1">
                        <FiCheck /> Owned
                      </span>
                    </>
                  ) : (
                    <button
                      onClick={() => buyMutation.mutate(item.id)}
                      disabled={buyMutation.isPending}
                      className="px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-xs font-semibold transition disabled:opacity-50"
                    >
                      {item.price_duys > 0 ? `Buy · ${fmtDuys(item.price_duys)} DUYS` : 'Get Free'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-10 text-center text-gray-500">
          <FiX className="mx-auto mb-2 text-4xl text-gray-600" />
          <h3 className="font-bold text-gray-300">
            {isSelf ? 'No listings yet. Create one above!' : 'No items in shop.'}
          </h3>
        </div>
      )}
    </div>
  );
}

export default ShopPage;