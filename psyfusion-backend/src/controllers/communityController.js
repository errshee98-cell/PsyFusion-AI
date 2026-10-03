const CommunityPost = require('../models/CommunityPost');
const User = require('../models/User');
const logger = require('../utils/logger');
const { scanText, CRISIS_RESOURCES_MESSAGE } = require('../services/crisisDetectionService');

async function createPost(req, res, next) {
  try {
    const { body } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'User not found' });

    const scan = scanText(body);

    const post = await CommunityPost.create({
      author: user._id,
      authorAnonymousHandle: user.anonymousHandle,
      body,
      status: scan.flagged ? 'under_review' : 'visible',
      crisisFlag: scan.flagged,
      crisisSeverity: scan.severity,
    });

    if (scan.flagged) {
      logger.audit('community_post_flagged', {
        postId: post._id.toString(),
        severity: scan.severity,
      });
      // TODO: fan this out to MODERATION_REVIEW_WEBHOOK / on-call notification
      // for 'imminent' severity so a human reviews it within minutes, not hours.
      return res.status(201).json({
        status: 'under_review',
        ...CRISIS_RESOURCES_MESSAGE,
      });
    }

    return res.status(201).json({ status: 'visible', post: post.toPublicJSON() });
  } catch (err) {
    return next(err);
  }
}

async function listPosts(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    const posts = await CommunityPost.find({ status: 'visible' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return res.json({
      page,
      limit,
      posts: posts.map((p) => p.toPublicJSON()),
    });
  } catch (err) {
    return next(err);
  }
}

// --- Moderation (clinician/admin only) ---

async function listReviewQueue(req, res, next) {
  try {
    const posts = await CommunityPost.find({ status: 'under_review' })
      .sort({ crisisSeverity: 1, createdAt: 1 }) // imminent first (alpha order puts 'imminent' before 'elevated')
      .select('+moderationNote');

    return res.json({ posts });
  } catch (err) {
    return next(err);
  }
}

async function reviewPost(req, res, next) {
  try {
    const { postId } = req.params;
    const { decision, note } = req.body; // decision: 'approve' | 'remove'

    if (!['approve', 'remove'].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'approve' or 'remove'" });
    }

    const post = await CommunityPost.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.status = decision === 'approve' ? 'visible' : 'removed';
    post.moderationNote = note || null;
    post.reviewedBy = req.user.id;
    post.reviewedAt = new Date();
    await post.save();

    logger.audit('community_post_reviewed', {
      postId: post._id.toString(),
      reviewerId: req.user.id,
      decision,
    });

    return res.json({ status: post.status });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createPost, listPosts, listReviewQueue, reviewPost };
