import { Hono,  } from 'hono'
import { upgradeWebSocket } from 'hono/bun'
const app = new Hono();
app.get(
  '/ws/',
  upgradeWebSocket((c) => {
    return {
			onOpen(event, ws) {
      },
      onMessage(event, ws) {},
      onClose(event, ws) {},
      onError(event, ws) {
      }
    }
  })
)