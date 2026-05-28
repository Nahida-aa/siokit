export const createTransport = (url: string) => {
  let ws: WebSocket | null = null
  let closed = false
  let openResolve: (() => void) | null = null
  let openReject: ((err: Error) => void) | null = null

  const handlers = {
    onmessage: (_data: string | Uint8Array | ArrayBuffer) => {},
    onclose: (_reason: string) => {},
  }

  const connect = () => {
    return new Promise<void>((resolve, reject) => {
      if (closed) { reject(new Error('transport closed')); return }
      openResolve = resolve
      openReject = reject

      const wsUrl = url.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket'
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {}

      ws.onmessage = (event: MessageEvent) => {
        const data = event.data
        if (typeof data === 'string') {
          const ch = data.charAt(0)
          if (ch === '0') {
            openResolve?.()
            openResolve = null
            openReject = null
          } else if (ch === '2') {
            ws?.send('3')
          } else if (ch === '4') {
            handlers.onmessage(data.substring(1))
          } else if (ch === '1') {
            handlers.onclose('transport close')
          }
        } else if (data instanceof ArrayBuffer) {
          handlers.onmessage(new Uint8Array(data))
        } else {
          handlers.onmessage(data)
        }
      }

      ws.onclose = () => {
        if (!closed) handlers.onclose('transport close')
      }

      ws.onerror = () => {
        openReject?.(new Error('WebSocket connection error'))
        openResolve = null
        openReject = null
      }
    })
  }

  const send = (data: string | Uint8Array<ArrayBuffer> | ArrayBuffer) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  }

  const close = () => {
    closed = true
    ws?.close()
  }

  return { connect, send, close, handlers, get closed() { return closed } }
}

export type Transport = ReturnType<typeof createTransport>
