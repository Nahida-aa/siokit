import { describe, it, expect } from 'bun:test'
import { newDecoder } from '../../src/sio/parser/decode.ts'
import { PacketType } from '../../src/sio/parser/shared.ts'

describe('newDecoder', () => {
  it('decodes a plain EVENT string and emits decoded', () => {
    const decoder = newDecoder()
    let packet: any = null
    decoder.on('decoded', (p) => { packet = p })
    decoder.add('2["hello"]')
    expect(packet).not.toBeNull()
    expect(packet!.type).toBe(PacketType.EVENT)
    expect(packet!.data).toEqual(['hello'])
  })

  it('decodes BINARY_EVENT with 0 attachments as EVENT immediately', () => {
    const decoder = newDecoder()
    let packet: any = null
    decoder.on('decoded', (p) => { packet = p })
    decoder.add('50-["no-binary"]')
    expect(packet).not.toBeNull()
    expect(packet!.type).toBe(PacketType.EVENT)
    expect(packet!.data).toEqual(['no-binary'])
  })

  it('accumulates binary data and emits reconstructed packet', () => {
    const decoder = newDecoder()
    const results: any[] = []
    decoder.on('decoded', (p) => results.push(p))
    decoder.add('52-["msg",{"_placeholder":true,"num":0},{"_placeholder":true,"num":1}]')
    expect(results).toHaveLength(0)
    decoder.add(new Uint8Array([10, 20]))
    expect(results).toHaveLength(0)
    decoder.add(new Uint8Array([30, 40]))
    expect(results).toHaveLength(1)
    const p = results[0]!
    expect(p.type).toBe(PacketType.EVENT)
    expect(p.data).toEqual(['msg', new Uint8Array([10, 20]), new Uint8Array([30, 40])])
    expect(p.attachments).toBeUndefined()
  })

  it('throws on string data while reconstructing binary', () => {
    const decoder = newDecoder()
    decoder.add('52-["x",{"_placeholder":true,"num":0}]')
    expect(() => decoder.add('2["bad"]')).toThrow()
  })

  it('throws on binary data when not reconstructing', () => {
    const decoder = newDecoder()
    expect(() => decoder.add(new Uint8Array([1, 2, 3]))).toThrow()
  })

  it('destroy clears pending reconstructor', () => {
    const decoder = newDecoder()
    decoder.add('51-["x",{"_placeholder":true,"num":0}]')
    decoder.destroy()
    expect(() => decoder.add(new Uint8Array([1]))).toThrow()
  })

  it('accepts reviver option', () => {
    const decoder = newDecoder((key, value) =>
      typeof value === 'string' ? value.toUpperCase() : value,
    )
    let packet: any = null
    decoder.on('decoded', (p) => { packet = p })
    decoder.add('2["hello"]')
    expect(packet!.data).toEqual(['HELLO'])
  })
})
