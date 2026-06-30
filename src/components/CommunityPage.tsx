import { useEffect, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import { formatPostTime } from '../utils/formatTime';

const client = generateClient<Schema>();

type CommunityTab = 'social' | 'news';
type PostMode = 'anonymous' | 'username';

interface Post {
  id: string;
  authorUsername: string | null;
  anonymous: boolean;
  title: string;
  content: string;
  likes: number;
  createdAt: string;
  isOwner: boolean;
}

interface NewsItem {
  title: string;
  excerpt: string;
  source: string;
  timeAgo: string;
  accent: string;
}

const STATIC_NEWS: NewsItem[] = [
  {
    title: 'Yes, Allergies Really Are Worse This Year',
    excerpt:
      "Your allergies aren't in your head. Pollen season is now 3 weeks longer than it was five decades ago, researchers say.",
    source: 'News & Observer',
    timeAgo: '7 hours ago',
    accent: '#b7d97e',
  },
  {
    title: 'If You Feel Cranky and Tired, You Might Blame Allergies',
    excerpt:
      'People might not associate brain fog and fatigue with spring allergies, but the link is stronger than most realize.',
    source: 'Northeastern Global News',
    timeAgo: '11 hours ago',
    accent: '#f5c842',
  },
  {
    title: 'New Research Links Gut Microbiome to Food Allergy Severity',
    excerpt:
      'Scientists have found that the diversity of gut bacteria may significantly influence how severely the body reacts to common food allergens.',
    source: 'JACI Research Digest',
    timeAgo: '1 day ago',
    accent: '#78c0d7',
  },
  {
    title: 'FDA Approves First Oral Immunotherapy for Peanut Allergy in Adults',
    excerpt:
      'The approval marks a milestone for adult patients who previously had limited desensitization options beyond strict avoidance.',
    source: 'FDA News',
    timeAgo: '2 days ago',
    accent: '#e8b4b8',
  },
  {
    title: 'Cross-Contamination Labels: What They Actually Mean',
    excerpt:
      '"May contain" and "processed in a facility" warnings carry different risk levels — here\'s how to interpret them safely.',
    source: 'Allergic Living',
    timeAgo: '3 days ago',
    accent: '#a8d8a8',
  },
];

function PostCard({
  post,
  onLike,
  onDelete,
}: {
  post: Post;
  onLike: (id: string, current: number) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="community-post-card">
      <div className="community-post-header">
        <div className="community-avatar">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/>
          </svg>
        </div>
        <div>
          <span className="community-post-author">
            {post.anonymous ? 'Anonymous' : (post.authorUsername ?? 'User')}
          </span>
          <span className="community-post-time">{formatPostTime(post.createdAt)}</span>
        </div>
        {post.isOwner && !confirmDelete && (
          <button
            className="community-delete-btn"
            onClick={() => setConfirmDelete(true)}
            title="Delete post"
          >
            ✕
          </button>
        )}
        {post.isOwner && confirmDelete && (
          <div className="delete-confirm-inline">
            <span>Delete?</span>
            <button className="delete-yes-btn" onClick={() => onDelete(post.id)}>Yes</button>
            <button className="delete-no-btn" onClick={() => setConfirmDelete(false)}>No</button>
          </div>
        )}
      </div>

      {post.title && <p className="community-post-title">{post.title}</p>}
      <p className="community-post-content">{post.content}</p>

      <div className="community-post-actions">
        <button className="community-action-btn" onClick={() => onLike(post.id, post.likes)}>
          👍 <span>{post.likes > 0 ? post.likes : ''}</span>
        </button>
        <button className="community-action-btn">
          💬 <span>Comment</span>
        </button>
        <button className="community-action-btn">
          ↗ Share
        </button>
      </div>
    </div>
  );
}

interface CommunityPageProps {
  currentUserId: string;
  currentUsername?: string;
}

export default function CommunityPage({ currentUserId, currentUsername }: CommunityPageProps) {
  const [tab, setTab] = useState<CommunityTab>('social');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [disclaimerUsername, setDisclaimerUsername] = useState('');
  const [communityUsername, setCommunityUsername] = useState<string | null>(
    currentUsername ?? null,
  );

  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postMode, setPostMode] = useState<PostMode>('username');
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postSaving, setPostSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await client.models.CommunityPost.list();
        if (data) {
          const mapped: Post[] = [...data]
            .sort((a, b) => new Date(b.createdAt ?? '').getTime() - new Date(a.createdAt ?? '').getTime())
            .map(p => {
              const owner = (p as Record<string, unknown>).owner as string | null | undefined;
              const isOwner = typeof owner === 'string' && (
                owner === currentUserId || owner.startsWith(`${currentUserId}::`)
              );
              return {
                id: p.id,
                authorUsername: p.authorUsername ?? null,
                anonymous: p.anonymous ?? false,
                title: p.title,
                content: p.content,
                likes: p.likes ?? 0,
                createdAt: p.createdAt ?? new Date().toISOString(),
                isOwner,
              };
            });
          setPosts(mapped);
        }
      } catch (e) {
        console.warn('CommunityPage: failed to load posts', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUserId]);

  const handleContinueDisclaimer = () => {
    if (!disclaimerUsername.trim()) return;
    setCommunityUsername(disclaimerUsername.trim());
    setShowDisclaimer(false);
    setShowCreatePost(true);
  };

  const handleCreatePost = async () => {
    if (!postContent.trim()) return;
    const isAnon = postMode === 'anonymous';
    if (!isAnon && !communityUsername) {
      setShowDisclaimer(true);
      return;
    }
    setPostSaving(true);
    try {
      const { data: created } = await client.models.CommunityPost.create({
        authorUsername: isAnon ? null : (communityUsername ?? null),
        anonymous: isAnon,
        title: postTitle.trim() || 'Untitled',
        content: postContent.trim(),
        likes: 0,
      });
      if (created) {
        const newPost: Post = {
          id: created.id,
          authorUsername: created.authorUsername ?? null,
          anonymous: created.anonymous ?? false,
          title: created.title,
          content: created.content,
          likes: 0,
          createdAt: created.createdAt ?? new Date().toISOString(),
          isOwner: true,
        };
        setPosts(prev => [newPost, ...prev]);
      }
      setPostTitle('');
      setPostContent('');
      setShowCreatePost(false);
      setSavedMsg('✅ Posted!');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (e) {
      console.error('CommunityPage: failed to create post', e);
      setSavedMsg('❌ Failed to post');
      setTimeout(() => setSavedMsg(''), 3000);
    } finally {
      setPostSaving(false);
    }
  };

  const handleLike = async (id: string, currentLikes: number) => {
    const newLikes = currentLikes + 1;
    setPosts(prev => prev.map(p => p.id === id ? { ...p, likes: newLikes } : p));
    try {
      await client.models.CommunityPost.update({ id, likes: newLikes });
    } catch {
      setPosts(prev => prev.map(p => p.id === id ? { ...p, likes: currentLikes } : p));
    }
  };

  const handleDelete = async (id: string) => {
    setPosts(prev => prev.filter(p => p.id !== id));
    try {
      await client.models.CommunityPost.delete({ id });
    } catch (e) {
      console.error('Failed to delete post', e);
    }
  };

  if (showDisclaimer) {
    return (
      <div className="community-screen">
        <div className="community-top-bar">
          <button className="community-back" onClick={() => setShowDisclaimer(false)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        </div>
        <div className="disclaimer-body">
          <h2 className="disclaimer-title">Disclaimer</h2>
          <p>Always double check information in the Community Forum.</p>
          <p>Any person is free to use the Community Forum. It is meant for opinions and is to be used like a social media app. Not all users are experts.</p>
          <p>To use the Community Forum, you must enter a username. You can change whether or not your posts and comments use this username or your provided name in account settings.</p>
          <p>By entering a username and continuing you agree to Immuny's <strong>Community Terms and Conditions</strong>.</p>
          <input
            type="text"
            value={disclaimerUsername}
            onChange={e => setDisclaimerUsername(e.target.value)}
            placeholder="Enter Username"
            className="disclaimer-username-input"
          />
          <button
            className="disclaimer-continue-btn"
            onClick={handleContinueDisclaimer}
            disabled={!disclaimerUsername.trim()}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  if (showCreatePost) {
    return (
      <div className="community-screen">
        <div className="community-top-bar">
          <button className="community-back" onClick={() => setShowCreatePost(false)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        </div>
        <div className="create-post-body">
          <h2 className="create-post-title">Create a Post</h2>
          <p className="create-post-hint">
            If you stay Anonymous, your username will not show on your post.
          </p>
          <div className="post-mode-row">
            <button
              className={`post-mode-btn ${postMode === 'anonymous' ? 'active' : ''}`}
              onClick={() => setPostMode('anonymous')}
            >
              Anonymous
            </button>
            <button
              className={`post-mode-btn ${postMode === 'username' ? 'active' : ''}`}
              onClick={() => setPostMode('username')}
            >
              Username
            </button>
          </div>
          <input
            type="text"
            value={postTitle}
            onChange={e => setPostTitle(e.target.value)}
            placeholder="Add a title…"
            className="create-post-title-input"
          />
          <textarea
            value={postContent}
            onChange={e => setPostContent(e.target.value)}
            placeholder="Add a description…"
            className="create-post-body-input"
            rows={8}
          />
          <button
            className="create-post-submit"
            onClick={() => void handleCreatePost()}
            disabled={!postContent.trim() || postSaving}
          >
            {postSaving ? 'Posting…' : 'Post'}
          </button>
          {savedMsg && <p style={{ textAlign: 'center', marginTop: 10, color: '#4A7BA7' }}>{savedMsg}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="community-screen">
      <div className="community-header">
        <h1 className="community-title">Community</h1>
        <button className="community-search-btn" title="Search">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
      </div>

      <div className="community-tabs">
        <button
          className={`community-tab ${tab === 'social' ? 'active' : ''}`}
          onClick={() => setTab('social')}
        >
          Social
        </button>
        <button
          className={`community-tab ${tab === 'news' ? 'active' : ''}`}
          onClick={() => setTab('news')}
        >
          News
        </button>
      </div>

      {savedMsg && (
        <div className="community-toast">{savedMsg}</div>
      )}

      {tab === 'social' && (
        <div className="community-feed">
          <button
            className="community-compose-prompt"
            onClick={() => {
              if (!communityUsername) {
                setShowDisclaimer(true);
              } else {
                setShowCreatePost(true);
              }
            }}
          >
            <div className="community-avatar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/>
              </svg>
            </div>
            <span>What's on your mind?</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>

          {loading ? (
            <div className="community-loading">Loading posts…</div>
          ) : posts.length === 0 ? (
            <div className="community-empty">
              <p>No posts yet. Be the first to share!</p>
            </div>
          ) : (
            posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                onLike={handleLike}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      )}

      {tab === 'news' && (
        <div className="community-news-feed">
          {STATIC_NEWS.map((item, i) => (
            <div key={i} className="news-card">
              <div className="news-card-accent" style={{ background: item.accent }} />
              <div className="news-card-body">
                <h3 className="news-title">{item.title}</h3>
                <p className="news-excerpt">{item.excerpt}</p>
                <span className="news-meta">{item.timeAgo} | {item.source}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
