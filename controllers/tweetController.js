const Tweet = require('../models/Tweet');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');


const createTweet = async (req, res) => {
  try {
    const { content = '', image = null, video = null } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ message: 'Content is required' });
    }
    const MAX_LEN = 280;
    if (content.length > MAX_LEN) {
      return res.status(400).json({ message: `Content exceeds ${MAX_LEN} characters` });
    }

    // extract hashtags like #tag
    const hashtags = (content.match(/#([\p{L}\p{N}_]+)/gu) || []).map(h => h.slice(1).toLowerCase());

    const tweet = new Tweet({
      user: req.user.id,
      content,
      image: image || null,
      video: video || null,
      hashtags,
    });

    const savedTweet = await tweet.save();

    const populatedTweet = await Tweet.findById(savedTweet._id).populate('user', 'username');

    res.status(201).json(populatedTweet);
  } catch (error) {
    console.error("❌ Error in createTweet:", error.message);
    res.status(500).json({ message: 'Error creating tweet' });
  }
};

const getAllTweets = async (req, res) => {
  try {
    const tweets = await Tweet.find()
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username');

    const userId = req.user ? req.user.id : null;

    const formattedTweets = tweets.map(tweet => ({
      _id: tweet._id,
      // Hide original content/image if deleted; frontend will show reason
      content: tweet.isDeleted ? '' : tweet.content,
      image: tweet.isDeleted ? null : (tweet.image || null),
      video: tweet.isDeleted ? null : (tweet.video || null),
      createdAt: tweet.createdAt,
      user: tweet.user,
      likesCount: tweet.likes.length,
      retweetsCount: tweet.retweets.length,
      likes: tweet.likes,
      retweets: tweet.retweets,
      likedByCurrentUser: userId ? tweet.likes.some(likeId => likeId.toString() === userId) : false,
      retweetedByCurrentUser: userId ? tweet.retweets.some(retweetId => retweetId.toString() === userId) : false,
      isDeleted: tweet.isDeleted || false,
      deletedReason: tweet.deletedReason || '',
      deletedAt: tweet.deletedAt || null,
      deletedBy: tweet.deletedBy || null,
      comments: tweet.comments.map(comment => ({
        _id: comment._id,
        text: comment.text,
        createdAt: comment.createdAt,
        user: comment.user ? { _id: comment.user._id, username: comment.user.username } : null,
      })),
    }));

    res.json(formattedTweets);
  } catch (error) {
    console.error("❌ Error in getAllTweets:", error.message);
    res.status(500).json({ message: 'Error fetching tweets' });
  }
};


