import { NextApiRequest, NextApiResponse } from 'next';
import { createSwaggerHandler } from '@kbstack/api';

// Create a handler for the Swagger API endpoint
const handler = createSwaggerHandler();

export default function openApiHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  return handler(req, res);
}
