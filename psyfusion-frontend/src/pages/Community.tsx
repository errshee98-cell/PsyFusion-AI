import { useEffect, useState } from 'react';
import SoftCard from '../components/SoftCard';
import Button from '../components/Button';
import { listPosts, createPost } from '../api/community';
import type { CommunityPost } from '../api/community';
import { ApiError } from '../api/client';
import './Community.css';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Community() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; crisis: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listPosts();
        if (!cancelled) setPosts(data.posts);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load the community feed.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    const body = draft.trim();
    if (!body || submitting) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const response = await createPost(body);

      if (response.status === 'visible') {
        setPosts((prev) => [response.post, ...prev]);
        setDraft('');
      } else {
        // Flagged by crisis detection: never shown in the feed, the poster
        // gets the resources message instead of a published post.
        setNotice({ text: response.message, crisis: true });
        setDraft('');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not publish that post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="community">
      <header className="community__header">
        <h1 className="community__title">Community</h1>
        <p className="community__subtitle">Anonymous. Posts are reviewed if they mention crisis.</p>
      </header>

      <SoftCard radius="lg" tint="violet" className="community__composer">
        <textarea
          className="community__textarea"
          placeholder="Share what's on your mind, anonymously…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={submitting}
        />
        <div className="community__composer-footer">
          <span className="community__char-count">{draft.length}/2000</span>
          <Button onClick={submit} disabled={!draft.trim() || submitting}>
            {submitting ? 'Posting…' : 'Post anonymously'}
          </Button>
        </div>
        {notice && (
          <p className={`community__notice${notice.crisis ? ' community__notice--crisis' : ''}`}>{notice.text}</p>
        )}
        {error && <p className="community__error">{error}</p>}
      </SoftCard>

      <div className="community__feed">
        {loading && <p className="community__empty">Loading the feed…</p>}
        {!loading && posts.length === 0 && (
          <p className="community__empty">No posts yet — be the first to share something.</p>
        )}
        {posts.map((post) => (
          <SoftCard key={post.id} radius="md" tint="surface" className="community__post">
            <div className="community__post-meta">
              <span className="community__handle">{post.authorAnonymousHandle}</span>
              <span className="community__dot">·</span>
              <span className="community__time">{timeAgo(post.createdAt)}</span>
            </div>
            <p className="community__body">{post.body}</p>
            <button className="community__reply-btn">{post.replyCount} replies</button>
          </SoftCard>
        ))}
      </div>
    </div>
  );
}
