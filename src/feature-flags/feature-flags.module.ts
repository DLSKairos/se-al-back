import { Global, Module } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsController } from './feature-flags.controller';

/**
 * Módulo global de feature flags.
 *
 * Al ser @Global(), FeatureFlagsService está disponible para inyección en
 * cualquier módulo sin necesidad de importar FeatureFlagsModule explícitamente.
 *
 * Registrar en AppModule.imports para que arranque con la aplicación.
 */
@Global()
@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
