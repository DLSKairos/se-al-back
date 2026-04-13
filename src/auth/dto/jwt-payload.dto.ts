/** Payload que se firma dentro del JWT y se inyecta en req.user por JwtStrategy. */
export class JwtPayload {
  sub: string;       // userId
  orgId: string;     // organizationId
  role: string;      // e.g. 'ADMIN' | 'EMPLOYEE'
  iat?: number;
  exp?: number;
}
