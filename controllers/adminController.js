const Tweet = require('../models/Tweet');
const User = require('../models/User');
const nodemailer = require('nodemailer');

async function buildTransporter() {
  // 1) Prefer Gmail OAuth2 if configured
  if (
    process.env.GMAIL_USER &&
    process.env.GMAIL_CLIENT_ID &&
    process.env.GMAIL_CLIENT_SECRET &&
    process.env.GMAIL_REFRESH_TOKEN
  ) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: process.env.GMAIL_USER,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      },
    });
    return { transporter, isEthereal: false, mode: 'gmail-oauth2' };
  }

  // If SMTP env exists, use it
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return { transporter, isEthereal: false, mode: 'smtp' };
  }

  // Otherwise, create an Ethereal test account so you get a preview URL
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
  return { transporter, isEthereal: true, mode: 'ethereal' };
}

exports.deleteTweetAsAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Violation of community guidelines' } = req.body || {};

    const tweet = await Tweet.findById(id).populate('user', 'email username');
    if (!tweet) {
      return res.status(404).json({ message: 'Tweet not found' });
    }

    // Soft-delete instead of permanent delete
    await Tweet.findByIdAndUpdate(id, {
      $set: {
        isDeleted: true,
        deletedReason: reason,
        deletedBy: req.user.id,
        deletedAt: new Date(),
      },
    });

    // Skip sending email per updated requirement; UI will show reason
    res.json({ message: 'Tweet marked as deleted', reason });
  } catch (err) {
    console.error('Admin delete error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};
