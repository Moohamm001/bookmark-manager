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

  /**
   * The cross-tenant hole this app is most likely to have.
   *
   * Without this check, A can POST a bookmark with B's collectionId. The bookmark is
   * owned by A (so the owner scoping looks fine, and every ownership test still passes),
   * but it is now *inside B's collection* — it shows up in B's `GET
   * /collections/:id/bookmarks`, and A has effectively written into B's account.
   *
   * Two properties make it safe:
   *  - it runs on create AND on both update paths (PUT and PATCH), because "move a
   *    bookmark into a collection" is the same operation as "create it there";
   *  - it 404s, so A cannot use it to probe whether a collection id exists.
   */
  private async assertCollectionUsable(ownerId: string, collectionId: string | null | undefined) {
    if (collectionId === null || collectionId === undefined) return;
    await this.collections.assertOwned(ownerId, collectionId);
  }

  async list(ownerId: string, query: ListBookmarksQueryDto): Promise<Paginated<Bookmark>> {
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;

    // Filtering by a collection you do not own must be indistinguishable from filtering by
    // one that does not exist. Returning an empty list instead would be a subtle oracle:
    // "empty" for a real-but-foreign id vs 404 for a made-up one still leaks existence.
    if (query.collectionId) {
      await this.collections.assertOwned(ownerId, query.collectionId);
    }

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

  /** Bookmarks inside one collection. 404s if the collection is not the caller's. */
  async listByCollection(
    ownerId: string,
    collectionId: string,
    query: ListBookmarksQueryDto,
  ): Promise<Paginated<Bookmark>> {
    await this.collections.assertOwned(ownerId, collectionId);
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

  /** PUT — full replace. Absent optional fields are reset to null, not left alone. */
  async replace(ownerId: string, id: string, dto: ReplaceBookmarkDto): Promise<Bookmark> {
    await this.assertCollectionUsable(ownerId, dto.collectionId);
    try {
      return await this.prisma.bookmark.update({
        where: { id, ownerId },
        data: {
          url: dto.url,
          title: dto.title,
          notes: dto.notes ?? null,
          collectionId: dto.collectionId ?? null,
        },
      });
    } catch (err) {
      rethrowAsNotFound(err, 'Bookmark');
    }
  }

  /** PATCH — only the provided fields. `notes: null` and `collectionId: null` are meaningful. */
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

    try {
      return await this.prisma.bookmark.update({ where: { id, ownerId }, data });
    } catch (err) {
      rethrowAsNotFound(err, 'Bookmark');
    }
  }

  async remove(ownerId: string, id: string): Promise<void> {
    try {
      await this.prisma.bookmark.delete({ where: { id, ownerId } });
    } catch (err) {
      rethrowAsNotFound(err, 'Bookmark');
    }
  }

  /**
   * Bonus /all view: collections with their bookmarks nested, plus the uncategorised pile.
   * The nested read is owner-scoped at BOTH levels — the outer `where` alone would be
   * enough today, but a nested include that trusts its parent is exactly the kind of query
   * that stops being safe when someone later adds sharing.
   */
  async listAllGrouped(ownerId: string) {
    const [collections, uncategorised] = await this.prisma.$transaction([
      this.prisma.collection.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
        include: {
          bookmarks: { where: { ownerId }, orderBy: { createdAt: 'desc' } },
        },
      }),
      this.prisma.bookmark.findMany({
        where: { ownerId, collectionId: null },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { collections, uncategorised };
  }
}
