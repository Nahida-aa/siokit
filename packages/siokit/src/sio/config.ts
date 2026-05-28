import { CorsOptions, CorsOptionsDelegate } from "cors";
import { TransportName } from "../eio/transports";

export interface ServerOptions {
  /**
   * how many ms without a pong packet to consider the connection closed
   * @default 20000
   */
  pingTimeout?: number;
  /**
   * how many ms before sending a new ping packet
   * @default 25000
   */
  pingInterval?: number;
  /**
   * how many ms before an uncompleted transport upgrade is cancelled
   * @default 10000
   */
  upgradeTimeout?: number;
    /**
   * how many bytes or characters a message can be, before closing the session (to avoid DoS).
   * @default 1e5 (1000 KB)
   */
  maxHttpBufferSize?: number;
    /**
   * The low-level transports that are enabled. WebTransport is disabled by default and must be manually enabled:
   *
   * @example
   * new Server({
   *   transports: ["polling", "websocket", "webtransport"]
   * });
   *
   * @default ["polling", "websocket"]
   */
  transports?: TransportName[];
  /**
   * whether to allow transport upgrades
   * @default true
   */
  allowUpgrades?: boolean;
  /**
   * parameters of the WebSocket permessage-deflate extension (see ws module api docs). Set to false to disable.
   * @default false
   */
  perMessageDeflate?: boolean
    /**
   * an optional packet which will be concatenated to the handshake packet emitted by Engine.IO.
   */
  initialPacket?: any;
    /**
   * the options that will be forwarded to the cors module
   */
  cors?: CorsOptions | CorsOptionsDelegate;
    /**
   * parameters of the http compression for the polling transports (see zlib api docs). Set to false to disable.
   * @default true
   */
  httpCompression?: boolean | object;
    /**
   * name of the path to capture
   * @default "/io"
   */
  path?: string;
}
export const serverOptions = (opts?:ServerOptions) => ({
  pingTimeout: opts?.pingTimeout ?? 20000,
  pingInterval: opts?.pingInterval ?? 25000,
  upgradeTimeout: opts?.upgradeTimeout ?? 10000, 
  maxHttpBufferSize: opts?.maxHttpBufferSize ?? 1e6, // 1000000
  transports: opts?.transports ?? ["polling", "websocket"],
  allowUpgrades: true,
  httpCompression: {
    threshold: 1024,
  },
  path: "/io",
  ...opts,
} satisfies ServerOptions)