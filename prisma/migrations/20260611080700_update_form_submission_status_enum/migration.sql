-- Prisma: no-transaction
-- ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción
-- en PostgreSQL < 12. Este archivo debe ejecutarse fuera de transacción.
-- Ver: data-design.md sección 8.1 y sección Riesgo 1.

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'PENDING_SIGNATURES';
