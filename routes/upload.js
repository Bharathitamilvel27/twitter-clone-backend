const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

// Check if Cloudinary is configured
const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME && 
                      process.env.CLOUDINARY_API_KEY && 
                      process.env.CLOUDINARY_API_SECRET;

let upload;

if (useCloudinary) {
  // Use Cloudinary for production
  const cloudinary = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
      const isVideo = /^video\//.test(file.mimetype);
      return {
        folder: isVideo ? 'twitter-clone/videos' : 'twitter-clone/tweets',
        resource_type: isVideo ? 'video' : 'image',
        allowed_formats: isVideo ? ['mp4', 'webm', 'ogg', 'mov'] : ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      };
    },
  });

  upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for Cloudinary
    fileFilter: (req, file, cb) => {
      const isImage = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
      const isVideo = /^video\/(mp4|webm|ogg|quicktime)$/.test(file.mimetype);
      if (isImage || isVideo) return cb(null, true);
      cb(new Error('Only image or video files are allowed'));
    }
  });

  console.log('✅ Using Cloudinary for file uploads');
} else {
  // Fallback to local storage for development
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

  upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
      const isImage = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
      const isVideo = /^video\/(mp4|webm|ogg|quicktime)$/.test(file.mimetype);
      if (isImage || isVideo) return cb(null, true);
      cb(new Error('Only image or video files are allowed'));
    }
  });

  console.log('⚠️  Using local storage (Cloudinary not configured)');
}

// Accept field 'media' (preferred) or legacy 'tweetImage'
const uploadMiddleware = upload.single('media');

router.post(
  '/tweet',
  auth,
  (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        console.error('Upload error:', err.message, err.code);
        
        // Handle specific multer errors
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            message: `File too large. Max ${useCloudinary ? '100MB' : '50MB'}.` 
          });
        }
        
        if (err.message && err.message.includes('Unexpected end of form')) {
          return res.status(400).json({ 
            message: 'Upload was interrupted. Try a smaller file or check your connection.' 
          });
        }
        
        // Try legacy field name as fallback
        if (err.message && err.message.includes('No such file')) {
          const legacyHandler = upload.single('tweetImage');
          return legacyHandler(req, res, (err2) => {
            if (err2) {
              console.error('Legacy upload also failed:', err2.message);
              return res.status(400).json({ 
                message: err2.message || 'Upload failed. Please try again.' 
              });
            }
            next();
          });
        }
        
        return res.status(400).json({ 
          message: err.message || 'Upload failed' 
        });
      }
      next();
    });
  },
  (req, res) => {
    // Final handler
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const isVideo = /^video\//.test(req.file.mimetype);
      
      // Cloudinary returns secure_url, local storage returns path
      let mediaUrl;
      if (useCloudinary) {
        mediaUrl = req.file.secure_url; // Full Cloudinary URL
        console.log(`✅ Cloudinary upload: ${mediaUrl}`);
      } else {
        mediaUrl = isVideo 
          ? `/uploads/videos/${req.file.filename}` 
          : `/uploads/tweets/${req.file.filename}`;
        console.log(`✅ Local upload: ${mediaUrl}`);
      }
      
      return res.json({ 
        success: true, 
        type: isVideo ? 'video' : 'image', 
        [isVideo ? 'videoUrl' : 'imageUrl']: mediaUrl 
      });
    } catch (e) {
      console.error('Upload handler error:', e);
      return res.status(500).json({ message: 'Upload processing failed' });
    }
  }
);

module.exports = router;
