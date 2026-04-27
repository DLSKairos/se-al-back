import { JwtService } from '@nestjs/jwt';

export function generateTestToken(
  jwtService: JwtService,
  overrides: {
    sub?: string;
    orgId?: string;
    role?: string;
    jobTitle?: string;
  } = {},
): string {
  return jwtService.sign({
    sub:      overrides.sub      ?? 'test-user-id',
    orgId:    overrides.orgId    ?? 'test-org-id',
    role:     overrides.role     ?? 'OPERATOR',
    jobTitle: overrides.jobTitle ?? 'Tester',
  });
}
