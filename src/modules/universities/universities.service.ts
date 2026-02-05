import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { University } from '../../database/entities/university.entity';
import { Faculty } from '../../database/entities/faculty.entity';
import { Department } from '../../database/entities/department.entity';

@Injectable()
export class UniversitiesService {
  constructor(
    @InjectRepository(University)
    private universityRepo: Repository<University>,
    @InjectRepository(Faculty)
    private facultyRepo: Repository<Faculty>,
    @InjectRepository(Department)
    private departmentRepo: Repository<Department>,
  ) {}

  async findAllUniversities(): Promise<University[]> {
    return this.universityRepo.find({
      where: { isActive: true },
      order: { name: 'ASC' },
      select: ['id', 'name', 'code', 'state', 'city', 'type'],
    });
  }

  async findUniversityById(id: string): Promise<University> {
    const university = await this.universityRepo.findOne({
      where: { id, isActive: true },
    });

    if (!university) {
      throw new NotFoundException('University not found');
    }

    return university;
  }

  async findUniversityByCode(code: string): Promise<University> {
    const university = await this.universityRepo.findOne({
      where: { code, isActive: true },
    });

    if (!university) {
      throw new NotFoundException('University not found');
    }

    return university;
  }

  async findFacultiesByUniversity(universityId: string): Promise<Faculty[]> {
    // Verify university exists
    await this.findUniversityById(universityId);

    return this.facultyRepo.find({
      where: { universityId, isActive: true },
      order: { name: 'ASC' },
      select: ['id', 'name', 'code'],
    });
  }

  async findFacultyById(id: string): Promise<Faculty> {
    const faculty = await this.facultyRepo.findOne({
      where: { id, isActive: true },
      relations: ['university'],
    });

    if (!faculty) {
      throw new NotFoundException('Faculty not found');
    }

    return faculty;
  }

  async findDepartmentsByFaculty(facultyId: string): Promise<Department[]> {
    // Verify faculty exists
    await this.findFacultyById(facultyId);

    return this.departmentRepo.find({
      where: { facultyId, isActive: true },
      order: { name: 'ASC' },
      select: ['id', 'name', 'code'],
    });
  }

  async findDepartmentById(id: string): Promise<Department> {
    const department = await this.departmentRepo.findOne({
      where: { id, isActive: true },
      relations: ['faculty', 'faculty.university'],
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  async validateUniversityHierarchy(
    universityId: string,
    facultyId: string,
    departmentId: string,
  ): Promise<boolean> {
    const department = await this.departmentRepo.findOne({
      where: { id: departmentId, isActive: true },
      relations: ['faculty', 'faculty.university'],
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    if (department.facultyId !== facultyId) {
      throw new NotFoundException('Department does not belong to the specified faculty');
    }

    if (department.faculty.universityId !== universityId) {
      throw new NotFoundException('Faculty does not belong to the specified university');
    }

    return true;
  }

  /**
   * Validate university hierarchy and return entity data for response building.
   * This avoids needing to reload user with JOINs after creation.
   */
  async validateAndGetHierarchy(
    universityId: string,
    facultyId: string,
    departmentId: string,
  ): Promise<{
    university: { id: string; name: string; code: string };
    faculty: { id: string; name: string; code: string };
    department: { id: string; name: string; code: string };
  }> {
    const department = await this.departmentRepo.findOne({
      where: { id: departmentId, isActive: true },
      relations: ['faculty', 'faculty.university'],
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    if (department.facultyId !== facultyId) {
      throw new NotFoundException('Department does not belong to the specified faculty');
    }

    if (department.faculty.universityId !== universityId) {
      throw new NotFoundException('Faculty does not belong to the specified university');
    }

    const { faculty } = department;
    const { university } = faculty;

    return {
      university: { id: university.id, name: university.name, code: university.code },
      faculty: { id: faculty.id, name: faculty.name, code: faculty.code },
      department: { id: department.id, name: department.name, code: department.code },
    };
  }

  async searchUniversities(query: string): Promise<University[]> {
    return this.universityRepo
      .createQueryBuilder('university')
      .where('university.isActive = :isActive', { isActive: true })
      .andWhere(
        '(LOWER(university.name) LIKE LOWER(:query) OR LOWER(university.code) LIKE LOWER(:query) OR LOWER(university.state) LIKE LOWER(:query))',
        { query: `%${query}%` },
      )
      .orderBy('university.name', 'ASC')
      .limit(20)
      .getMany();
  }
}
