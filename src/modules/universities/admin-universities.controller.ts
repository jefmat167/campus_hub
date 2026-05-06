import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminPermissions } from '../../common/constants/permissions';
import { UniversitiesService } from './universities.service';
import { AdminAuditService } from '../admin/admin-audit.service';
import { AuditAction, AuditTargetType } from '../../database/entities/admin-audit-log.entity';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { CreateFacultyDto } from './dto/create-faculty.dto';
import { UpdateFacultyDto } from './dto/update-faculty.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { AdminListUniversitiesDto } from './dto/admin-list-universities.dto';

@ApiTags('Universities (Admin)')
@Controller('admin/universities')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminUniversitiesController {
  constructor(
    private readonly universitiesService: UniversitiesService,
    private readonly auditService: AdminAuditService,
  ) { }

  // ─── University CRUD ────────────────────────────────────────────

  @Get()
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'List all universities (including inactive), paginated' })
  @ApiResponse({
    status: 200,
    description: 'Paginated universities list',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            name: 'University of Lagos',
            code: 'UNILAG',
            state: 'Lagos',
            city: 'Akoka',
            type: 'federal',
            isActive: true,
          },
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            name: 'Obafemi Awolowo University',
            code: 'OAU',
            state: 'Osun',
            city: 'Ile-Ife',
            type: 'federal',
            isActive: true,
          },
        ],
        meta: { total: 31, page: 1, limit: 20, totalPages: 2 },
      },
    },
  })
  async listUniversities(@Query() dto: AdminListUniversitiesDto) {
    const { universities, total } = await this.universitiesService.adminListUniversities(dto);
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    return {
      success: true,
      data: universities,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  @Get(':id')
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Get university details with faculties and departments' })
  @ApiParam({ name: 'id', description: 'University UUID' })
  @ApiResponse({
    status: 200,
    description: 'University details with faculties and departments tree',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'University of Lagos',
          code: 'UNILAG',
          state: 'Lagos',
          city: 'Akoka',
          address: 'University Road, Akoka, Yaba',
          website: 'https://unilag.edu.ng',
          type: 'federal',
          isActive: true,
          faculties: [
            {
              id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
              name: 'Faculty of Engineering',
              code: 'ENG',
              isActive: true,
              departments: [
                {
                  id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
                  name: 'Computer Science',
                  code: 'CSC',
                  isActive: true,
                },
                {
                  id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
                  name: 'Electrical Engineering',
                  code: 'EEE',
                  isActive: true,
                },
              ],
            },
          ],
        },
      },
    },
  })
  async getUniversity(@Param('id', ParseUUIDPipe) id: string) {
    const university = await this.universitiesService.adminGetUniversity(id);
    return { success: true, data: university };
  }

  @Post()
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Create university' })
  @ApiResponse({
    status: 201,
    description: 'University created',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'University of Lagos',
          code: 'UNILAG',
          state: 'Lagos',
          city: 'Akoka',
          address: 'University Road, Akoka, Yaba',
          website: 'https://unilag.edu.ng',
          type: 'federal',
          isActive: true,
        },
        message: 'University created',
      },
    },
  })
  async createUniversity(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateUniversityDto,
  ) {
    const university = await this.universitiesService.adminCreateUniversity(dto);

    await this.auditService.log(
      adminId,
      AuditAction.UNIVERSITY_CREATE,
      AuditTargetType.UNIVERSITY,
      university.id,
      undefined,
      { name: dto.name, code: dto.code },
    );

    return { success: true, data: university, message: 'University created' };
  }

  @Patch(':id')
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Update university' })
  @ApiParam({ name: 'id', description: 'University UUID' })
  @ApiResponse({
    status: 200,
    description: 'University updated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'University of Lagos',
          code: 'UNILAG',
          state: 'Lagos',
          city: 'Akoka',
          address: 'University Road, Akoka, Yaba',
          website: 'https://unilag.edu.ng',
          type: 'federal',
          isActive: true,
        },
        message: 'University updated',
      },
    },
  })
  async updateUniversity(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUniversityDto,
  ) {
    const university = await this.universitiesService.adminUpdateUniversity(id, dto);

    await this.auditService.log(
      adminId,
      AuditAction.UNIVERSITY_UPDATE,
      AuditTargetType.UNIVERSITY,
      id,
      undefined,
      dto as unknown as Record<string, unknown>,
    );

    return { success: true, data: university, message: 'University updated' };
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Deactivate university' })
  @ApiParam({ name: 'id', description: 'University UUID' })
  @ApiResponse({
    status: 200,
    description: 'University deactivated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'University of Lagos',
          code: 'UNILAG',
          state: 'Lagos',
          city: 'Akoka',
          address: 'University Road, Akoka, Yaba',
          website: 'https://unilag.edu.ng',
          type: 'federal',
          isActive: false,
        },
        message: 'University deactivated',
      },
    },
  })
  async deactivateUniversity(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const university = await this.universitiesService.adminDeactivateUniversity(id);

    await this.auditService.log(
      adminId,
      AuditAction.UNIVERSITY_DEACTIVATE,
      AuditTargetType.UNIVERSITY,
      id,
    );

    return { success: true, data: university, message: 'University deactivated' };
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Activate university' })
  @ApiParam({ name: 'id', description: 'University UUID' })
  @ApiResponse({
    status: 200,
    description: 'University activated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'University of Lagos',
          code: 'UNILAG',
          state: 'Lagos',
          city: 'Akoka',
          address: 'University Road, Akoka, Yaba',
          website: 'https://unilag.edu.ng',
          type: 'federal',
          isActive: true,
        },
        message: 'University activated',
      },
    },
  })
  async activateUniversity(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const university = await this.universitiesService.adminActivateUniversity(id);

    await this.auditService.log(
      adminId,
      AuditAction.UNIVERSITY_ACTIVATE,
      AuditTargetType.UNIVERSITY,
      id,
    );

    return { success: true, data: university, message: 'University activated' };
  }

  // ─── Faculty CRUD ──────────────────────────────────────────────

  @Get(':universityId/faculties')
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'List faculties for a university (including inactive)' })
  @ApiParam({ name: 'universityId', description: 'University UUID' })
  @ApiResponse({
    status: 200,
    description: 'Faculties list',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            name: 'Faculty of Engineering',
            code: 'ENG',
            universityId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            isActive: true,
          },
          {
            id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
            name: 'Faculty of Science',
            code: 'SCI',
            universityId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            isActive: false,
          },
        ],
      },
    },
  })
  async listFaculties(@Param('universityId', ParseUUIDPipe) universityId: string) {
    const faculties = await this.universitiesService.adminListFaculties(universityId);
    return { success: true, data: faculties };
  }

  @Get('faculties/:id')
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Get faculty detail with departments' })
  @ApiParam({ name: 'id', description: 'Faculty UUID' })
  @ApiResponse({
    status: 200,
    description: 'Faculty detail with departments',
    schema: {
      example: {
        success: true,
        data: {
          id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          name: 'Faculty of Engineering',
          code: 'ENG',
          universityId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          isActive: true,
          university: {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            name: 'University of Lagos',
            code: 'UNILAG',
          },
          departments: [
            { id: 'd4e5f6a7-b8c9-0123-defa-234567890123', name: 'Computer Science', code: 'CSC', isActive: true },
            { id: 'e5f6a7b8-c9d0-1234-efab-345678901234', name: 'Electrical Engineering', code: 'EEE', isActive: true },
          ],
        },
      },
    },
  })
  async getFaculty(@Param('id', ParseUUIDPipe) id: string) {
    const faculty = await this.universitiesService.adminGetFaculty(id);
    return { success: true, data: faculty };
  }

  @Post('faculties')
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Create faculty' })
  @ApiResponse({
    status: 201,
    description: 'Faculty created',
    schema: {
      example: {
        success: true,
        data: {
          id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          name: 'Faculty of Engineering',
          code: 'ENG',
          universityId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          isActive: true,
        },
        message: 'Faculty created',
      },
    },
  })
  async createFaculty(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateFacultyDto,
  ) {
    const faculty = await this.universitiesService.adminCreateFaculty(dto);

    await this.auditService.log(
      adminId,
      AuditAction.FACULTY_CREATE,
      AuditTargetType.FACULTY,
      faculty.id,
      undefined,
      { name: dto.name, code: dto.code, universityId: dto.universityId },
    );

    return { success: true, data: faculty, message: 'Faculty created' };
  }

  @Patch('faculties/:id')
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Update faculty' })
  @ApiParam({ name: 'id', description: 'Faculty UUID' })
  @ApiResponse({
    status: 200,
    description: 'Faculty updated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          name: 'Faculty of Engineering',
          code: 'ENG',
          universityId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          isActive: true,
        },
        message: 'Faculty updated',
      },
    },
  })
  async updateFaculty(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFacultyDto,
  ) {
    const faculty = await this.universitiesService.adminUpdateFaculty(id, dto);

    await this.auditService.log(
      adminId,
      AuditAction.FACULTY_UPDATE,
      AuditTargetType.FACULTY,
      id,
      undefined,
      dto as unknown as Record<string, unknown>,
    );

    return { success: true, data: faculty, message: 'Faculty updated' };
  }

  @Post('faculties/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Deactivate faculty' })
  @ApiParam({ name: 'id', description: 'Faculty UUID' })
  @ApiResponse({
    status: 200,
    description: 'Faculty deactivated',
    schema: {
      example: {
        success: true,
        message: 'Faculty deactivated',
      },
    },
  })
  async deactivateFaculty(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.universitiesService.adminDeactivateFaculty(id);

    await this.auditService.log(
      adminId,
      AuditAction.FACULTY_DEACTIVATE,
      AuditTargetType.FACULTY,
      id,
    );

    return { success: true, message: 'Faculty deactivated' };
  }

  // ─── Department CRUD ───────────────────────────────────────────

  @Get('faculties/:facultyId/departments')
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'List departments for a faculty (including inactive)' })
  @ApiParam({ name: 'facultyId', description: 'Faculty UUID' })
  @ApiResponse({
    status: 200,
    description: 'Departments list',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
            name: 'Computer Science',
            code: 'CSC',
            facultyId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            isActive: true,
          },
          {
            id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
            name: 'Electrical Engineering',
            code: 'EEE',
            facultyId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            isActive: false,
          },
        ],
      },
    },
  })
  async listDepartments(@Param('facultyId', ParseUUIDPipe) facultyId: string) {
    const departments = await this.universitiesService.adminListDepartments(facultyId);
    return { success: true, data: departments };
  }

  @Get('departments/:id')
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Get department detail' })
  @ApiParam({ name: 'id', description: 'Department UUID' })
  @ApiResponse({
    status: 200,
    description: 'Department detail',
    schema: {
      example: {
        success: true,
        data: {
          id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
          name: 'Computer Science',
          code: 'CSC',
          facultyId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          isActive: true,
          faculty: {
            id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            name: 'Faculty of Engineering',
            code: 'ENG',
            university: {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              name: 'University of Lagos',
              code: 'UNILAG',
            },
          },
        },
      },
    },
  })
  async getDepartment(@Param('id', ParseUUIDPipe) id: string) {
    const department = await this.universitiesService.adminGetDepartment(id);
    return { success: true, data: department };
  }

  @Post('departments')
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Create department' })
  @ApiResponse({
    status: 201,
    description: 'Department created',
    schema: {
      example: {
        success: true,
        data: {
          id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
          name: 'Computer Science',
          code: 'CSC',
          facultyId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          isActive: true,
        },
        message: 'Department created',
      },
    },
  })
  async createDepartment(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateDepartmentDto,
  ) {
    const department = await this.universitiesService.adminCreateDepartment(dto);

    await this.auditService.log(
      adminId,
      AuditAction.DEPARTMENT_CREATE,
      AuditTargetType.DEPARTMENT,
      department.id,
      undefined,
      { name: dto.name, code: dto.code, facultyId: dto.facultyId },
    );

    return { success: true, data: department, message: 'Department created' };
  }

  @Patch('departments/:id')
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Update department' })
  @ApiParam({ name: 'id', description: 'Department UUID' })
  @ApiResponse({
    status: 200,
    description: 'Department updated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
          name: 'Computer Science',
          code: 'CSC',
          facultyId: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          isActive: true,
        },
        message: 'Department updated',
      },
    },
  })
  async updateDepartment(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    const department = await this.universitiesService.adminUpdateDepartment(id, dto);

    await this.auditService.log(
      adminId,
      AuditAction.DEPARTMENT_UPDATE,
      AuditTargetType.DEPARTMENT,
      id,
      undefined,
      dto as unknown as Record<string, unknown>,
    );

    return { success: true, data: department, message: 'Department updated' };
  }

  @Post('departments/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.UNIVERSITIES_MANAGE)
  @ApiOperation({ summary: 'Deactivate department' })
  @ApiParam({ name: 'id', description: 'Department UUID' })
  @ApiResponse({
    status: 200,
    description: 'Department deactivated',
    schema: {
      example: {
        success: true,
        message: 'Department deactivated',
      },
    },
  })
  async deactivateDepartment(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.universitiesService.adminDeactivateDepartment(id);

    await this.auditService.log(
      adminId,
      AuditAction.DEPARTMENT_DEACTIVATE,
      AuditTargetType.DEPARTMENT,
      id,
    );

    return { success: true, message: 'Department deactivated' };
  }
}
