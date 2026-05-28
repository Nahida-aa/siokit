import { describe, it, expect } from 'bun:test'
import { isBinary, hasBinary } from '../../src/sio/parser/is-binary.ts'

describe('isBinary', () => {
  it('returns true for Uint8Array', () => {
    expect(isBinary(new Uint8Array([1]))).toBe(true)
  })

  it('returns true for ArrayBuffer', () => {
    expect(isBinary(new ArrayBuffer(1))).toBe(true)
  })

  it('returns false for plain object', () => {
    expect(isBinary({})).toBe(false)
  })

  it('returns false for string', () => {
    expect(isBinary('hello')).toBe(false)
  })

  it('returns false for number', () => {
    expect(isBinary(42)).toBe(false)
  })
})

describe('hasBinary (is-binary module)', () => {
  it('returns false for non-object', () => {
    expect(hasBinary(null)).toBe(false)
    expect(hasBinary(undefined)).toBe(false)
    expect(hasBinary('str')).toBe(false)
  })

  it('returns true for Uint8Array', () => {
    expect(hasBinary(new Uint8Array([1]))).toBe(true)
  })

  it('returns true if property is binary', () => {
    expect(hasBinary({ data: new Uint8Array([1]) })).toBe(true)
  })

  it('returns false if no binary in nested object', () => {
    expect(hasBinary({ a: { b: { c: 'text' } } })).toBe(false)
  })
})
