import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca un endpoint como público — el JwtAuthGuard lo dejará pasar sin token. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
