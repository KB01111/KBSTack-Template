import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const exampleRouter = router({
  hello: publicProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/hello',
        tags: ['example'],
        summary: 'Hello world endpoint'
      }
    })
    .input(z.object({
      name: z.string().optional().describe('The name to say hello to')
    }))
    .output(z.object({
      greeting: z.string().describe('The greeting message')
    }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.name || 'world'}!`,
      };
    }),
  
  createItem: publicProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/items',
        tags: ['example'],
        summary: 'Create a new item'
      }
    })
    .input(z.object({
      name: z.string().describe('The name of the item'),
      description: z.string().optional().describe('The description of the item')
    }))
    .output(z.object({
      id: z.string().describe('The ID of the created item'),
      name: z.string().describe('The name of the item'),
      description: z.string().nullable().describe('The description of the item'),
      createdAt: z.date().describe('When the item was created')
    }))
    .mutation(({ input }) => {
      // This would normally interact with a database
      return {
        id: 'item_' + Math.random().toString(36).substring(2, 9),
        name: input.name,
        description: input.description || null,
        createdAt: new Date(),
      };
    }),
});
