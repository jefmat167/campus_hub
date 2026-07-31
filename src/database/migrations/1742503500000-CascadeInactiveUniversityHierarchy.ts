import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Data-only backfill enforcing the hierarchy invariant introduced alongside
 * cascading activation: **no row is active while an ancestor is inactive.**
 *
 * Before the cascade existed, `adminDeactivateUniversity` / `adminDeactivateFaculty`
 * flipped a single row, leaving descendants active. Because the user-facing
 * reads in `UniversitiesService` filter on each row's own `isActive` only, those
 * orphans stayed publicly visible — a deactivated university's faculties and
 * departments were still browsable, and `POST /auth/register` still accepted
 * signups into it. This closes any such rows already in the database.
 *
 * No schema change — only `isActive` values.
 */
export class CascadeInactiveUniversityHierarchy1742503500000
  implements MigrationInterface
{
  name = 'CascadeInactiveUniversityHierarchy1742503500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Faculties under a deactivated university.
    const faculties = await queryRunner.query(`
      UPDATE "faculties" f
      SET "isActive" = false
      FROM "universities" u
      WHERE f."university_id" = u."id"
        AND u."isActive" = false
        AND f."isActive" = true
    `);

    // 2. Departments under a deactivated faculty. Runs after step 1, so this
    //    covers departments orphaned by an inactive faculty *and* those pulled
    //    down transitively by an inactive university.
    const departments = await queryRunner.query(`
      UPDATE "departments" d
      SET "isActive" = false
      FROM "faculties" f
      WHERE d."faculty_id" = f."id"
        AND f."isActive" = false
        AND d."isActive" = true
    `);

    console.log(
      `[CascadeInactiveUniversityHierarchy] deactivated ${faculties[1] ?? 0} orphaned facult(ies), ${departments[1] ?? 0} orphaned department(s)`,
    );
  }

  public async down(): Promise<void> {
    // Intentionally a no-op. The pre-migration state cannot be reconstructed:
    // once a faculty/department is deactivated we no longer know whether it was
    // switched off by this backfill or deactivated on purpose beforehand.
    // Re-activating everything would wrongly resurrect deliberately closed rows.
  }
}
