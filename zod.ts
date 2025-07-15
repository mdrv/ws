import { z } from 'zod/v4'

export function create() { }
type BasicShape = Record<string, z.ZodObject<{ a: z.ZodSchema, s: z.ZodSchema }>>

create.ActionHandlers = <Shape extends BasicShape>(E: z.ZodObject<Shape>) =>
    z.transform((handlers) => {
        return handlers as {
            [K in keyof Shape]: z.infer<Shape[K]>['a'] extends never
            ? () => void
            : (args: z.infer<Shape[K]>['a']) => void
        }
    })

create.SuccessHandlers = <Shape extends BasicShape>(E: z.ZodObject<Shape>) =>
    z.transform((handlers) => {
        return handlers as {
            [K in keyof Shape]: z.infer<Shape[K]>['s'] extends never
            ? () => void
            : (args: z.infer<Shape[K]>['s']) => void
        }
    })

create.ActionObject = <Shape extends BasicShape>(E: z.ZodObject<Shape>) =>
    z.transform((handlers) => {
        return handlers as {
            [K in keyof Shape]: z.infer<Shape[K]>['a'] extends never
            ? {
                w?: number
                x: K
            }
            : {
                w?: number
                x: K
                args: z.infer<Shape[K]>['a']
            }
        }[keyof Shape]
    })

create.SuccessObject = <Shape extends BasicShape>(E: z.ZodObject<Shape>) =>
    z.transform((handlers) => {
        return handlers as {
            [K in keyof Shape]: z.infer<Shape[K]>['s'] extends never
            ? {
                w?: number
                x: K
                y: true
            }
            : {
                w?: number
                x: K
                y: true
                z: z.infer<Shape[K]>['s']
            }
        }[keyof Shape]
    })

type TwoTypesOfError = string | { cause?: any, message: string }
create.YNA = <Shape extends BasicShape>(E: z.ZodObject<Shape>) =>
    z.transform((handlers) => {
        return handlers as {
            [K in keyof Shape]: z.infer<Shape[K]>['a'] extends never
            ? (
                y: z.infer<Shape[K]>['s'] extends never
                    ? () => void
                    : (args: z.infer<Shape[K]>['s']) => void,
                n: (z: TwoTypesOfError) => void,
            ) => void
            : (
                y: z.infer<Shape[K]>['s'] extends never
                    ? () => void
                    : (args: z.infer<Shape[K]>['s']) => void,
                n: (z: TwoTypesOfError) => void,
                args: z.infer<Shape[K]>['a']
            ) => void
        }
    })

create.ErrorObject = <Shape extends BasicShape>(E: z.ZodObject<Shape>) => {
    return z.object({
        w: z.optional(z.number()),
        x: E.keyof(),
        y: z.literal(false),
        z: z.object({
            cause: z.optional(z.any()),
            message: z.string(),
        })
    })
}

create.ResultObject = <Shape extends BasicShape>(E: z.ZodObject<Shape>) => {
    const SuccessObject = create.SuccessObject(E)
    const ErrorObject = create.ErrorObject(E)
    return z.union([SuccessObject, ErrorObject])
}

create.all = <Shape extends BasicShape>(E: z.ZodObject<Shape, z.core.$strict>) => {
    return z.object({
        // Keys: E.keyof(),
        Args: E,
        // ActionHandlers: create.ActionHandlers(E),
        // SuccessHandlers: create.SuccessHandlers(E),
        ActionObject: create.ActionObject(E),
        ResultObject: create.ResultObject(E),
        YNA: create.YNA(E),
    })
}
