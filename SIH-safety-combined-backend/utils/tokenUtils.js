const jwt = require("jsonwebtoken");

const getSecret = () =>
  process.env.JWT_SECRET || "default_development_jwt_secret";

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";

const generateToken = (userId) => {
  return jwt.sign({ userId }, getSecret(), {
    expiresIn: JWT_EXPIRES_IN
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, getSecret());
};

module.exports = {
  generateToken,
  verifyToken
};
