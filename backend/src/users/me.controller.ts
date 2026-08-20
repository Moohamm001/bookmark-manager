import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

@Controller('me')
export class MeController {
  /**
   * Returns the signed-in person. There is no `:id` variant and there never will be —
   * "get user by id" is an enumeration endpoint in an app whose whole premise is that
   * users cannot learn of each other.
   */
  @Get()
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
