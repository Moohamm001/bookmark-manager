import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { notFound, rethrowAsNotFound } from '../common/prisma-errors.js';
import type { Paginated } from '../common/dto/paginated.js';
import type { Collection } from '../generated/prisma/client.js';
import type {
  CreateCollectionDto,
  ListCollectionsQueryDto,
  PatchCollectionDto,
  ReplaceCollectionDto,
} from './dto/collection.dto.js';

/**
 * Every method takes `ownerId` as its FIRST parameter, and every Prisma call below puts
 * it in the `where`. This is the whole privacy mechanism, and the shape is deliberate:
 *
 * - It is impossible to call any of these methods without deciding whose data you mean.
 * - It is statically checkable — `npm run verify:privacy` parses this file and fails the
 *   build if any Prisma call on Collection/Bookmark lacks an ownerId predicate.
 * - `update`/`delete` pass `{ id, ownerId }` together, so the scoping happens in the same
 *   atomic statement as the write. There is no fetch-then-check window, and no `if` a
 *   future edit can drop.
 *
 * Note what is NOT here: no `findUnique`. `findUnique({ where: { id } })` cannot express
 * "and it must be mine", so it is banned outright by the verifier — `findFirst` with a
 * compound where is the only sanctioned read.
 */
@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, query: ListCollectionsQueryDto): Promise<Paginated<Collection>> {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    // SQLite's LIKE is ASCII-case-insensitive, which is what `contains` compiles to here.
    const where = {
      ownerId,
      ...(query.q ? { name: { contains: query.q } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.collection.findMany({
        where,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortDir ?? 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.collection.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  async findOne(ownerId: string, id: string): Promise<Collection> {
    const collection = await this.prisma.collection.findFirst({ where: { id, ownerId } });
    if (!collection) notFound('Collection');
    return collection;
  }

  /** Ownership assertion used by BookmarksService before it files a bookmark anywhere. */
  async assertOwned(ownerId: string, id: string): Promise<void> {
    const found = await this.prisma.collection.findFirst({
      where: { id, ownerId },
      select: { id: true },
    });
    if (!found) notFound('Collection');
  }

  async create(ownerId: string, dto: CreateCollectionDto): Promise<Collection> {
    // ownerId comes from the argument (i.e. the verified token), never from `dto`.
    return this.prisma.collection.create({ data: { name: dto.name, ownerId } });
  }

  async replace(ownerId: string, id: string, dto: ReplaceCollectionDto): Promise<Collection> {
    try {
      return await this.prisma.collection.update({
        where: { id, ownerId },
        data: { name: dto.name },
      });
    } catch (err) {
      rethrowAsNotFound(err, 'Collection');
    }
  }

  async patch(ownerId: string, id: string, dto: PatchCollectionDto): Promise<Collection> {
    try {
      return await this.prisma.collection.update({
        where: { id, ownerId },
        data: { ...(dto.name !== undefined ? { name: dto.name } : {}) },
      });
    } catch (err) {
      rethrowAsNotFound(err, 'Collection');
    }
  }

  /**
   * Delete. The bookmarks inside are NOT deleted — `onDelete: SetNull` in the schema makes
   * them uncategorised. Enforced by the database, not by code here. See DECISIONS.md ADR-003.
   */
  async remove(ownerId: string, id: string): Promise<void> {
    try {
      await this.prisma.collection.delete({ where: { id, ownerId } });
    } catch (err) {
      rethrowAsNotFound(err, 'Collection');
    }
  }
}
