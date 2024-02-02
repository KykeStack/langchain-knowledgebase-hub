import { generateToken } from '../middleware/authentication.js'
import { Router } from 'express';

const router = Router() 

router.post('/generate-token', async (req, res) => {
  const { domain, id } = req.body
  if (!domain || !id) {
    res.status(404).json({ message: `Missing domain or id` })
    return
  }
  const token = await generateToken({ domain: domain, id: id });
  res.status(200).json({
    success: true,
    token: token,
  })
});

export default router 