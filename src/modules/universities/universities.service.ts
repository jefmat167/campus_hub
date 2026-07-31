import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { University } from '../../database/entities/university.entity';
import { Faculty } from '../../database/entities/faculty.entity';
import { Department } from '../../database/entities/department.entity';
import { AdminListUniversitiesDto } from './dto/admin-list-universities.dto';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class UniversitiesService {
  constructor(
    @InjectRepository(University)
    private universityRepo: Repository<University>,
    @InjectRepository(Faculty)
    private facultyRepo: Repository<Faculty>,
    @InjectRepository(Department)
    private departmentRepo: Repository<Department>,
    private dataSource: DataSource,
  ) { }

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

  // ─── Admin Methods ──────────────────────────────────────────────

  async adminListUniversities(dto: AdminListUniversitiesDto): Promise<{ universities: University[]; total: number }> {
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    const query = this.universityRepo
      .createQueryBuilder('university');

    if (dto.search) {
      query.andWhere(
        '(university.name ILIKE :search OR university.code ILIKE :search OR university.state ILIKE :search)',
        { search: `%${dto.search}%` },
      );
    }

    if (dto.isActive !== undefined) {
      query.andWhere('university.isActive = :isActive', { isActive: dto.isActive === 'true' });
    }

    if (dto.type) {
      query.andWhere('university.type = :type', { type: dto.type });
    }

    const sortBy = dto.sortBy || 'name';
    const sortOrder = dto.sortOrder || 'ASC';
    query.orderBy(`university.${sortBy}`, sortOrder);

    const [universities, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { universities, total };
  }

  async adminGetUniversity(id: string): Promise<University> {
    const university = await this.universityRepo.findOne({
      where: { id },
      relations: ['faculties', 'faculties.departments'],
    });

    if (!university) throw new NotFoundException('University not found');

    return university;
  }

  async adminListFaculties(universityId: string): Promise<Faculty[]> {
    const university = await this.universityRepo.findOne({ where: { id: universityId } });
    if (!university) throw new NotFoundException('University not found');

    return this.facultyRepo.find({
      where: { universityId },
      order: { name: 'ASC' },
    });
  }

  async adminGetFaculty(id: string): Promise<Faculty> {
    const faculty = await this.facultyRepo.findOne({
      where: { id },
      relations: ['university', 'departments'],
    });
    if (!faculty) throw new NotFoundException('Faculty not found');
    return faculty;
  }

  async adminListDepartments(facultyId: string): Promise<Department[]> {
    const faculty = await this.facultyRepo.findOne({ where: { id: facultyId } });
    if (!faculty) throw new NotFoundException('Faculty not found');

    return this.departmentRepo.find({
      where: { facultyId },
      order: { name: 'ASC' },
    });
  }

  async adminGetDepartment(id: string): Promise<Department> {
    const department = await this.departmentRepo.findOne({
      where: { id },
      relations: ['faculty', 'faculty.university'],
    });
    if (!department) throw new NotFoundException('Department not found');
    return department;
  }

  async adminCreateUniversity(dto: CreateUniversityDto): Promise<University> {
    const existing = await this.universityRepo.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException(`University with code '${dto.code}' already exists`);

    const university = this.universityRepo.create(dto);
    return this.universityRepo.save(university);
  }

  async adminUpdateUniversity(id: string, dto: UpdateUniversityDto): Promise<University> {
    const university = await this.universityRepo.findOne({ where: { id } });
    if (!university) throw new NotFoundException('University not found');

    if (dto.code && dto.code !== university.code) {
      const existing = await this.universityRepo.findOne({ where: { code: dto.code } });
      if (existing) throw new ConflictException(`University with code '${dto.code}' already exists`);
    }

    Object.assign(university, dto);
    return this.universityRepo.save(university);
  }

  // ─── Activation state (cascading) ───────────────────────────────
  //
  // Invariant: **a row is never active while an ancestor is inactive.**
  // The user-facing read methods above filter on each row's own `isActive` only
  // (they never check the parent), so this invariant is what actually keeps a
  // deactivated university's faculties/departments out of every public response
  // — including `POST /auth/register`, which validates the hierarchy through
  // `validateAndGetHierarchy` and so refuses signups into a deactivated school.
  //
  // Deactivation cascades DOWN the tree; activation mirrors it, turning the
  // whole subtree back on. Activating a row whose ancestor is inactive would
  // break the invariant, so it is rejected rather than silently orphaned.

  async adminDeactivateUniversity(id: string): Promise<University> {
    return this.setUniversitySubtreeActive(id, false);
  }

  async adminActivateUniversity(id: string): Promise<University> {
    return this.setUniversitySubtreeActive(id, true);
  }

  /**
   * Flip a university and its whole subtree (faculties + their departments) to
   * `isActive`, atomically.
   */
  private async setUniversitySubtreeActive(
    id: string,
    isActive: boolean,
  ): Promise<University> {
    const university = await this.universityRepo.findOne({ where: { id } });
    if (!university) throw new NotFoundException('University not found');

    await this.dataSource.transaction(async (manager) => {
      await manager.update(University, { id }, { isActive });
      await manager.update(Faculty, { universityId: id }, { isActive });

      // Departments have no universityId — reach them via their faculties.
      const faculties = await manager.find(Faculty, {
        where: { universityId: id },
        select: ['id'],
      });

      if (faculties.length) {
        await manager.update(
          Department,
          { facultyId: In(faculties.map((f) => f.id)) },
          { isActive },
        );
      }
    });

    university.isActive = isActive;
    return university;
  }

  async adminCreateFaculty(dto: CreateFacultyDto): Promise<Faculty> {
    const university = await this.universityRepo.findOne({ where: { id: dto.universityId } });
    if (!university) throw new NotFoundException('University not found');

    const existing = await this.facultyRepo.findOne({
      where: { universityId: dto.universityId, name: dto.name },
    });
    if (existing) throw new ConflictException(`Faculty '${dto.name}' already exists in this university`);

    const faculty = this.facultyRepo.create(dto);
    return this.facultyRepo.save(faculty);
  }

  async adminUpdateFaculty(id: string, dto: UpdateFacultyDto): Promise<Faculty> {
    const faculty = await this.facultyRepo.findOne({ where: { id }, relations: ['university'] });
    if (!faculty) throw new NotFoundException('Faculty not found');

    Object.assign(faculty, dto);
    return this.facultyRepo.save(faculty);
  }

  async adminDeactivateFaculty(id: string): Promise<Faculty> {
    return this.setFacultySubtreeActive(id, false);
  }

  async adminActivateFaculty(id: string): Promise<Faculty> {
    return this.setFacultySubtreeActive(id, true);
  }

  /**
   * Flip a faculty and its departments to `isActive`, atomically. Activating is
   * refused while the parent university is deactivated (would orphan the row).
   */
  private async setFacultySubtreeActive(
    id: string,
    isActive: boolean,
  ): Promise<Faculty> {
    const faculty = await this.facultyRepo.findOne({
      where: { id },
      relations: ['university'],
    });
    if (!faculty) throw new NotFoundException('Faculty not found');

    if (isActive && !faculty.university.isActive) {
      throw new BadRequestException(
        `Cannot activate this faculty while its university ('${faculty.university.name}') is deactivated. Activate the university first.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Faculty, { id }, { isActive });
      await manager.update(Department, { facultyId: id }, { isActive });
    });

    faculty.isActive = isActive;
    return faculty;
  }

  async adminCreateDepartment(dto: CreateDepartmentDto): Promise<Department> {
    const faculty = await this.facultyRepo.findOne({ where: { id: dto.facultyId } });
    if (!faculty) throw new NotFoundException('Faculty not found');

    const existing = await this.departmentRepo.findOne({
      where: { facultyId: dto.facultyId, name: dto.name },
    });
    if (existing) throw new ConflictException(`Department '${dto.name}' already exists in this faculty`);

    const department = this.departmentRepo.create(dto);
    return this.departmentRepo.save(department);
  }

  async adminUpdateDepartment(id: string, dto: UpdateDepartmentDto): Promise<Department> {
    const department = await this.departmentRepo.findOne({ where: { id }, relations: ['faculty'] });
    if (!department) throw new NotFoundException('Department not found');

    Object.assign(department, dto);
    return this.departmentRepo.save(department);
  }

  // Departments are the leaf of the tree — nothing to cascade to.

  async adminDeactivateDepartment(id: string): Promise<Department> {
    const department = await this.departmentRepo.findOne({ where: { id } });
    if (!department) throw new NotFoundException('Department not found');

    department.isActive = false;
    return this.departmentRepo.save(department);
  }

  async adminActivateDepartment(id: string): Promise<Department> {
    const department = await this.departmentRepo.findOne({
      where: { id },
      relations: ['faculty', 'faculty.university'],
    });
    if (!department) throw new NotFoundException('Department not found');

    const { faculty } = department;
    const inactiveAncestor = !faculty.university.isActive
      ? `university ('${faculty.university.name}')`
      : !faculty.isActive
        ? `faculty ('${faculty.name}')`
        : null;

    if (inactiveAncestor) {
      throw new BadRequestException(
        `Cannot activate this department while its ${inactiveAncestor} is deactivated. Activate the ${inactiveAncestor.split(' ')[0]} first.`,
      );
    }

    department.isActive = true;
    return this.departmentRepo.save(department);
  }
}
