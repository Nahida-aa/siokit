import { Callback, EventNames, EventParams, EventsMap, ReservedOrUserEventNames, ReservedOrUserListener } from "./event";



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
