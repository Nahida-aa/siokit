import app from './app'
import { websocket } from 'hono/bun'

export default {
  port: 9007,
  idleTimeout: 60, 
  fetch: app.fetch,
  websocket,
}
