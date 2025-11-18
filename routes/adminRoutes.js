const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');
const { deleteTweetAsAdmin } = require('../controllers/adminController');

router.use(auth, admin);

// DELETE any tweet by ID with optional reason in body
router.delete('/tweets/:id', deleteTweetAsAdmin);

module.exports = router;
