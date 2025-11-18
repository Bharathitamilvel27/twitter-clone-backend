const express = require('express');
const router = express.Router();
const { createTweet, getAllTweets, toggleLike, deleteTweet, updateTweet, addComment, getTweetsByUser, retweet, search, getTweetsByHashtag, getTrends } = require('../controllers/tweetController');
const authMiddleware = require('../middleware/authMiddleware');


router.use(authMiddleware);

router.post('/', createTweet);

router.get('/', getAllTweets);

router.get('/search', search);

router.get('/user/:username', getTweetsByUser);

// New: hashtags and trends
router.get('/hashtag/:tag', getTweetsByHashtag);
router.get('/trends', getTrends);

router.post('/:id/like', toggleLike);

router.post('/:tweetId/retweet', retweet);

router.put('/:id', updateTweet);

router.delete('/:id', deleteTweet);

router.post('/:id/comment', addComment);

module.exports = router;
