const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/authMiddleware');
const streamifier = require('streamifier');

const router = express.Router();

// Check if Cloudinary is configured
// Temporarily disable Cloudinary if having signature issues - set DISABLE_CLOUDINARY=true
const useCloudinary = !process.env.DISABLE_CLOUDINARY && 
                      process.env.CLOUDINARY_CLOUD_NAME && 
                      process.env.CLOUDINARY_API_KEY && 
                      process.env.CLOUDINARY_API_SECRET;

let upload;

if (useCloudinary) {
  // Use Cloudinary for production - upload directly without multer-storage-cloudinary
  const cloudinary = require('cloudinary').v2;

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true, // Use HTTPS
  });
  
  // Log config (without secret) for debugging
  console.log('Cloudinary config:', {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY ? '***' + process.env.CLOUDINARY_API_KEY.slice(-4) : 'missing',
    has_secret: !!process.env.CLOUDINARY_API_SECRET,
    api_key_length: process.env.CLOUDINARY_API_KEY?.length || 0,
    secret_length: process.env.CLOUDINARY_API_SECRET?.length || 0
  });
  
  // Test Cloudinary connection
  cloudinary.api.ping((error, result) => {
    if (error) {
      console.error('❌ Cloudinary connection test failed:', error.message);
    } else {
      console.log('✅ Cloudinary connection test passed');
    }
  });

  // Use memory storage for Cloudinary (stream directly to Cloudinary)
  const storage = multer.memoryStorage();

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
  async (req, res, next) => {
    // Final handler
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      
      const isVideo = /^video\//.test(req.file.mimetype);
      
      let mediaUrl;
      
      if (useCloudinary) {
        // Upload to Cloudinary directly using stream
        const cloudinary = require('cloudinary').v2;
        
        // Use unsigned upload or ensure signature is generated correctly
        // Upload options - minimal to avoid signature issues
        const uploadOptions = {
          folder: isVideo ? 'twitter-clone/videos' : 'twitter-clone/tweets',
          resource_type: isVideo ? 'video' : 'image',
        };
        
        console.log('Uploading to Cloudinary:', { 
          folder: uploadOptions.folder, 
          resource_type: uploadOptions.resource_type,
          file_size: req.file.size 
        });

        // Try unsigned_upload_stream first to avoid signature issues
        // If that fails, fall back to regular upload_stream
        const useUnsigned = process.env.CLOUDINARY_UNSIGNED_UPLOAD === 'true';
        const uploadMethod = useUnsigned ? 'unsigned_upload_stream' : 'upload_stream';
        
        console.log(`Using ${uploadMethod} for upload`);
        
        return new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader[uploadMethod](
            uploadOptions,
            (error, result) => {
              if (error) {
                console.error('Cloudinary upload error:', error.message);
                console.error('Error code:', error.http_code);
                // If signature error, suggest checking credentials
                if (error.message && error.message.includes('Invalid Signature')) {
                  console.error('❌ Signature error - check CLOUDINARY_API_SECRET in Render env vars');
                }
                res.status(500).json({ 
                  message: 'Cloudinary upload failed: ' + (error.message || 'Unknown error')
                });
                return reject(error);
              }
              
              if (!result || !result.secure_url) {
                console.error('Invalid Cloudinary result');
                res.status(500).json({ message: 'Invalid Cloudinary response' });
                return reject(new Error('Invalid response'));
              }
              
              console.log(`✅ Cloudinary upload: ${result.secure_url}`);
              res.json({ 
                success: true, 
                type: isVideo ? 'video' : 'image', 
                [isVideo ? 'videoUrl' : 'imageUrl']: result.secure_url 
              });
              resolve();
            }
          );
          
          streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
        });
      } else {
        // Local storage
        mediaUrl = isVideo 
          ? `/uploads/videos/${req.file.filename}` 
          : `/uploads/tweets/${req.file.filename}`;
        console.log(`✅ Local upload: ${mediaUrl}`);
        
        return res.json({ 
          success: true, 
          type: isVideo ? 'video' : 'image', 
          [isVideo ? 'videoUrl' : 'imageUrl']: mediaUrl 
        });
      }
    } catch (e) {
      console.error('Upload handler error:', e);
      return res.status(500).json({ message: 'Upload processing failed' });
    }
  }
);

module.exports = router;
