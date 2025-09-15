// server/middlewares/auth.js
const jwt = require('jsonwebtoken');

// roles: array of allowed roles, e.g. ['staff','admin']
module.exports = function (roles = []) {
  return (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'] || req.headers['Authorization'];
      const token = authHeader && authHeader.split(' ')[1];
      if (!token) return res.status(401).json({ error: 'Access denied' });

      jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
      });
    } catch (e) {
      return res.status(500).json({ error: 'Authentication error', details: e.message });
    }
  };
};