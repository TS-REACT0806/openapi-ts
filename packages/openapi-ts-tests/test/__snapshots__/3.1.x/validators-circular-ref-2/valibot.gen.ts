// This file is auto-generated by @hey-api/openapi-ts

import * as v from 'valibot';

export const vBar: v.GenericSchema = v.object({
    bar: v.union([
        v.array(v.lazy(() => {
            return vBar;
        })),
        v.null()
    ])
});

export const vFoo: v.GenericSchema = v.object({
    foo: vBar
});