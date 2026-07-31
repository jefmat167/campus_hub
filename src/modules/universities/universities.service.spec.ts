import { BadRequestException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { UniversitiesService } from './universities.service';
import { University } from '../../database/entities/university.entity';
import { Faculty } from '../../database/entities/faculty.entity';
import { Department } from '../../database/entities/department.entity';

/**
 * Covers the activation cascade and the invariant it exists to protect:
 * **no row is active while an ancestor is inactive.**
 *
 * This matters because the user-facing read methods (`findFacultyById`,
 * `findDepartmentById`, `validateAndGetHierarchy`, …) filter on each row's own
 * `isActive` and never check the parent — so an active faculty under a
 * deactivated university would stay publicly browsable and would still accept
 * registrations. The cascade is what keeps those reads correct.
 */
function makeService() {
  const universityRepo: any = { findOne: jest.fn(), save: jest.fn(async (u: any) => u) };
  const facultyRepo: any = { findOne: jest.fn(), save: jest.fn(async (f: any) => f) };
  const departmentRepo: any = { findOne: jest.fn(), save: jest.fn(async (d: any) => d) };

  const updates: Array<{ entity: any; criteria: any; patch: any }> = [];
  const manager: any = {
    update: jest.fn(async (entity: any, criteria: any, patch: any) => {
      updates.push({ entity, criteria, patch });
      return { affected: 1 };
    }),
    find: jest.fn(async () => [] as any[]),
  };
  const dataSource: any = { transaction: jest.fn(async (cb: any) => cb(manager)) };

  const svc = new UniversitiesService(
    universityRepo,
    facultyRepo,
    departmentRepo,
    dataSource,
  );

  const updateFor = (entity: any) => updates.find((u) => u.entity === entity);

  return {
    svc,
    universityRepo,
    facultyRepo,
    departmentRepo,
    manager,
    dataSource,
    updates,
    updateFor,
  };
}

describe('UniversitiesService activation cascade', () => {
  describe('university → faculties → departments', () => {
    it('deactivating a university deactivates its faculties and all their departments', async () => {
      const t = makeService();
      t.universityRepo.findOne.mockResolvedValue({ id: 'u1', name: 'UNILAG', isActive: true });
      t.manager.find.mockResolvedValue([{ id: 'f1' }, { id: 'f2' }]);

      const result = await t.svc.adminDeactivateUniversity('u1');

      expect(t.updateFor(University)).toEqual({
        entity: University,
        criteria: { id: 'u1' },
        patch: { isActive: false },
      });
      expect(t.updateFor(Faculty)).toEqual({
        entity: Faculty,
        criteria: { universityId: 'u1' },
        patch: { isActive: false },
      });
      // Departments carry no universityId — reached via their faculties.
      expect(t.updateFor(Department)).toEqual({
        entity: Department,
        criteria: { facultyId: In(['f1', 'f2']) },
        patch: { isActive: false },
      });
      expect(result.isActive).toBe(false);
    });

    it('activating a university mirrors the cascade back on', async () => {
      const t = makeService();
      t.universityRepo.findOne.mockResolvedValue({ id: 'u1', name: 'UNILAG', isActive: false });
      t.manager.find.mockResolvedValue([{ id: 'f1' }]);

      const result = await t.svc.adminActivateUniversity('u1');

      expect(t.updates.map((u) => u.patch)).toEqual([
        { isActive: true },
        { isActive: true },
        { isActive: true },
      ]);
      expect(result.isActive).toBe(true);
    });

    it('runs the whole subtree in one transaction', async () => {
      const t = makeService();
      t.universityRepo.findOne.mockResolvedValue({ id: 'u1', isActive: true });
      t.manager.find.mockResolvedValue([{ id: 'f1' }]);

      await t.svc.adminDeactivateUniversity('u1');

      expect(t.dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('skips the department update when the university has no faculties', async () => {
      const t = makeService();
      t.universityRepo.findOne.mockResolvedValue({ id: 'u1', isActive: true });
      t.manager.find.mockResolvedValue([]);

      await t.svc.adminDeactivateUniversity('u1');

      // An unguarded In([]) would produce invalid SQL.
      expect(t.updateFor(Department)).toBeUndefined();
      expect(t.updateFor(Faculty)).toBeDefined();
    });

    it('404s on an unknown university without opening a transaction', async () => {
      const t = makeService();
      t.universityRepo.findOne.mockResolvedValue(null);

      await expect(t.svc.adminDeactivateUniversity('nope')).rejects.toThrow(
        NotFoundException,
      );
      expect(t.dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('faculty → departments', () => {
    const activeFaculty = () => ({
      id: 'f1',
      name: 'Faculty of Engineering',
      isActive: true,
      university: { id: 'u1', name: 'UNILAG', isActive: true },
    });

    it('deactivating a faculty deactivates its departments and leaves the university alone', async () => {
      const t = makeService();
      t.facultyRepo.findOne.mockResolvedValue(activeFaculty());

      const result = await t.svc.adminDeactivateFaculty('f1');

      expect(t.updateFor(Faculty)).toEqual({
        entity: Faculty,
        criteria: { id: 'f1' },
        patch: { isActive: false },
      });
      expect(t.updateFor(Department)).toEqual({
        entity: Department,
        criteria: { facultyId: 'f1' },
        patch: { isActive: false },
      });
      expect(t.updateFor(University)).toBeUndefined();
      expect(result.isActive).toBe(false);
    });

    it('activating a faculty turns its departments back on', async () => {
      const t = makeService();
      t.facultyRepo.findOne.mockResolvedValue({ ...activeFaculty(), isActive: false });

      await t.svc.adminActivateFaculty('f1');

      expect(t.updateFor(Faculty)!.patch).toEqual({ isActive: true });
      expect(t.updateFor(Department)!.patch).toEqual({ isActive: true });
    });

    it('refuses to activate a faculty while its university is deactivated', async () => {
      const t = makeService();
      t.facultyRepo.findOne.mockResolvedValue({
        ...activeFaculty(),
        isActive: false,
        university: { id: 'u1', name: 'UNILAG', isActive: false },
      });

      await expect(t.svc.adminActivateFaculty('f1')).rejects.toThrow(BadRequestException);
      // Nothing written — the orphan is never created.
      expect(t.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('still allows deactivating a faculty whose university is already off', async () => {
      const t = makeService();
      t.facultyRepo.findOne.mockResolvedValue({
        ...activeFaculty(),
        university: { id: 'u1', name: 'UNILAG', isActive: false },
      });

      await expect(t.svc.adminDeactivateFaculty('f1')).resolves.toBeDefined();
    });
  });

  describe('department (leaf — no cascade)', () => {
    const dept = (facultyActive = true, universityActive = true) => ({
      id: 'd1',
      name: 'Computer Science',
      isActive: false,
      faculty: {
        id: 'f1',
        name: 'Faculty of Engineering',
        isActive: facultyActive,
        university: { id: 'u1', name: 'UNILAG', isActive: universityActive },
      },
    });

    it('deactivating a department cascades to nothing', async () => {
      const t = makeService();
      t.departmentRepo.findOne.mockResolvedValue({ id: 'd1', isActive: true });

      const result = await t.svc.adminDeactivateDepartment('d1');

      expect(result.isActive).toBe(false);
      expect(t.departmentRepo.save).toHaveBeenCalled();
      expect(t.dataSource.transaction).not.toHaveBeenCalled();
    });

    it('activates when every ancestor is active', async () => {
      const t = makeService();
      t.departmentRepo.findOne.mockResolvedValue(dept());

      const result = await t.svc.adminActivateDepartment('d1');

      expect(result.isActive).toBe(true);
    });

    it('refuses to activate under a deactivated faculty', async () => {
      const t = makeService();
      t.departmentRepo.findOne.mockResolvedValue(dept(false, true));

      await expect(t.svc.adminActivateDepartment('d1')).rejects.toThrow(
        /faculty \('Faculty of Engineering'\) is deactivated/,
      );
      expect(t.departmentRepo.save).not.toHaveBeenCalled();
    });

    it('refuses to activate under a deactivated university, naming the university', async () => {
      const t = makeService();
      t.departmentRepo.findOne.mockResolvedValue(dept(false, false));

      // University is reported in preference to the faculty — it's the outermost blocker.
      await expect(t.svc.adminActivateDepartment('d1')).rejects.toThrow(
        /university \('UNILAG'\) is deactivated/,
      );
    });
  });
});
