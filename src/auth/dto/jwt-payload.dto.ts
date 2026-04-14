/** Payload que se firma dentro del JWT y se inyecta en req.user por JwtStrategy. */
export class JwtPayload {
  sub: string;        // userId
  orgId: string;      // organizationId
  role: string;       // e.g. 'ADMIN' | 'OPERATOR' | 'SUPER_ADMIN'
  jobTitle: string;   // cargo del usuario — usado para filtrar templates
  iat?: number;
  exp?: number;
}