const toggleLike = async (req, res) => {
  const userId = req.user.id;
  const tweetId = req.params.id;

  try {
    const tweet = await Tweet.findById(tweetId);
    if (!tweet) return res.status(404).json({ message: 'Tweet not found' });

    const likedIndex = tweet.likes.indexOf(userId);
    if (likedIndex === -1) {
      tweet.likes.push(userId);
    } else {
      tweet.likes.splice(likedIndex, 1);
    }

    await tweet.save();
    res.json({ likesCount: tweet.likes.length, liked: likedIndex === -1 });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};


const deleteTweet = async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id);
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }


    if (tweet.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only delete your own tweets' });
    }


    if (tweet.image) {
      const imagePath = path.join(__dirname, '..', tweet.image);
      fs.unlink(imagePath, (err) => {
        if (err) {
          console.warn('⚠️ Failed to delete image:', imagePath, err.message);
        } else {
          console.log('🗑️ Image deleted:', imagePath);
        }
      });
    }

   
    await tweet.deleteOne();

    res.json({ message: 'Tweet deleted successfully' });
  } catch (error) {
    console.error('❌ Delete tweet error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};


const updateTweet = async (req, res) => {
  try {
    const { content } = req.body;
    const tweetId = req.params.id;

    const tweet = await Tweet.findById(tweetId);
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }

 
    if (tweet.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You can only edit your own tweets' });
    }

   
    const MAX_LEN = 280;
    if (!content || content.length === 0) {
      return res.status(400).json({ message: 'Content is required' });
    }
    if (content.length > MAX_LEN) {
      return res.status(400).json({ message: `Content exceeds ${MAX_LEN} characters` });
    }

    const hashtags = (content.match(/#([\p{L}\p{N}_]+)/gu) || []).map(h => h.slice(1).toLowerCase());

    const updatedTweet = await Tweet.findByIdAndUpdate(
      tweetId,
      { content, hashtags },
      { new: true }
    ).populate('user', 'username profilePicture');

    res.json(updatedTweet);
  } catch (error) {
    console.error('❌ Update tweet error:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
};

const addComment = async (req, res) => {
  try {
    const tweet = await Tweet.findById(req.params.id);
    if (!tweet) return res.status(404).json({ message: 'Tweet not found' });

    const comment = {
      user: req.user.id,
      text: req.body.text,
    };

    tweet.comments.push(comment);
    await tweet.save();

    const populatedTweet = await tweet.populate('comments.user', 'username');
    res.json(populatedTweet.comments);
  } catch (error) {
    console.error('❌ Error in addComment:', error.message);
    res.status(500).json({ message: 'Error adding comment' });
  }
};


const getTweetsByUser = async (req, res) => {
  try {
    const { username } = req.params;
    
    
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    
    const tweets = await Tweet.find({ user: user._id })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username')
      .populate('originalTweet')
      .populate('originalTweet.user', 'username profilePicture');

    const userId = req.user ? req.user.id : null;

    const formattedTweets = tweets.map(tweet => ({
      _id: tweet._id,
      content: tweet.isDeleted ? '' : tweet.content,
      image: tweet.isDeleted ? null : (tweet.image || null),
      video: tweet.isDeleted ? null : (tweet.video || null),
      createdAt: tweet.createdAt,
      user: tweet.user,
      likesCount: tweet.likes.length,
      retweetsCount: tweet.retweets.length,
      likes: tweet.likes,
      retweets: tweet.retweets,
      likedByCurrentUser: userId ? tweet.likes.some(likeId => likeId.toString() === userId) : false,
      retweetedByCurrentUser: userId ? tweet.retweets.some(retweetId => retweetId.toString() === userId) : false,
      isRetweet: tweet.isRetweet,
      originalTweet: tweet.originalTweet,
      isDeleted: tweet.isDeleted || false,
      deletedReason: tweet.deletedReason || '',
      deletedAt: tweet.deletedAt || null,
      deletedBy: tweet.deletedBy || null,
      comments: tweet.comments.map(comment => ({
        _id: comment._id,
        text: comment.text,
        createdAt: comment.createdAt,
        user: comment.user ? { _id: comment.user._id, username: comment.user.username } : null,
      })),
    }));

    res.json(formattedTweets);
  } catch (error) {
    console.error('❌ Error in getTweetsByUser:', error.message);
    res.status(500).json({ message: 'Error fetching user tweets' });
  }
};


const retweet = async (req, res) => {
  try {
    const { tweetId } = req.params;
    const userId = req.user.id;

    const originalTweet = await Tweet.findById(tweetId)
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username');

    if (!originalTweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }

  
    const existingRetweet = await Tweet.findOne({
      user: userId,
      originalTweet: tweetId,
      isRetweet: true
    });

    if (existingRetweet) {
    
      await Tweet.findByIdAndDelete(existingRetweet._id);
      await Tweet.findByIdAndUpdate(tweetId, {
        $pull: { retweets: userId }
      });
      
      res.json({ message: 'Retweet removed', retweeted: false });
    } else {

      const retweet = new Tweet({
        user: userId,
        content: originalTweet.content,
        image: originalTweet.image,
        originalTweet: tweetId,
        isRetweet: true
      });

      await retweet.save();
      await Tweet.findByIdAndUpdate(tweetId, {
        $addToSet: { retweets: userId }
      });

      res.json({ message: 'Tweet retweeted', retweeted: true });
    }
  } catch (error) {
    console.error('❌ Error in retweet:', error.message);
    res.status(500).json({ message: 'Error retweeting tweet' });
  }
};


const search = async (req, res) => {
  try {
    const { q, type = 'tweets' } = req.query;
    const userId = req.user ? req.user.id : null;

    if (!q || q.trim() === '') {
      return res.json([]);
    }

    if (type === 'users') {
 
      const users = await User.find({
        $or: [
          { username: { $regex: q, $options: 'i' } },
          { bio: { $regex: q, $options: 'i' } }
        ]
      })
      .select('username profilePicture bio')
      .limit(10);

      res.json(users);
    } else {
   
      const tweets = await Tweet.find({
        $or: [
          { content: { $regex: q, $options: 'i' } }
        ]
      })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username')
      .limit(20);

      const formattedTweets = tweets.map(tweet => ({
        _id: tweet._id,
        content: tweet.isDeleted ? '' : tweet.content,
        image: tweet.isDeleted ? null : (tweet.image || null),
        video: tweet.isDeleted ? null : (tweet.video || null),
        createdAt: tweet.createdAt,
        user: tweet.user,
        likesCount: tweet.likes.length,
        retweetsCount: tweet.retweets.length,
        likedByCurrentUser: userId ? tweet.likes.some(likeId => likeId.toString() === userId) : false,
        retweetedByCurrentUser: userId ? tweet.retweets.some(retweetId => retweetId.toString() === userId) : false,
        isDeleted: tweet.isDeleted || false,
        deletedReason: tweet.deletedReason || '',
        deletedAt: tweet.deletedAt || null,
        deletedBy: tweet.deletedBy || null,
        comments: tweet.comments.map(comment => ({
          _id: comment._id,
          text: comment.text,
          createdAt: comment.createdAt,
          user: comment.user ? { _id: comment.user._id, username: comment.user.username } : null,
        })),
      }));

      res.json(formattedTweets);
    }
  } catch (error) {
    console.error('❌ Error in search:', error.message);
    res.status(500).json({ message: 'Error searching' });
  }
};

module.exports = {
  createTweet,
  getAllTweets,
  toggleLike,
  deleteTweet,
  updateTweet,
  addComment,
  getTweetsByUser,
  retweet,
  search,
};

// New: tweets by hashtag
const getTweetsByHashtag = async (req, res) => {
  try {
    const tag = req.params.tag.toLowerCase();
    const userId = req.user ? req.user.id : null;

    const tweets = await Tweet.find({ hashtags: tag })
      .sort({ createdAt: -1 })
      .populate('user', 'username profilePicture')
      .populate('comments.user', 'username');

    const formatted = tweets.map(tweet => ({
      _id: tweet._id,
      content: tweet.isDeleted ? '' : tweet.content,
      image: tweet.isDeleted ? null : (tweet.image || null),
      video: tweet.isDeleted ? null : (tweet.video || null),
      createdAt: tweet.createdAt,
      user: tweet.user,
      likesCount: tweet.likes.length,
      retweetsCount: tweet.retweets.length,
      likedByCurrentUser: userId ? tweet.likes.some(l => l.toString() === userId) : false,
      retweetedByCurrentUser: userId ? tweet.retweets.some(r => r.toString() === userId) : false,
      isDeleted: tweet.isDeleted || false,
      deletedReason: tweet.deletedReason || '',
      deletedAt: tweet.deletedAt || null,
    }));

    res.json(formatted);
  } catch (e) {
    console.error('❌ Error in getTweetsByHashtag:', e.message);
    res.status(500).json({ message: 'Error fetching hashtag tweets' });
  }
};

// New: trends from last 24h
const getTrends = async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const results = await Tweet.aggregate([
      { $match: { createdAt: { $gte: since }, isDeleted: { $ne: true } } },
      { $unwind: '$hashtags' },
      { $group: { _id: { $toLower: '$hashtags' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    const trends = results.map(r => ({ tag: r._id, count: r.count }));
    res.json({ trends });
  } catch (e) {
    console.error('❌ Error in getTrends:', e.message);
    res.status(500).json({ message: 'Error fetching trends' });
  }
};

module.exports.getTweetsByHashtag = getTweetsByHashtag;
module.exports.getTrends = getTrends;
