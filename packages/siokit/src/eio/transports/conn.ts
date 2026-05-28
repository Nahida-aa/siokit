import { newEventBus } from 'siokit-core'
import { newDecoder } from 'siokit-parser'
import { PACKET_TYPES, PacketType, PacketTypes, type Packet } from '../parser/shared.ts'
import type { HandshakeData } from '../type.ts'

type EioReservedEvents = {
  message: (packet: Packet) => void
  close: (reason: string) => void
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

export type SendRawFn = (data: string | Uint8Array) => void

export const newConn = (
  sendRaw: SendRawFn,
  opts?: { pingInterval?: number; pingTimeout?: number; maxPayload?: number },
) => {
  const decoder = newDecoder()
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

  const safeSend = (encoded: string | Uint8Array) => {
    if (closed) return
    try { sendRaw(encoded) } catch {}
  }

  const sendOpen = () => {
    safeSend('0' + JSON.stringify(hb))
  }

  const sendPing = () => {
    safeSend('2')
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
    try { safeSend(PACKET_TYPES.close) } catch {}
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
    const type = str.charAt(0) as keyof PacketTypes

    switch (type) {
      case PACKET_TYPES.ping:
        safeSend(PACKET_TYPES.pong)
        scheduleNextPing()
        break
      case PACKET_TYPES.pong:
        scheduleNextPing()
        break
      case PACKET_TYPES.message:
        emitter.emitReserved('message', { type: 'message', data: str.substring(1) })
        break
      case PACKET_TYPES.close:
        _close('transport close')
        break
    }
  }

  const sendMessage = (payload: string) => {
    safeSend(PACKET_TYPES.message + payload)
  }

  const sendBinary = (payload: Uint8Array) => {
    safeSend(payload)
  }

  return {
    ...emitter,
    decoder,
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
}

export const initTransport = (conn: Conn) => {
  conn.sendOpen()
  conn.startPingTimers()
}

export type Conn = ReturnType<typeof newConn>
