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


/**
 * Returns a boolean for whether the given type is `any`.
 *
 * @link https://stackoverflow.com/a/49928360/1490091
 *
 * Useful in type utilities, such as disallowing `any`s to be passed to a function.
 *
 * @author sindresorhus
 * @link https://github.com/sindresorhus/type-fest
 */
type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * An if-else-like type that resolves depending on whether the given type is `any`.
 *
 * @see {@link IsAny}
 *
 * @author sindresorhus
 * @link https://github.com/sindresorhus/type-fest
 */
type IfAny<T, TypeIfAny = true, TypeIfNotAny = false> =
  IsAny<T> extends true ? TypeIfAny : TypeIfNotAny;

/**
 * Extracts the type of the last element of an array.
 *
 * Use-case: Defining the return type of functions that extract the last element of an array, for example [`lodash.last`](https://lodash.com/docs/4.17.15#last).
 *
 * @author sindresorhus
 * @link https://github.com/sindresorhus/type-fest
 */
export type Last<ValueType extends readonly unknown[]> =
  ValueType extends readonly [infer ElementType]
    ? ElementType
    : ValueType extends readonly [infer _, ...infer Tail]
      ? Last<Tail>
      : ValueType extends ReadonlyArray<infer ElementType>
        ? ElementType
        : never;

/**
 * Returns a union type containing all the keys of an event map that have an acknowledgement callback.
 */
export type EventNamesWithAck<
  Map extends EventsMap,
  K extends EventNames<Map> = EventNames<Map>,
> = IfAny<
  Last<Parameters<Map[K]>> | Map[K],
  K,
  K extends (
    Parameters<Map[K]> extends never[]
      ? never
      : Last<Parameters<Map[K]>> extends (...args: any[]) => any
        ? K
        : never
  )
    ? K
    : never
>;

export type AllButLast<T extends any[]> = T extends [...infer H, infer L]
  ? H
  : any[];

export type FirstNonErrorArg<T> = T extends (...args: infer Params) => any
  ? FirstNonErrorTuple<Params>
  : any;
export type FirstNonErrorTuple<T extends unknown[]> = T[0] extends Error
  ? T[1]
  : T[0];