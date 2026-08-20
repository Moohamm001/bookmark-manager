import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt a route out of the global guard. Deliberately rare: only /health uses it.
 *
 * The default is protected because the guard is global. If someone adds a controller and
 * forgets about auth, the route is still protected — the failure mode of forgetting is a
 * locked door, not an open one.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
