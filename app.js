import express from 'express'
import http from 'http'
import cors from 'cors'

/* Swagger UI */
import swaggerUi from 'swagger-ui-express';
import swaggerFile from './swagger_output.json' assert { type: "json" };

/* Routes */
import authentication from './routes/authentication.js' 
import redis from './routes/redis.js' 
import vector from './routes/vector.js' 

/* Load environment variables from .env file */
import * as dotenv from 'dotenv'

const dotenvConfig = dotenv.config()
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGIN_URL || "[]" 
const urls = ALLOWED_ORIGINS.match(/'([^']+)'/g) || []

/* Set up Express app */
const app = express()

/* Middleware CORS origin */
app.use(cors({ origin: urls.map(url => url.replace(/'/g, '')) }))

/* Documentation endpoint for Swagger */
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerFile))

/* Middleware to parse JSON request bodies */
app.use(express.urlencoded({ extended: true }))
app.use(express.json({ limit: "20mb" }))

/* Include App Routes */
app.use("/authentication", authentication) 
app.use("/redis", redis) 
app.use("/vector", vector) 

/* Create HTTP server */
http.createServer(app).listen(process.env.PORT)
console.info('Voiceflow Langchain API is listening on port ' + process.env.PORT)

/* Get endpoint to check current status  */
app.get('/api/health', async (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
  })
})