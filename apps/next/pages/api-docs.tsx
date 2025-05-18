import React from 'react';
import SwaggerUI from 'swagger-ui-react';
import { openApiDocument } from '@kbstack/api';
import 'swagger-ui-react/swagger-ui.css';

export default function ApiDocs() {
  return (
    <div className="swagger-container">
      <div className="swagger-header">
        <h1>KBStack API Documentation</h1>
        <p>Interactive documentation for the KBStack API</p>
      </div>
      <SwaggerUI spec={openApiDocument} />
      <style jsx global>{`
        .swagger-container {
          padding: 2rem;
          max-width: 1200px;
          margin: 0 auto;
        }
        .swagger-header {
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #eaeaea;
        }
        .swagger-ui .info .title {
          font-size: 2.5rem;
        }
      `}</style>
    </div>
  );
}
