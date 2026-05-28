import { EventNames, EventsMap } from "../core/eventBus";

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