import { describe, it, expect } from 'bun:test'
import { encodeSioPacket } from '../../src/sio/parser/encode.ts'
import { PacketType } from '../../src/sio/parser/shared.ts'

describe('encodeSioPacket', () => {
  it('CONNECT', () => {
    const result = encodeSioPacket({ type: PacketType.CONNECT, data: { sid: 'abc' } })
    expect(result).toBe('0{"sid":"abc"}')
  })

  it('CONNECT with nsp', () => {
    const result = encodeSioPacket({ type: PacketType.CONNECT, nsp: '/admin', data: { sid: 'x' } })
    expect(result).toBe('0/admin,{"sid":"x"}')
  })

  it('DISCONNECT', () => {
    const result = encodeSioPacket({ type: PacketType.DISCONNECT })
    expect(result).toBe('1')
  })

  it('EVENT', () => {
    const result = encodeSioPacket({ type: PacketType.EVENT, data: ['hello', 'world'] })
    expect(result).toBe('2["hello","world"]')
  })

  it('EVENT with nsp and id', () => {
    const result = encodeSioPacket({ type: PacketType.EVENT, nsp: '/admin', id: 5, data: ['ping'] })
    expect(result).toBe('2/admin,5["ping"]')
  })

  it('ACK', () => {
    const result = encodeSioPacket({ type: PacketType.ACK, id: 1, data: ['ok'] })
    expect(result).toBe('31["ok"]')
  })

  it('BINARY_EVENT', () => {
    const result = encodeSioPacket({ type: PacketType.BINARY_EVENT, attachments: 2, data: ['binary', { _placeholder: true, num: 0 }] })
    expect(result).toBe('52-["binary",{"_placeholder":true,"num":0}]')
  })

  it('BINARY_ACK', () => {
    const result = encodeSioPacket({ type: PacketType.BINARY_ACK, id: 3, attachments: 1, data: [{ _placeholder: true, num: 0 }] })
    expect(result).toBe('63-3[{"_placeholder":true,"num":0}]')
  })

  it('CONNECT_ERROR', () => {
    const result = encodeSioPacket({ type: PacketType.CONNECT_ERROR, data: { message: 'bad' } })
    expect(result).toBe('4{"message":"bad"}')
  })

  it('EVENT data as number', () => {
    const result = encodeSioPacket({ type: PacketType.EVENT, id: 0, data: [0, 'test'] })
    expect(result).toBe('20[0,"test"]')
  })
})
