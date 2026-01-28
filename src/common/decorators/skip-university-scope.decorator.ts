import { SetMetadata } from '@nestjs/common';
import { SKIP_UNIVERSITY_SCOPE_KEY } from '../guards/university-scope.guard';

export const SkipUniversityScope = () => SetMetadata(SKIP_UNIVERSITY_SCOPE_KEY, true);
