/**
 * Simple Role-Based Authentication & Authorization Module.
 * Supported Roles:
 * - 'bidder': Can participate in bidding, view live auctions.
 * - 'writer': Auctioneer / Admin. Can create, reset, and close auctions.
 */

// Demo pre-registered accounts
const USERS = {
  admin: { username: 'admin', role: 'writer', name: 'Auctioneer Admin' },
  ravi: { username: 'ravi', role: 'bidder', name: 'Ravi Sharma' },
  priya: { username: 'priya', role: 'bidder', name: 'Priya Patel' }
};

// Active sessions in memory: token -> user
const activeSessions = new Map();

/**
 * Authenticates user or creates demo session.
 */
function loginUser({ username, role = 'bidder' }) {
  if (!username) throw new Error('Username is required');

  const cleanUser = username.trim().toLowerCase();
  let user = USERS[cleanUser];

  if (!user) {
    // Dynamic login for testing with specified role
    user = {
      username: cleanUser,
      role: role === 'writer' ? 'writer' : 'bidder',
      name: username.trim()
    };
  }

  const token = `tok_${user.username}_${Date.now()}`;
  activeSessions.set(token, user);

  return { token, user };
}

/**
 * Validates session token.
 */
function getUserFromToken(token) {
  if (!token) return null;
  return activeSessions.get(token) || null;
}

/**
 * Express middleware to verify user role.
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader ? authHeader.replace(/^Bearer\s+/i, '') : req.query.token;

    const user = getUserFromToken(token);

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Please log in to perform this action'
      });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${user.role}' is not permitted to perform this action. Required role: ${roles.join(' or ')}`
      });
    }

    req.user = user;
    next();
  };
}

module.exports = {
  USERS,
  loginUser,
  getUserFromToken,
  requireRole
};
