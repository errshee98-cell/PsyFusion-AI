const mongoose = require('mongoose');

const communityPostSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      // Never populate/expose this to other users in community responses -
      // only authorAnonymousHandle (a snapshot, so it survives handle changes).
    },
    authorAnonymousHandle: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['visible', 'under_review', 'removed'],
      default: 'visible',
      index: true,
    },
    crisisFlag: {
      type: Boolean,
      default: false,
      index: true,
    },
    crisisSeverity: {
      type: String,
      enum: [null, 'elevated', 'imminent'],
      default: null,
    },
    moderationNote: {
      type: String,
      select: false,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      select: false,
    },
    reviewedAt: {
      type: Date,
      select: false,
    },
    replyCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

communityPostSchema.index({ status: 1, createdAt: -1 });

communityPostSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    authorAnonymousHandle: this.authorAnonymousHandle,
    body: this.body,
    replyCount: this.replyCount,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('CommunityPost', communityPostSchema);
