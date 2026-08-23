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
 * Every method takes `ownerId` first and every query carries it. This is the whole privacy
 * mechanism (ADR-009), and the shape matters: update/delete pass `{ id, ownerId }` in the
 * same statement as the write, so there is no fetch-then-check window and no `if` to drop.
 *
 * No `findUnique` — it cannot express "and it is mine". `npm run verify:privacy` enforces both.
 */
@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, query: ListCollectionsQueryDto): Promise<Paginated<Collection>> {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const where = { ownerId, ...(query.q ? { name: { contains: query.q } } : {}) };

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

  /** Used by BookmarksService before filing a bookmark into a collection. */
  async assertOwned(ownerId: string, id: string): Promise<void> {
    const found = await this.prisma.collection.findFirst({
      where: { id, ownerId },
      select: { id: true },
    });
    if (!found) notFound('Collection');
  }

  async create(ownerId: string, dto: CreateCollectionDto): Promise<Collection> {
    return this.prisma.collection.create({ data: { name: dto.name, ownerId } });
  }

  async replace(ownerId: string, id: string, dto: ReplaceCollectionDto): Promise<Collection> {
    return this.update(ownerId, id, { name: dto.name });
  }

  async patch(ownerId: string, id: string, dto: PatchCollectionDto): Promise<Collection> {
    return this.update(ownerId, id, dto.name !== undefined ? { name: dto.name } : {});
  }

  private async update(ownerId: string, id: string, data: { name?: string }): Promise<Collection> {
    try {
      return await this.prisma.collection.update({ where: { id, ownerId }, data });
    } catch (err) {
      rethrowAsNotFound(err, 'Collection');
    }
  }

  /** Bookmarks inside are not deleted; `onDelete: SetNull` uncategorises them. ADR-003. */
  async remove(ownerId: string, id: string): Promise<void> {
    try {
      await this.prisma.collection.delete({ where: { id, ownerId } });
    } catch (err) {
      rethrowAsNotFound(err, 'Collection');
    }
  }
}
