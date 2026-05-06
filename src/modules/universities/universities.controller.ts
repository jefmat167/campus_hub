import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UniversitiesService } from './universities.service';
import { University } from '../../database/entities/university.entity';
import { Faculty } from '../../database/entities/faculty.entity';
import { Department } from '../../database/entities/department.entity';

@ApiTags('Universities')
@Controller('universities')
export class UniversitiesController {
  constructor(private readonly universitiesService: UniversitiesService) { }

  @Get()
  @ApiOperation({ summary: 'Get all universities' })
  @ApiResponse({
    status: 200,
    description: 'List of all universities',
    schema: {
      example: [
        {
          id: 'uuid',
          name: 'University of Lagos',
          shortName: 'UNILAG',
          location: 'Lagos, Nigeria',
          type: 'federal',
        },
      ],
    },
  })
  async findAll(): Promise<University[]> {
    return this.universitiesService.findAllUniversities();
  }

  @Get('search')
  @ApiOperation({ summary: 'Search universities by name' })
  @ApiQuery({ name: 'q', description: 'Search query (min 2 characters)', example: 'Lagos' })
  @ApiResponse({
    status: 200,
    description: 'Matching universities',
    schema: {
      example: [
        {
          id: 'uuid',
          name: 'University of Lagos',
          shortName: 'UNILAG',
          location: 'Lagos, Nigeria',
        },
      ],
    },
  })
  async search(@Query('q') query: string): Promise<University[]> {
    if (!query || query.length < 2) {
      return [];
    }
    return this.universitiesService.searchUniversities(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get university by ID' })
  @ApiParam({ name: 'id', description: 'University UUID' })
  @ApiResponse({
    status: 200,
    description: 'University details',
    schema: {
      example: {
        id: 'uuid',
        name: 'University of Lagos',
        shortName: 'UNILAG',
        location: 'Lagos, Nigeria',
        type: 'federal',
      },
    },
  })
  async findOne(@Param('id') id: string): Promise<University> {
    return this.universitiesService.findUniversityById(id);
  }

  @Get(':id/faculties')
  @ApiOperation({ summary: 'Get faculties of a university' })
  @ApiParam({ name: 'id', description: 'University UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of faculties',
    schema: {
      example: [
        { id: 'uuid', name: 'Faculty of Engineering' },
        { id: 'uuid', name: 'Faculty of Science' },
      ],
    },
  })
  async findFaculties(@Param('id') universityId: string): Promise<Faculty[]> {
    return this.universitiesService.findFacultiesByUniversity(universityId);
  }

  @Get('faculties/:facultyId')
  @ApiOperation({ summary: 'Get faculty by ID' })
  @ApiParam({ name: 'facultyId', description: 'Faculty UUID' })
  @ApiResponse({
    status: 200,
    description: 'Faculty details',
    schema: {
      example: { id: 'uuid', name: 'Faculty of Engineering', universityId: 'uuid' },
    },
  })
  async findFaculty(@Param('facultyId') facultyId: string): Promise<Faculty> {
    return this.universitiesService.findFacultyById(facultyId);
  }

  @Get('faculties/:facultyId/departments')
  @ApiOperation({ summary: 'Get departments of a faculty' })
  @ApiParam({ name: 'facultyId', description: 'Faculty UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of departments',
    schema: {
      example: [
        { id: 'uuid', name: 'Computer Science' },
        { id: 'uuid', name: 'Electrical Engineering' },
      ],
    },
  })
  async findDepartments(
    @Param('facultyId') facultyId: string,
  ): Promise<Department[]> {
    return this.universitiesService.findDepartmentsByFaculty(facultyId);
  }

  @Get('departments/:departmentId')
  @ApiOperation({ summary: 'Get department by ID' })
  @ApiParam({ name: 'departmentId', description: 'Department UUID' })
  @ApiResponse({
    status: 200,
    description: 'Department details',
    schema: {
      example: { id: 'uuid', name: 'Computer Science', facultyId: 'uuid' },
    },
  })
  async findDepartment(
    @Param('departmentId') departmentId: string,
  ): Promise<Department> {
    return this.universitiesService.findDepartmentById(departmentId);
  }
}
