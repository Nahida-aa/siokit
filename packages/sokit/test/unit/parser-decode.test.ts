import { describe, it, expect } from 'bun:test'
import { decodeSioPacket } from '../../src/sio/parser/decode.ts'
import { PacketType } from '../../src/sio/parser/shared.ts'

describe('decodeSioPacket', () => {
  it('CONNECT', () => {
    const p = decodeSioPacket('0{"sid":"abc"}')
    expect(p.type).toBe(PacketType.CONNECT)
    expect(p.data).toEqual({ sid: 'abc' })
    expect(p.nsp).toBe('/')
  })

  it('CONNECT with nsp', () => {
    const p = decodeSioPacket('0/admin,{"sid":"x"}')
    expect(p.type).toBe(PacketType.CONNECT)
    expect(p.nsp).toBe('/admin')
    expect(p.data).toEqual({ sid: 'x' })
  })

  it('DISCONNECT', () => {
    const p = decodeSioPacket('1')
    expect(p.type).toBe(PacketType.DISCONNECT)
    expect(p.data).toBeUndefined()
  })

  it('EVENT', () => {
    const p = decodeSioPacket('2["hello","world"]')
    expect(p.type).toBe(PacketType.EVENT)
    expect(p.data).toEqual(['hello', 'world'])
  })

  it('EVENT with nsp and id', () => {
    const p = decodeSioPacket('2/admin,5["ping"]')
    expect(p.type).toBe(PacketType.EVENT)
    expect(p.nsp).toBe('/admin')
    expect(p.id).toBe(5)
    expect(p.data).toEqual(['ping'])
  })

  it('ACK', () => {
    const p = decodeSioPacket('31["ok"]')
    expect(p.type).toBe(PacketType.ACK)
    expect(p.id).toBe(1)
    expect(p.data).toEqual(['ok'])
  })

  it('BINARY_EVENT', () => {
    const p = decodeSioPacket('52-["binary",{"_placeholder":true,"num":0}]')
    expect(p.type).toBe(PacketType.BINARY_EVENT)
    expect(p.attachments).toBe(2)
    expect(p.data).toEqual(['binary', { _placeholder: true, num: 0 }])
  })

  it('BINARY_ACK with id', () => {
    const p = decodeSioPacket('63-3[{"_placeholder":true,"num":0}]')
    expect(p.type).toBe(PacketType.BINARY_ACK)
    expect(p.attachments).toBe(3)
    expect(p.id).toBe(3)
  })

  it('CONNECT_ERROR', () => {
    const p = decodeSioPacket('4{"message":"bad"}')
    expect(p.type).toBe(PacketType.CONNECT_ERROR)
    expect(p.data).toEqual({ message: 'bad' })
  })

  it('EVENT with id 0', () => {
    const p = decodeSioPacket('20[0,"test"]')
    expect(p.type).toBe(PacketType.EVENT)
    expect(p.id).toBe(0)
    expect(p.data).toEqual([0, 'test'])
  })

  it('throws for unknown type', () => {
    expect(() => decodeSioPacket('9{}')).toThrow()
  })

  it('throws for invalid payload', () => {
    expect(() => decodeSioPacket('2"not array"')).toThrow()
  })

  it('throws for too many attachments', () => {
    expect(() => decodeSioPacket('511-{}', { maxAttachments: 10 })).toThrow()
  })
})
