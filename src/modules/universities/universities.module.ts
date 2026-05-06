import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { University } from '../../database/entities/university.entity';
import { Faculty } from '../../database/entities/faculty.entity';
import { Department } from '../../database/entities/department.entity';
import { UniversitiesService } from './universities.service';
import { UniversitiesController } from './universities.controller';
import { AdminUniversitiesController } from './admin-universities.controller';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [TypeOrmModule.forFeature([University, Faculty, Department]), AdminModule],
  controllers: [UniversitiesController, AdminUniversitiesController],
  providers: [UniversitiesService],
  exports: [UniversitiesService],
})
export class UniversitiesModule {}
