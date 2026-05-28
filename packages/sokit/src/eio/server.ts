import { newEventBus } from '../core/eventBus.ts'
import type { Packet } from './parser/shared.ts'
import type { HandshakeData } from './type.ts'
import type { WsRaw } from './transports/websocket.ts'

type EioReservedEvents = {
  message: (packet: Packet) => void
  close: (reason: string) => void
}

export interface EioSocket {
  id: string
  closed: boolean
  sendOpen: () => void
  sendMessage: (payload: string) => void
  sendBinary: (payload:  Uint8Array) => void
  startPingTimers: () => void
  scheduleNextPing: () => void
  handleData: (raw: any) => void
  close: (reason: string) => void
  on(event: string, handler: (...args: any[]) => void): any
  off(event?: string, handler?: (...args: any[]) => void): any
}

let eioIdCounter = 0
const genEioId = () => {
  eioIdCounter++
  return `eio_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}${eioIdCounter}`
}

const toStr = (raw: any): string => {
  if (typeof raw === 'string') return raw
  if (raw instanceof ArrayBuffer) return new TextDecoder().decode(raw)
  if (raw && typeof raw === 'object') {
    if (raw.type === 'Buffer' && Array.isArray(raw.data)) {
      return new TextDecoder().decode(new Uint8Array(raw.data))
    }
    if (raw.buffer instanceof ArrayBuffer || raw.byteLength !== undefined) {
      try { return new TextDecoder().decode(raw) } catch {}
    }
  }
  return String(raw)
}

export const createEioSocket = (
  ws: WsRaw,
  opts?: { pingInterval?: number; pingTimeout?: number; maxPayload?: number },
): EioSocket => {
  const emitter = newEventBus<{}, {}, EioReservedEvents>()
  let pingTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  let pingIntervalTimer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const hb: HandshakeData = {
    sid: genEioId(),
    upgrades: [],
    pingInterval: opts?.pingInterval ?? 25000,
    pingTimeout: opts?.pingTimeout ?? 20000,
    maxPayload: opts?.maxPayload ?? 1000000,
  }

  const sendRaw = (encoded: string |  Uint8Array) => {
    if (closed) return
    try {
      ws.send(encoded)
    } catch {}
  }

  const sendOpen = () => {
    const raw = '0' + JSON.stringify(hb)
    sendRaw(raw)
  }

  const sendPing = () => {
    sendRaw('2')
    pingTimeoutTimer = setTimeout(() => {
      _close('ping timeout')
    }, hb.pingTimeout)
  }

  const scheduleNextPing = () => {
    if (closed) return
    if (pingTimeoutTimer) {
      clearTimeout(pingTimeoutTimer)
      pingTimeoutTimer = null
    }
    pingIntervalTimer = setTimeout(() => {
      sendPing()
    }, hb.pingInterval)
  }

  const startPingTimers = () => {
    clearTimers()
    scheduleNextPing()
  }

  const clearTimers = () => {
    if (pingIntervalTimer) {
      clearTimeout(pingIntervalTimer)
      pingIntervalTimer = null
    }
    if (pingTimeoutTimer) {
      clearTimeout(pingTimeoutTimer)
      pingTimeoutTimer = null
    }
  }

  const _close = (reason: string) => {
    if (closed) return
    closed = true
    clearTimers()
    try { sendRaw('1') } catch {}
    try { ws.close() } catch {}
    emitter.emitReserved('close', reason)
  }

  const handleData = (raw: any) => {
    if (closed) return

    if (raw instanceof Uint8Array || raw instanceof ArrayBuffer) {
      const uint8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
      emitter.emitReserved('message', { type: 'message', data: uint8 as Uint8Array<ArrayBuffer> })
      return
    }

    const str = toStr(raw)
    const type = str.charAt(0)

    switch (type) {
      case '2':
        sendRaw('3')
        scheduleNextPing()
        break
      case '3':
        scheduleNextPing()
        break
      case '4':
        emitter.emitReserved('message', { type: 'message', data: str.substring(1) })
        break
      case '1':
        _close('transport close')
        break
    }
  }

  const sendMessage = (payload: string) => {
    sendRaw('4' + payload)
  }

  const sendBinary = (payload:  Uint8Array) => {
    sendRaw(payload)
  }

  const eio: EioSocket = {
    ...emitter,
    id: hb.sid,
    sendOpen,
    sendMessage,
    sendBinary,
    startPingTimers,
    scheduleNextPing,
    handleData,
    close: _close,
    get closed() { return closed },
  }

  return eio
}
