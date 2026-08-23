import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CollectionsService } from '../collections/collections.service.js';
import { notFound, rethrowAsNotFound } from '../common/prisma-errors.js';
import type { Paginated } from '../common/dto/paginated.js';
import type { Bookmark, Prisma } from '../generated/prisma/client.js';
import type {
  CreateBookmarkDto,
  ListBookmarksQueryDto,
  PatchBookmarkDto,
  ReplaceBookmarkDto,
} from './dto/bookmark.dto.js';

@Injectable()
export class BookmarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collections: CollectionsService,
  ) {}

  // The cross-tenant hole: without this A files a bookmark into B's collection — owned by A,
  // so every ownership check passes, but it shows up in B's. Needed on create, PUT and PATCH.
  private async assertCollectionUsable(ownerId: string, collectionId: string | null | undefined) {
    if (collectionId != null) await this.collections.assertOwned(ownerId, collectionId);
  }

  async list(ownerId: string, query: ListBookmarksQueryDto): Promise<Paginated<Bookmark>> {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    // 404, not an empty list, or the filter becomes an existence oracle.
    if (query.collectionId) await this.collections.assertOwned(ownerId, query.collectionId);

    const where: Prisma.BookmarkWhereInput = {
      ownerId,
      ...(query.collectionId ? { collectionId: query.collectionId } : {}),
      ...(query.uncategorised ? { collectionId: null } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q } },
              { notes: { contains: query.q } },
              { url: { contains: query.q } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.bookmark.findMany({
        where,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortDir ?? 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.bookmark.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  async listByCollection(
    ownerId: string,
    collectionId: string,
    query: ListBookmarksQueryDto,
  ): Promise<Paginated<Bookmark>> {
    return this.list(ownerId, { ...query, collectionId, uncategorised: false });
  }

  async findOne(ownerId: string, id: string): Promise<Bookmark> {
    const bookmark = await this.prisma.bookmark.findFirst({ where: { id, ownerId } });
    if (!bookmark) notFound('Bookmark');
    return bookmark;
  }

  async create(ownerId: string, dto: CreateBookmarkDto): Promise<Bookmark> {
    await this.assertCollectionUsable(ownerId, dto.collectionId);
    return this.prisma.bookmark.create({
      data: {
        url: dto.url,
        title: dto.title,
        notes: dto.notes ?? null,
        collectionId: dto.collectionId ?? null,
        ownerId, // from the verified token, never from dto
      },
    });
  }

  /** PUT — full replace, so omitted optional fields are reset to null. */
  async replace(ownerId: string, id: string, dto: ReplaceBookmarkDto): Promise<Bookmark> {
    await this.assertCollectionUsable(ownerId, dto.collectionId);
    return this.write(ownerId, id, {
      url: dto.url,
      title: dto.title,
      notes: dto.notes ?? null,
      collection: dto.collectionId
        ? { connect: { id: dto.collectionId } }
        : { disconnect: true },
    });
  }

  /** PATCH — only provided fields; `notes: null` and `collectionId: null` are meaningful. */
  async patch(ownerId: string, id: string, dto: PatchBookmarkDto): Promise<Bookmark> {
    await this.assertCollectionUsable(ownerId, dto.collectionId);

    const data: Prisma.BookmarkUpdateInput = {};
    if (dto.url !== undefined) data.url = dto.url;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.collectionId !== undefined) {
      data.collection =
        dto.collectionId === null ? { disconnect: true } : { connect: { id: dto.collectionId } };
    }
    return this.write(ownerId, id, data);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    try {
      await this.prisma.bookmark.delete({ where: { id, ownerId } });
    } catch (err) {
      rethrowAsNotFound(err, 'Bookmark');
    }
  }

  /** The nested read carries its own ownerId rather than trusting the parent. */
  async listAllGrouped(ownerId: string) {
    const [collections, uncategorised] = await this.prisma.$transaction([
      this.prisma.collection.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
        include: { bookmarks: { where: { ownerId }, orderBy: { createdAt: 'desc' } } },
      }),
      this.prisma.bookmark.findMany({
        where: { ownerId, collectionId: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { collections, uncategorised };
  }

  private async write(
    ownerId: string,
    id: string,
    data: Prisma.BookmarkUpdateInput,
  ): Promise<Bookmark> {
    try {
      return await this.prisma.bookmark.update({ where: { id, ownerId }, data });
    } catch (err) {
      rethrowAsNotFound(err, 'Bookmark');
    }
  }
}
