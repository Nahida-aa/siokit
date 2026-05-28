import { describe, it, expect } from 'bun:test'
import { newEventBus } from '../../src/core/eventBus.ts'

describe('newEventBus', () => {
  it('on + emit fires handlers', () => {
    const bus = newEventBus<{ foo: (x: number) => void }, {}, {}>()
    let called = 0
    bus.on('foo', (x) => { called = x })
    bus.emit('foo', 42)
    expect(called).toBe(42)
  })

  it('multiple handlers for same event', () => {
    const bus = newEventBus<{ foo: (x: number) => void }, {}, {}>()
    const results: number[] = []
    bus.on('foo', (x) => results.push(x * 2))
    bus.on('foo', (x) => results.push(x * 3))
    bus.emit('foo', 5)
    expect(results).toEqual([10, 15])
  })

  it('off removes specific handler', () => {
    const bus = newEventBus<{ foo: () => void }, {}, {}>()
    let count = 0
    const fn = () => { count++ }
    bus.on('foo', fn)
    bus.emit('foo')
    expect(count).toBe(1)
    bus.off('foo', fn)
    bus.emit('foo')
    expect(count).toBe(1)
  })

  it('off without fn removes all handlers', () => {
    const bus = newEventBus<{ foo: () => void }, {}, {}>()
    let a = 0; let b = 0
    bus.on('foo', () => { a++ })
    bus.on('foo', () => { b++ })
    bus.off('foo')
    bus.emit('foo')
    expect(a).toBe(0)
    expect(b).toBe(0)
  })

  it('emitReserved for reserved events', () => {
    const bus = newEventBus<{}, {}, { reserved: (s: string) => void }>()
    let val = ''
    bus.on('reserved', (s) => { val = s })
    bus.emitReserved('reserved', 'hello')
    expect(val).toBe('hello')
  })

  it('once fires only once', () => {
    const bus = newEventBus<{ foo: () => void }, {}, {}>()
    let count = 0
    bus.once('foo', () => { count++ })
    bus.emit('foo')
    bus.emit('foo')
    expect(count).toBe(1)
  })

  it('listeners returns registered handlers', () => {
    const bus = newEventBus<{ foo: () => void }, {}, {}>()
    const fn = () => {}
    expect(bus.listeners('foo')).toEqual([])
    bus.on('foo', fn)
    expect(bus.listeners('foo')).toEqual([fn])
  })

  it('emit with no handlers does not throw', () => {
    const bus = newEventBus<{ foo: () => void }, {}, {}>()
    expect(() => bus.emit('foo')).not.toThrow()
  })
})
