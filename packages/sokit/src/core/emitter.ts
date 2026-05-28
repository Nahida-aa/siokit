import type { EventsMap, EventNames, EventParams } from './eventBus.ts'

type Callback = (...args: any[]) => void

export const createEmitter = <
  ListenEvents extends EventsMap = EventsMap,
  EmitEvents extends EventsMap = ListenEvents,
  ReservedEvents extends EventsMap = {},
>() => {
  const handlers = new Map<string | symbol, Callback[]>()

  const bus = {
    on<Ev extends (keyof ListenEvents | keyof ReservedEvents) & (string | symbol)>(
      event: Ev,
      fn: (...args: any[]) => void,
    ) {
      const list = handlers.get(event)
      if (list) list.push(fn as Callback)
      else handlers.set(event, [fn as Callback])
      return bus
    },

    once<Ev extends (keyof ListenEvents | keyof ReservedEvents) & (string | symbol)>(
      event: Ev,
      fn: (...args: any[]) => void,
    ) {
      const wrapper = (...args: any[]) => {
        bus.off(event, wrapper)
        fn(...args)
      }
      ;(wrapper as any).fn = fn
      bus.on(event, wrapper)
      return bus
    },

    off<Ev extends (keyof ListenEvents | keyof ReservedEvents) & (string | symbol)>(
      event?: Ev,
      fn?: (...args: any[]) => void,
    ) {
      if (!event) {
        handlers.clear()
        return bus
      }
      if (!fn) {
        handlers.delete(event)
        return bus
      }
      const list = handlers.get(event)
      if (!list) return bus
      const idx = list.indexOf(fn as Callback)
      if (idx !== -1) list.splice(idx, 1)
      if ((list as Callback[]).length === 0) handlers.delete(event)
      return bus
    },

    emit<Ev extends EventNames<EmitEvents>>(event: Ev, ...args: EventParams<EmitEvents, Ev>) {
      handlers.get(event)?.forEach((fn) => fn(...args))
      return bus
    },

    emitReserved<Ev extends EventNames<ReservedEvents>>(event: Ev, ...args: EventParams<ReservedEvents, Ev>) {
      handlers.get(event)?.forEach((fn) => fn(...args))
      return bus
    },

    listeners<Ev extends (keyof ListenEvents | keyof ReservedEvents) & (string | symbol)>(
      event: Ev,
    ) {
      return (handlers.get(event) || []) as ((...args: any[]) => void)[]
    },
  }

  return bus
}
