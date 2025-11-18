const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});


const tweetSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: true,
    },
    image: {
      type: String, 
    },
    video: {
      type: String,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    retweets: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    comments: [commentSchema],
    hashtags: [{ type: String, index: true }],
  
    originalTweet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tweet',
    },
    isRetweet: {
      type: Boolean,
      default: false,
    },
    // Soft-delete fields for admin moderation
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedReason: {
      type: String,
      default: '',
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    deletedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Tweet', tweetSchema);
