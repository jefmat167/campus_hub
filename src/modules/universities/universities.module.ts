import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { University } from '../../database/entities/university.entity';
import { Faculty } from '../../database/entities/faculty.entity';
import { Department } from '../../database/entities/department.entity';
import { UniversitySettings } from '../../database/entities/university-settings.entity';
import { DropPoint } from '../../database/entities/drop-point.entity';
import { UniversitiesService } from './universities.service';
import { UniversitySettingsService } from './university-settings.service';
import { UniversitiesController } from './universities.controller';
import { AdminUniversitiesController } from './admin-universities.controller';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      University,
      Faculty,
      Department,
      UniversitySettings,
      DropPoint,
    ]),
    AdminModule,
  ],
  controllers: [UniversitiesController, AdminUniversitiesController],
  providers: [UniversitiesService, UniversitySettingsService],
  exports: [UniversitiesService, UniversitySettingsService],
})
export class UniversitiesModule {}
