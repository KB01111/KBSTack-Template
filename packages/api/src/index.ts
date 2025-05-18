import { appRouter } from './router';
import { openApiDocument } from './swagger';
import { createOpenApiNextHandler } from 'trpc-swagger/next';

export { appRouter, openApiDocument };
export type { AppRouter } from './router';

export const createSwaggerHandler = () => {
  return createOpenApiNextHandler({
    router: appRouter,
    createContext: () => ({}),
  });
};
