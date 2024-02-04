import { Router } from 'express';
import { clientRedis } from '../clients/redisClient.js'

const router = Router() 

/* Clear Redis cache  */
router.get('/clearcache', async (req, res) => {
  try {
    clientRedis.sendCommand(['FLUSHDB'], (err, result) => {
      if (err) {
        console.error('Error flushing database:', err)
      } else {
        console.log('Database flushed:', result)
      }
    })

    res.json({ success: true, message: 'Cache cleared' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Error clearing the cache' })
  }
})

export default router 