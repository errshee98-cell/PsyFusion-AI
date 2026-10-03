import { apiFetch } from './client';
import type { CrisisResources } from './screening';

export interface CommunityPost {
  id: string;
  authorAnonymousHandle: string;
  body: string;
  replyCount: number;
  createdAt: string;
}

export interface ListPostsResponse {
  page: number;
  limit: number;
  posts: CommunityPost[];
}

export type CreatePostResponse =
  | { status: 'visible'; post: CommunityPost }
  | ({ status: 'under_review' } & CrisisResources);

export async function listPosts(page = 1): Promise<ListPostsResponse> {
  return apiFetch(`/api/community/posts?page=${page}`);
}

export async function createPost(body: string): Promise<CreatePostResponse> {
  return apiFetch('/api/community/posts', { method: 'POST', body: { body } });
}
