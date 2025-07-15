// H: Fix return type error on response/respond
// l::https://github.com/microsoft/TypeScript/pull/61359
// l: https://github.com/microsoft/TypeScript/issues/33912

import type { ServerWebSocket } from 'bun'
import { type WSContext } from 'hono/ws'
import type { Exact } from 'ts-essentials'
import { Decoder, Encoder } from 'cbor-x'
const encoder = new Encoder({ mapsAsObjects: false })
const decoder = new Decoder({ mapsAsObjects: false })
import { omitBy, isUndefined } from 'es-toolkit'

import { type Entries } from '@mdrv/m/v257'
type TwoTypesOfError = string | { cause?: any, message: string }

export class WSZ<
    Args extends Record<string, { a: any, s: any }>,
    All extends {
        ResultObject: {}
        ActionObject: {}
        YNA: { [K in keyof Args]: (
            y: (args?: any) => void,
            n: (args?: any) => void,
            args?: any
        ) => void },
    },
> {
    x: {
        [K in keyof Args]: {
            y: (w?: number) => (z?: Args[K]['s']) => void
            n: (w?: number) => (z: TwoTypesOfError) => void
        }
    }
    y: { [K in keyof Args]: (z?: Args[K]['s']) => void }
    ws: WSContext<ServerWebSocket<undefined>>

    constructor(
        eventKeys: ReadonlyArray<keyof Args>,
        ws: WSContext<ServerWebSocket<undefined>>,
    ) {
        this.ws = ws
        this.x = {} as any
        this.y = {} as any
        for (const x of eventKeys) {
            this.x[x] = {
                y: (w?: number) => (z: Args[typeof x]['s']) =>
                    this.sendX(omitBy({ w, x, y: true, z }, isUndefined)),
                n: (w?: number) => (z: TwoTypesOfError) => this.sendX(omitBy({ w, x, y: false, z: typeof z === 'string' ? { message: z } : z }, isUndefined)),
            }
            this.y[x] = ((z: Args[typeof x]['s']) =>
                z
                    ? this.sendX({ x, y: true, z } as any)
                    : this.sendX({ x, y: true } as any)
            )
        }
    }

    send(data: any): void {
        this.ws.send(data)
    }

    sendX(data: All['ResultObject']): void {
        let arrayBuffer = encoder.encode(data)
        this.ws.send(arrayBuffer)
    }

    getX(e: MessageEvent): All['ActionObject'] {
        return decoder.decode(
            new Uint8Array(e.data as ArrayBuffer),
        ) as All['ActionObject']
    }

    respond(e: MessageEvent) {
        const msg = this.getX(e) as {
            [P in keyof Args]: Args[P]['a'] extends never
            ? { w?: number; x: P }
            : { w?: number; x: P; args: Args[P]['a'] }
        }[keyof Args]
        const { x, w } = msg
        console.log(msg)
        return (
            arg: Partial<All["YNA"]>,
        ) => {
            return "args" in msg
                ? arg[x]?.(this.x[x].y(w), this.x[x].n(w), msg.args)
                : arg[x]?.(this.x[x].y(w), this.x[x].n(w))
        }
    }

    response(e: MessageEvent): {
        [K in keyof Args]: (
            arg: (...args: Parameters<All["YNA"][K]>) => void,
        ) => void
    } {
        const msg = this.getX(e) as {
            [P in keyof Args]: { w?: number, x: P; args: Args[P]['a'] }
        }[keyof Args]
        const { x, w, args } = msg
        return Object.fromEntries(
            (Object.entries(this.x) as Entries<typeof this.x>).map(([key, v]) => [
                key,
                (
                    f: All["YNA"][keyof Args],
                ) => {
                    if (msg.x === x)
                        args ? f(v.y(w), v.n(w), args) : f(v.y(w), v.n(w))
                },
            ]),
        ) as any
    }
}
