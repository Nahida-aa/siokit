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

export type Callback = (...args: any[]) => void;

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

