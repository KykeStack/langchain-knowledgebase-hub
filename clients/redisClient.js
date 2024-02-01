import dotenv from 'dotenv'
import { RedisCache } from '@langchain/community/caches/ioredis'
import { createClient } from 'redis'

const dotenvConfig = dotenv.config()

/* Init Redis for cache */
export const clientRedis = createClient({
  url: process.env.REDIS_URL,
})

export const cache = new RedisCache(clientRedis)
clientRedis.connect()
clientRedis.on('error', (err) => {
  console.error('Error connecting to Redis:', err)
})

clientRedis.on('ready', () => {
  console.log('Connected to Redis server.')
})
