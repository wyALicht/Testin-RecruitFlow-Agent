import { prisma } from "@/lib/prisma";
import { invalidateCacheByPrefix, READ_CACHE_TTL, readThroughCache } from "@/lib/server-cache";
import { makeId } from "@/lib/store";

const DEPARTMENT_CACHE_PREFIX = "departments:";

export async function listDepartments() {
  return readThroughCache(`${DEPARTMENT_CACHE_PREFIX}list`, READ_CACHE_TTL.medium, () =>
    prisma.department.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        code: true,
        _count: {
          select: {
            positions: {
              where: { deletedAt: null }
            }
          }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    })
  );
}

export async function resolveDepartment(params: {
  departmentId?: string | null;
  departmentName?: string | null;
}) {
  if (params.departmentId) {
    const department = await prisma.department.findFirst({
      where: {
        id: params.departmentId,
        active: true
      }
    });
    if (!department) {
      throw new Error("所选部门不存在或已停用");
    }
    return department;
  }

  const name = params.departmentName?.trim();
  if (!name) return null;

  const existing = await prisma.department.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive"
      }
    }
  });
  if (existing) {
    if (!existing.active) {
      const activated = await prisma.department.update({
        where: { id: existing.id },
        data: { active: true }
      });
      invalidateCacheByPrefix(DEPARTMENT_CACHE_PREFIX);
      return activated;
    }
    return existing;
  }

  const created = await prisma.department.create({
    data: {
      id: makeId("dept"),
      name
    }
  });
  invalidateCacheByPrefix(DEPARTMENT_CACHE_PREFIX);
  return created;
}
