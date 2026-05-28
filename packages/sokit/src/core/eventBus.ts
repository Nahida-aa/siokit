/**
 * An events map is an interface that maps event names to their value, which
 * represents the type of the `on` listener.
 */
export interface EventsMap {
  [event: string]: any;
}
/**
 * The default events map, used if no EventsMap is given. Using this EventsMap
 * is equivalent to accepting all event names, and any data.
 */
export interface DefaultEventsMap {
  [event: string]: (...args: any[]) => void;
}

type Callback = (...args: any[]) => void;

/**
 * Returns a union type containing all the keys of an event map.
 */
export type EventNames<Map extends EventsMap> = keyof Map & (string | symbol);

/** The tuple type representing the parameters of an event listener */
export type EventParams<
	Map extends EventsMap,
	Ev extends EventNames<Map>,
> = Parameters<Map[Ev]>;

/**
 * The event names that are either in ReservedEvents or in UserEvents
 */
export type ReservedOrUserEventNames<
	ReservedEventsMap extends EventsMap,
	UserEvents extends EventsMap,
> = EventNames<ReservedEventsMap> | EventNames<UserEvents>;

/**
 * Type of a listener of a user event or a reserved event. If `Ev` is in
 * `ReservedEvents`, the reserved event listener is returned.
 */
export type ReservedOrUserListener<
	ReservedEvents extends EventsMap,
	UserEvents extends EventsMap,
	Ev extends ReservedOrUserEventNames<ReservedEvents, UserEvents>,
> = FallbackToUntypedListener<
	Ev extends EventNames<ReservedEvents>
		? ReservedEvents[Ev]
		: Ev extends EventNames<UserEvents>
			? UserEvents[Ev]
			: never
>;

/**
 * Returns an untyped listener type if `T` is `never`; otherwise, returns `T`.
 *
 * This is a hack to mitigate https://github.com/socketio/socket.io/issues/3833.
 * Needed because of https://github.com/microsoft/TypeScript/issues/41778
 */
type FallbackToUntypedListener<T> = [T] extends [never]
	? (...args: any[]) => void | Promise<void>
	: T;


export const newEventBus = <
	ListenEvents extends EventsMap,
	EmitEvents extends EventsMap,
	ReservedEvents extends EventsMap = {},
>() => {
	const handlers = new Map<string | symbol, Callback[]>();
	const bus =   {
		on<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
			event: Ev,
			fn: ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>,
		) {
			const list = handlers.get(event);
			if (list) list.push(fn);
			else handlers.set(event, [fn]);
		},
		off<Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
			event: Ev,
			fn?: ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>,
		) {
			if (!fn) {
				handlers.delete(event);
				return;
			}
			const list = handlers.get(event);
			if (!list) return;
			const i = list.indexOf(fn);
			if (i !== -1) list.splice(i, 1);
			if (list.length === 0) handlers.delete(event);
		},
		emit: <Ev extends EventNames<EmitEvents>>(
			event: Ev,
			...args: EventParams<EmitEvents, Ev>
		) =>
			handlers.get(event)?.forEach((fn) => {
				fn(...args);
			}),
		emitReserved: <Ev extends EventNames<ReservedEvents>>(
			event: Ev,
			...args: EventParams<ReservedEvents, Ev>
		) =>
			handlers.get(event)?.forEach((fn) => {
				fn(...args);
			}),
		listeners: <
			Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>,
		>(
			event: Ev,
		) =>
			(handlers.get(event) || []) as ReservedOrUserListener<
				ReservedEvents,
				ListenEvents,
				Ev
			>[],
    /**
     * Adds a one-time `listener` function as an event listener for `ev`.
     *
     * @param ev Name of the event
     * @param listener Callback function
     */
    once: <Ev extends ReservedOrUserEventNames<ReservedEvents, ListenEvents>>(
        ev: Ev,
        fn: ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>
    ) => {
			const wrapper = ((...args: any[]) => {
        bus.off(ev, wrapper)
        fn(...args)
      }) as ReservedOrUserListener<ReservedEvents, ListenEvents, Ev>
      (wrapper).fn = fn
      bus.on(ev, wrapper)
		}
	};
	return bus;
};
