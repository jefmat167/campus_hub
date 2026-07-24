import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Admin } from '../../database/entities/admin.entity';

export const CurrentAdmin = createParamDecorator(
  (data: keyof Admin | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const admin = request.user as Admin;

    if (data) {
      return admin?.[data];
    }

    return admin;
  },
);
