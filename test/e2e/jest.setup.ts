import * as dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config({ path: '.env.test' });

beforeAll(() => {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env },
    stdio: 'inherit',
  });
});
