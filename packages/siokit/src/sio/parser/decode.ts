import { newEventBus } from '../../core/eventBus.ts'
import { PacketType, type SioPacket } from './shared.ts'
import { reconstructPacket } from './binary.ts'
import { isBinary } from './is-binary.ts'

const RESERVED_EVENTS = [
  'connect', 'connect_error', 'disconnect', 'disconnecting',
  'newListener', 'removeListener',
]

const isInteger = Number.isInteger || ((value: any) =>
  typeof value === 'number' && isFinite(value) && Math.floor(value) === value)

function isObject(value: any): boolean {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function isAckIdValid(id: unknown) {
  return id === undefined || isInteger(id)
}

function isPayloadValid(type: PacketType, payload: any): boolean {
  switch (type) {
    case PacketType.CONNECT:
      return isObject(payload)
    case PacketType.DISCONNECT:
      return payload === undefined
    case PacketType.CONNECT_ERROR:
      return typeof payload === 'string' || isObject(payload)
    case PacketType.EVENT:
    case PacketType.BINARY_EVENT:
      return (
        Array.isArray(payload) &&
        (typeof payload[0] === 'number' ||
          (typeof payload[0] === 'string' &&
            RESERVED_EVENTS.indexOf(payload[0]) === -1))
      )
    case PacketType.ACK:
    case PacketType.BINARY_ACK:
      return Array.isArray(payload)
  }
}

const newBinaryReconstructor = (packet: SioPacket) => {
  let reconPack: SioPacket | null = packet
  const buffers: Array<Uint8Array | ArrayBuffer> = []

  const takeBinaryData = (binData: Uint8Array | ArrayBuffer): SioPacket | null => {
    buffers.push(binData)
    if (buffers.length === reconPack?.attachments) {
      const p = reconstructPacket(reconPack, buffers)
      finishedReconstruction()
      return p
    }
    return null
  }

  const finishedReconstruction = () => {
    reconPack = null
    buffers.length = 0
  }

  return { takeBinaryData, finishedReconstruction }
}

export interface DecoderOptions {
  reviver?: ((this: any, key: string, value: any) => any) | undefined
  maxAttachments?: number
}

const decodeString = (str: string, opts?: DecoderOptions): SioPacket => {
  let i = 0
  const p: SioPacket = { type: Number(str.charAt(0)) }

  if (PacketType[p.type] === undefined) {
    throw new Error('unknown packet type ' + p.type)
  }

  if (p.type === PacketType.BINARY_EVENT || p.type === PacketType.BINARY_ACK) {
    const start = i + 1
    while (str.charAt(++i) !== '-' && i < str.length) {}
    const buf = str.substring(start, i)
    // @ts-expect-error
    if (buf != Number(buf) || str.charAt(i) !== '-') {
      throw new Error('Illegal attachments')
    }
    const n = Number(buf)
    if (!isInteger(n) || n < 0) {
      throw new Error('Illegal attachments')
    }
    if (n > (opts?.maxAttachments ?? 10)) {
      throw new Error('too many attachments')
    }
    p.attachments = n
  }

  if (str.charAt(i + 1) === '/') {
    const start = i + 1
    while (++i) {
      const c = str.charAt(i)
      if (c === ',' || i === str.length) break
    }
    p.nsp = str.substring(start, i)
  } else {
    p.nsp = '/'
  }

  const next = str.charAt(i + 1)
  // @ts-expect-error
  if (next !== '' && Number(next) == next) {
    const start = i + 1
    while (++i) {
      const c = str.charAt(i)
      // @ts-expect-error
      if (c == null || Number(c) != c) {
        --i
        break
      }
      if (i === str.length) break
    }
    p.id = Number(str.substring(start, i + 1))
  }

  if (str.charAt(++i)) {
    try {
      const payload = JSON.parse(str.substring(i), opts?.reviver)
      if (isPayloadValid(p.type, payload)) {
        p.data = payload
      } else {
        throw new Error('invalid payload')
      }
    } catch (e: any) {
      throw new Error('invalid payload')
    }
  }

  return p
}

export const decodeSioPacket = decodeString

export const newDecoder = (opts?: DecoderOptions | ((this: any, key: string, value: any) => any)) => {
  const bus = newEventBus<{}, {}, { decoded: (packet: SioPacket) => void }>()
  let reconstructor: ReturnType<typeof newBinaryReconstructor> | null = null
  const resolvedOpts: DecoderOptions = Object.assign(
    { reviver: undefined, maxAttachments: 10 },
    typeof opts === 'function' ? { reviver: opts } : opts,
  )

  const add = (obj: any) => {
    if (typeof obj === 'string') {
      if (reconstructor) {
        throw new Error('got plaintext data when reconstructing a packet')
      }
      const packet = decodeString(obj, resolvedOpts)
      const isBinaryEvent = packet.type === PacketType.BINARY_EVENT
      if (isBinaryEvent || packet.type === PacketType.BINARY_ACK) {
        packet.type = isBinaryEvent ? PacketType.EVENT : PacketType.ACK
        reconstructor = newBinaryReconstructor(packet)
        if (packet.attachments === 0) {
          bus.emitReserved('decoded', packet)
        }
      } else {
        bus.emitReserved('decoded', packet)
      }
    } else if (isBinary(obj) || obj.base64) {
      if (!reconstructor) {
        throw new Error('got binary data when not reconstructing a packet')
      }
      const p = reconstructor.takeBinaryData(obj)
      if (p) {
        reconstructor = null
        bus.emitReserved('decoded', p)
      }
    } else {
      throw new Error('Unknown type: ' + obj)
    }
  }

  const destroy = () => {
    if (reconstructor) {
      reconstructor.finishedReconstruction()
      reconstructor = null
    }
  }

  return { ...bus, add, destroy }
}
