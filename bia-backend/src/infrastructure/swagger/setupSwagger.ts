import { Express } from 'express';
import * as swaggerUi from 'swagger-ui-express';
import * as path from 'path';
import * as YAML from 'yamljs';

/**
 * Sets up Swagger UI at the /docs endpoint.
 * Loads the OpenAPI specification from openapi.yaml at the project root.
 *
 * @param app - Express application instance
 */
export function setupSwagger(app: Express): void {
  const openapiPath = path.resolve(__dirname, '../../../openapi.yaml');
  const swaggerDocument = YAML.load(openapiPath);

  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'BIA API Documentation',
  }));
}
