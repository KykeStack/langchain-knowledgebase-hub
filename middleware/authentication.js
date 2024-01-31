import pkg from 'jsonwebtoken';
import dotenv from 'dotenv'

const { verify } = pkg;
const { sign } = pkg;
const dotenvConfig = dotenv.config()
const config = process.env;

const verifyToken = (req, res, next) => {
  try {
    let token = req.headers.authorization
  
    token = token.split(' ')
    if (!token || token[0] !== 'Bearer') {
      res.status(403).send("A token is required for authentication");
      return 
    } 
  
    const decoded = verify(token[1], config.JWT_SECRET_KEY);
    const tokenDomain = JSON.parse(config.DOMAINS).filter(id => id === decoded.user_id)
    const tokenId = JSON.parse(config.IDS).filter(id => id === decoded.id)

    if (tokenDomain.length <= 0 || tokenId.length <= 0) {
      res.status(403).send("A token is required for authentication");
      return 
    } 

    req.user = decoded;
    next();

  } catch (err) {
    return res.status(401).send("Invalid Token");
  }
};

const generateToken = async (domain, id) => {
  return sign({ 
    user_id: domain, 
    id: id 
  }, config.JWT_SECRET_KEY );
}

export { verifyToken, generateToken };