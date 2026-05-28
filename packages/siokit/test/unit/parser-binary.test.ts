import { describe, it, expect } from 'bun:test'
import { hasBinary, extractBinaries, replacePlaceholders, encodeSioPacketBinary, reconstructPacket } from 'siokit-parser'
import { PacketType } from 'siokit-parser'
import type { SioPacket } from 'siokit-parser'

describe('hasBinary', () => {
  it('returns true for Uint8Array', () => {
    expect(hasBinary(new Uint8Array([1, 2, 3]))).toBe(true)
  })

  it('returns true for ArrayBuffer', () => {
    expect(hasBinary(new ArrayBuffer(4))).toBe(true)
  })

  it('returns false for plain objects', () => {
    expect(hasBinary({ a: 1 })).toBe(false)
  })

  it('returns false for null', () => {
    expect(hasBinary(null)).toBe(false)
  })

  it('returns true for nested binary in object', () => {
    expect(hasBinary({ name: 'test', data: new Uint8Array([1]) })).toBe(true)
  })

  it('returns true for binary in array', () => {
    expect(hasBinary([1, 'two', new Uint8Array([3])])).toBe(true)
  })

  it('returns false for empty array', () => {
    expect(hasBinary([])).toBe(false)
  })
})

describe('extractBinaries + replacePlaceholders roundtrip', () => {
  it('replaces Uint8Array with placeholder', () => {
    const bins: Uint8Array[] = []
    const result = extractBinaries(new Uint8Array([10, 20]), bins)
    expect(bins).toHaveLength(1)
    expect(result).toEqual({ _placeholder: true, num: 0 })
  })

  it('handles nested structure', () => {
    const bins: Uint8Array[] = []
    const data = { msg: 'hi', buf: new Uint8Array([1, 2]), extra: [new Uint8Array([3])] }
    const extracted = extractBinaries(data, bins)
    expect(bins).toHaveLength(2)
    expect(extracted).toEqual({
      msg: 'hi',
      buf: { _placeholder: true, num: 0 },
      extra: [{ _placeholder: true, num: 1 }],
    })
    const restored = replacePlaceholders(extracted, bins)
    expect(restored).toEqual(data)
  })

  it('restores array of binaries', () => {
    const data = [new Uint8Array([1]), new Uint8Array([2])]
    const bins: Uint8Array[] = []
    const extracted = extractBinaries(data, bins)
    const restored = replacePlaceholders(extracted, [bins[0]!, bins[1]!])
    expect(restored).toEqual([new Uint8Array([1]), new Uint8Array([2])])
  })

  it('extractBinaries with ArrayBuffer', () => {
    const bins: Uint8Array[] = []
    const result = extractBinaries(new ArrayBuffer(4), bins)
    expect(bins).toHaveLength(1)
    expect(bins[0] instanceof Uint8Array).toBe(true)
    expect(bins[0]!.byteLength).toBe(4)
    expect(result).toEqual({ _placeholder: true, num: 0 })
  })

  it('extractBinaries passes non-binary values through', () => {
    const bins: Uint8Array[] = []
    expect(extractBinaries(42, bins)).toBe(42)
    expect(extractBinaries('hello', bins)).toBe('hello')
    expect(extractBinaries(null, bins)).toBe(null)
    expect(bins).toHaveLength(0)
  })

  it('replacePlaceholders with invalid index returns original', () => {
    const result = replacePlaceholders({ _placeholder: true, num: 99 }, [new Uint8Array([1])])
    expect(result).toEqual({ _placeholder: true, num: 99 })
  })
})

describe('encodeSioPacketBinary', () => {
  it('returns null for non-binary packet', () => {
    const p: SioPacket = { type: PacketType.EVENT, data: ['hello'] }
    expect(encodeSioPacketBinary(p)).toBeNull()
  })

  it('encodes binary packet with attachments', () => {
    const p: SioPacket = { type: PacketType.EVENT, data: ['msg', new Uint8Array([10])] }
    const result = encodeSioPacketBinary(p)
    expect(result).not.toBeNull()
    expect(result!.attachments).toHaveLength(1)
    expect(result!.attachments[0]).toEqual(new Uint8Array([10]))
    expect(result!.text).toMatch(/^5/)
    expect(result!.text).toMatch(/-/)
    expect(result!.text).toContain('"msg"')
  })
})

describe('reconstructPacket', () => {
  it('replaces placeholders with buffers and removes attachments', () => {
    const p: SioPacket = {
      type: PacketType.EVENT,
      data: ['result', { _placeholder: true, num: 0 }],
      attachments: 1,
    }
    const buffers = [new Uint8Array([99, 100])]
    const reconstructed = reconstructPacket(p, buffers)
    expect(reconstructed.data).toEqual(['result', new Uint8Array([99, 100])])
    expect(reconstructed.attachments).toBeUndefined()
  })
})
