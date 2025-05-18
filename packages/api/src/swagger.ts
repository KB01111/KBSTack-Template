import { generateOpenApiDocument } from 'trpc-swagger';
import { appRouter } from './router';

export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'KBStack API',
  version: '1.0.0',
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  docsUrl: 'https://github.com/KB01111/KBSTack-Template',
  tags: ['api', 'trpc', 'swagger'],
});
