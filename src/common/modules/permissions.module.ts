import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminPermission } from '../../database/entities/admin-permission.entity';
import { PermissionsGuard } from '../guards/permissions.guard';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AdminPermission])],
  providers: [PermissionsGuard],
  exports: [PermissionsGuard, TypeOrmModule],
})
export class PermissionsModule {}
