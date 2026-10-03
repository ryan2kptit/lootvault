import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";

import { AppExceptionFilter } from "../errors/app-exception.filter";

export interface ConfigureAppOptions {
  /** Route prefix owned by the service, e.g. "catalog" -> every route lives under /catalog. */
  prefix: string;
  /** Swagger title. */
  title: string;
}

/**
 * Applies the conventions every service shares: pino logger, global route prefix,
 * whitelist validation, the error envelope, CORS and Swagger at `/<prefix>/docs`.
 */
export function configureApp(app: INestApplication, options: ConfigureAppOptions): void {
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(options.prefix);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new AppExceptionFilter());
  app.enableCors({ origin: true, exposedHeaders: ["x-request-id"] });
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle(options.title).setVersion("1.0").addBearerAuth().build(),
  );
  SwaggerModule.setup(`${options.prefix}/docs`, app, document);
}
