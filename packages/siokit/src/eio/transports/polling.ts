import { newConn } from './conn.ts'

const base64Encode = (data: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

const base64Decode = (str: string): Uint8Array => {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const newPollingConn = (
  opts?: {
    pingInterval?: number
    pingTimeout?: number
    maxPayload?: number
    cors?: boolean
  },
) => {
  const outputBuffer: string[] = []
  let pendingResolve: ((resp: Response) => void) | null = null
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  const conn = newConn((data) => {
    if (data instanceof Uint8Array) {
      outputBuffer.push('b' + base64Encode(data))
    } else {
      outputBuffer.push(data)
    }
  }, opts)

  const drain = (): string | null => {
    if (outputBuffer.length === 0) return null
    const result = outputBuffer.join('\x1e')
    outputBuffer.length = 0
    return result
  }

  const corsHeaders = (req: Request): Record<string, string> => {
    if (!opts?.cors) return {}
    const origin = req.headers.get('origin') || '*'
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
    }
  }

  const buildResp = (payload: string, req: Request): Response => {
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain; charset=UTF-8',
      'Cache-Control': 'no-store',
    }
    Object.assign(headers, corsHeaders(req))
    return new Response(payload, { status: 200, headers })
  }

  const onPoll = async (req: Request): Promise<Response> => {
    let payload = drain()
    if (payload) return buildResp(payload, req)
    return new Promise<Response>((resolve) => {
      const timeout = setTimeout(() => {
        pendingResolve = null
        pendingTimeout = null
        resolve(buildResp('6', req))
      }, (opts?.pingInterval ?? 25000) + (opts?.pingTimeout ?? 20000))
      pendingTimeout = timeout
      pendingResolve = (resp: Response) => {
        clearTimeout(timeout)
        pendingResolve = null
        pendingTimeout = null
        resolve(resp)
      }
    })
  }

  const onData = async (req: Request): Promise<Response> => {
    const body = await req.text()
    if (body.length > (opts?.maxPayload ?? 1000000)) {
      return new Response('Payload too large', { status: 413 })
    }
    const parts = body.split('\x1e')
    for (const part of parts) {
      if (part.length === 0) continue
      if (part.charAt(0) === 'b') {
        conn.handleData(base64Decode(part.substring(1)))
      } else {
        conn.handleData(part)
      }
    }
    if (pendingResolve) {
      const payload = drain()
      if (payload) {
        pendingResolve(buildResp(payload, req))
      }
    }
    const headers: Record<string, string> = { 'Content-Type': 'text/html' }
    Object.assign(headers, corsHeaders(req))
    return new Response('ok', { status: 200, headers })
  }

  const onRequest = (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      const headers = corsHeaders(req)
      if (Object.keys(headers).length === 0) return Promise.resolve(new Response(null, { status: 204 }))
      return Promise.resolve(new Response(null, { status: 204, headers }))
    }
    if (req.method === 'POST') return onData(req)
    return onPoll(req)
  }

  const _close = (reason: string) => {
    if (pendingResolve) { pendingResolve = null }
    if (pendingTimeout) { clearTimeout(pendingTimeout); pendingTimeout = null }
    conn.close(reason)
  }

  return { ...conn, onRequest, close: _close }
}

export type PollingConn = ReturnType<typeof newPollingConn>
