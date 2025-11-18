const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/authMiddleware');

const router = express.Router();


const tweetDir = path.join(__dirname, '../uploads/tweets');
const profileDir = path.join(__dirname, '../uploads/profile');
const videosDir = path.join(__dirname, '../uploads/videos');

[tweetDir, profileDir, videosDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created: ${dir}`);
  }
});


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isVideo = /^video\//.test(file.mimetype);
    cb(null, isVideo ? videosDir : tweetDir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const isImage = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
    const isVideo = /^video\/(mp4|webm|ogg|quicktime)$/.test(file.mimetype);
    if (isImage || isVideo) return cb(null, true);
    cb(new Error('Only image or video files are allowed'));
  }
});

// Accept field 'media' (preferred) or legacy 'tweetImage'
router.post(
  '/tweet',
  auth,
  (req, res, next) => {
    const handler = upload.single('media');
    handler(req, res, function (err) {
      if (err) {
        // If field name mismatch, try legacy
        const legacy = upload.single('tweetImage');
        return legacy(req, res, function (err2) {
          if (err2) return next(err2);
          next();
        });
      }
      next();
    });
  },
  (err, req, res, next) => {
    // Multer error handler stage 1
    if (err) {
      console.warn('Upload error:', err.message);
      const status = err.code === 'LIMIT_FILE_SIZE' ? 400 : 400;
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File too large. Max 50MB.' : err.message || 'Upload failed';
      return res.status(status).json({ message: msg });
    }
    next();
  },
  (req, res, next) => {
    // Final handler
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      const isVideo = /^video\//.test(req.file.mimetype);
      const rel = isVideo ? `/uploads/videos/${req.file.filename}` : `/uploads/tweets/${req.file.filename}`;
      console.log(`✅ Tweet media uploaded: ${rel}`);
      return res.json({ success: true, type: isVideo ? 'video' : 'image', [isVideo ? 'videoUrl' : 'imageUrl']: rel });
    } catch (e) {
      console.error('Upload handler error:', e);
      return res.status(500).json({ message: 'Upload failed' });
    }
  }
);

module.exports = router;
