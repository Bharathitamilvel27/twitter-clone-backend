const User = require('../models/User');

module.exports = async function adminMiddleware(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('isAdmin email username');
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: 'Admin access required' });
    }
    req.admin = user; // attach for downstream usage
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};
