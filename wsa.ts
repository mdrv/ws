import { WS, type Options } from './ws.ts'
import { Decoder, Encoder } from 'cbor-x'
const encoder = new Encoder()
const decoder = new Decoder({ mapsAsObjects: true })

import { type GConstructor } from '@mdrv/m/v257'
import Cookies from 'js-cookie'
import { invariant } from 'es-toolkit'

export const WsWithAction = <T>(
    eventKeys: T[],
) => <
    Args extends Record<string, { a: any, s: any }>,
    All extends {
        ResultObject: {}
        ActionObject: {}
    },
>() => {
        return function <TBase extends GConstructor<WS>>(Base: TBase) {
            return class WSA extends Base {
                x: { [K in keyof Args]: (args?: Args[K]['a']) => void }
                w: { [K in keyof Args]: (args?: Args[K]['a']) => Promise<{ w?: number, x: K } & (Args[K]['s'] extends never ? { y: true } : { y: true, z: Args[K]['s'] } | { y: false, z: { cause?: any, message: string } })> }
                constructor(...args: any[]) {
                    // should be opt-in
                    invariant(Cookies.get('browser_id'), 'Must have browser_id')
                    invariant(Cookies.get('audio_fp'), 'Must have browser_id')
                    super(...args)
                    this.binaryType = 'arraybuffer'
                    this.x = {} as any
                    this.w = {} as any
                    eventKeys.forEach((x) => {
                        const eventKey = x as keyof Args
                        this.x[eventKey] = ((args: Args[typeof eventKey]['a']): void => {
                            if (!args) {
                                this.sendX({ x: eventKey } as any)
                            } else {
                                this.sendX({ x: eventKey, args } as any)
                            }
                        })
                        this.w[eventKey] = ((args: Args[typeof eventKey]['a']) => {
                            if (!args) {
                                return this.sendW({ x: eventKey } as any)
                            } else {
                                return this.sendW({ x: eventKey, args } as any)
                            }
                        })
                    })
                }

                sendX(data: All['ActionObject']): void {
                    let arrayBuffer = encoder.encode(data)
                    super.send(arrayBuffer)
                }

                // i: AI prompt: I want T to pick up the value of property x so it can narrow the type of U based on T.x
                sendW<X extends keyof Args>(
                    data: All['ActionObject'] & { x: X },
                ): Promise<{ w?: number, x: X } & (Args[X]['s'] extends never ? { y: true } : { y: true, z: Args[X]['s'] } | { y: false, z: { cause?: any, message: string } })> {
                    if (!data) throw 'data is not object'
                    const _x = 'x'
                    if (!data?.[_x]) throw 'x is not defined'
                    const x = data[_x]
                    const w = Date.now()
                    const dataX = { ...data, w }
                    let arrayBuffer = encoder.encode(dataX)
                    return new Promise((resolve, reject) => {
                        try {
                            const onmessage = (e: any) => {
                                // console.log(e)
                                const msg = this.getX(e)
                                // console.log(msg)
                                if (!msg) throw 'msg is not object'
                                const { w: ww, x: xx } = msg as Record<string, any>
                                if (xx === x && ww === w) {
                                    // console.log("MATCH: ", msg)
                                    super.removeEventListener('message', onmessage)
                                    resolve(msg as { w?: number, x: X } & (Args[X]['s'] extends never ? { y: true } : { y: true, z: Args[X]['s'] } | { y: false, z: { cause?: any, message: string } }))
                                }
                            }
                            super.addEventListener('message', onmessage)
                            super.send(arrayBuffer)
                        } catch (err) {
                            reject(err)
                        }
                    })
                }

                getX(e: MessageEvent): All['ResultObject'] {
                    return decoder.decode(
                        new Uint8Array(e.data as ArrayBuffer),
                    ) as All['ResultObject']
                }
            }
        }
    }
