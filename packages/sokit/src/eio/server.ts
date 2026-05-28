import { newConn, initTransport, type Conn } from './transports/conn.ts'
import { newWsConn, type WsConn } from './transports/ws.ts'
import { newPollingConn, type PollingConn } from './transports/polling.ts'

export { newConn, type SendRawFn, type Conn, initTransport } from './transports/conn.ts'
export { newWsConn, type WsConn } from './transports/ws.ts'
export { newPollingConn, type PollingConn } from './transports/polling.ts'

export interface WsSession {
  handleData(data: any): void
  close(reason: string): void
}

export interface EioServerOptions {
  pingInterval?: number
  pingTimeout?: number
  maxPayload?: number
  cors?: boolean
  transports?: string[]
  onconn?: (conn: Conn) => void
}

export const createEioServer = (opts?: EioServerOptions) => {
  const conns = new Map<string, Conn>()

  const cleanupConn = (conn: Conn) => {
    conns.delete(conn.id)
  }

  const handleRequest = (req: Request): Response | Promise<Response> => {
    const url = new URL(req.url)
    const transport = url.searchParams.get('transport')

    if (transport === 'polling') {
      const sid = url.searchParams.get('sid')
      let conn: PollingConn | undefined = sid ? (conns.get(sid) as PollingConn | undefined) : undefined
      if (sid && !conn) return new Response('Session ID unknown', { status: 400 })
      if (!conn) {
        if (opts?.transports && !opts.transports.includes('polling')) {
          return new Response('Transport unknown', { status: 400 })
        }
        conn = newPollingConn({
          pingInterval: opts?.pingInterval,
          pingTimeout: opts?.pingTimeout,
          maxPayload: opts?.maxPayload,
          cors: !!opts?.cors,
        })
        conns.set(conn.id, conn)
        conn.on('close', () => cleanupConn(conn!))
        initTransport(conn)
        opts?.onconn?.(conn)
      }
      return conn.onRequest(req)
    }

    return new Response('404 Not Found', { status: 404 })
  }

  const createWsSession = (ws: { send(data: string | Uint8Array): void }): WsSession => {
    const conn = newWsConn(ws, {
      pingInterval: opts?.pingInterval,
      pingTimeout: opts?.pingTimeout,
      maxPayload: opts?.maxPayload,
    })
    conns.set(conn.id, conn)
    conn.on('close', () => cleanupConn(conn))
    initTransport(conn)
    opts?.onconn?.(conn)
    return {
      handleData: (data) => conn.handleData(data),
      close: (reason) => conn.close(reason || 'transport close'),
    }
  }

  return {
    conns,
    handleRequest,
    createWsSession,
  }
}
