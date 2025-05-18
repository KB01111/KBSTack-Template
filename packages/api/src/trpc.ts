import { initTRPC } from '@trpc/server';
import { OpenApiMeta } from 'trpc-swagger';
import superjson from 'superjson';
import { ZodError } from 'zod';

const t = initTRPC.meta<OpenApiMeta>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;
