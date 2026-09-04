import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import {
  DuplicateMediaRequestError,
  MediaRequest,
  NoSeasonsAvailableError,
  QuotaRestrictedError,
} from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import type { MediaRequestBody } from '@server/interfaces/api/requestInterfaces';
import { setupTestDb } from '@server/test/db';

// get is a prototype method unlike getMovie, and replaces the cache lookup too
const externalApiGetMock = mock.method(
  ExternalAPI.prototype as unknown as {
    get: (endpoint: string) => Promise<unknown>;
  },
  'get',
  async (endpoint: string) => {
    if (endpoint.startsWith('/tv/')) {
      const tvId = Number(endpoint.replace('/tv/', ''));

      return {
        id: tvId,
        external_ids: {},
        genres: [],
        keywords: { results: [] },
        seasons: [
          {
            id: 1,
            air_date: '2025-01-01',
            episode_count: 3,
            name: 'Season 1',
            overview: '',
            season_number: 1,
          },
        ],
        videos: { results: [] },
      };
    }

    const movieId = Number(endpoint.replace('/movie/', ''));

    if (!movieId) {
      throw new Error(`Unstubbed external endpoint: ${endpoint}`);
    }

    return {
      id: movieId,
      external_ids: {},
      // Skips getMovie's localized fallback call
      videos: { results: [{ type: 'Trailer', key: 'trailer' }] },
    };
  }
).mock;

mock.method(MediaRequest, 'sendNotification', async () => undefined);

setupTestDb();

beforeEach(() => {
  externalApiGetMock.resetCalls();
});

async function seedRequester(movieQuotaLimit: number): Promise<User> {
  const userRepository = getRepository(User);

  const requester = await userRepository.findOneOrFail({
    where: { email: 'friend@seerr.dev' },
  });
  requester.movieQuotaLimit = movieQuotaLimit;

  return userRepository.save(requester);
}

function requestMovies(mediaIds: number[], requester: User) {
  return Promise.allSettled(
    mediaIds.map((mediaId) =>
      MediaRequest.request(
        { mediaId, mediaType: MediaType.MOVIE, is4k: false },
        requester
      )
    )
  );
}

function rejections(results: PromiseSettledResult<MediaRequest>[]) {
  return results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
}

function tvRequest(
  mediaId: number,
  episodeNumbers?: number[]
): MediaRequestBody {
  return {
    mediaId,
    mediaType: MediaType.TV,
    seasons: [1],
    is4k: false,
    ...(episodeNumbers
      ? {
          seasonEpisodes: [{ seasonNumber: 1, episodeNumbers }],
        }
      : {}),
  } as MediaRequestBody;
}

describe('MediaRequest.request', () => {
  it('rejects the second of two concurrent requests at the movie quota', async () => {
    const requestRepository = getRepository(MediaRequest);
    const requester = await seedRequester(1);

    const results = await requestMovies([11111, 22222], requester);
    const rejected = rejections(results);

    assert.strictEqual(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof QuotaRestrictedError);
    assert.strictEqual(await requestRepository.count(), 1);
    assert.strictEqual(externalApiGetMock.callCount(), 1);
  });

  it('rejects a concurrent duplicate request for the same movie', async () => {
    const requestRepository = getRepository(MediaRequest);
    const requester = await seedRequester(5);

    const results = await requestMovies([33333, 33333], requester);
    const rejected = rejections(results);

    assert.strictEqual(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof DuplicateMediaRequestError);
    assert.strictEqual(await requestRepository.count(), 1);
    assert.strictEqual(externalApiGetMock.callCount(), 2);
  });
});

describe('MediaRequest.request TV episode selection', () => {
  it('persists selected episode numbers on the season request', async () => {
    const requester = await getRepository(User).findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });

    const request = await MediaRequest.request(
      tvRequest(44001, [1, 3]),
      requester
    );

    assert.deepStrictEqual(
      (request.seasons[0] as unknown as { episodeNumbers?: number[] | null })
        .episodeNumbers,
      [1, 3]
    );
  });

  it('rejects an episode number outside the TMDB season metadata', async () => {
    const requester = await getRepository(User).findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });

    await assert.rejects(
      () => MediaRequest.request(tvRequest(44002, [4]), requester),
      /episode/i
    );
  });

  it('allows disjoint partial requests but rejects overlapping episodes', async () => {
    const requester = await getRepository(User).findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });

    await MediaRequest.request(tvRequest(44003, [1]), requester);
    await assert.doesNotReject(() =>
      MediaRequest.request(tvRequest(44003, [2]), requester)
    );
    await assert.rejects(
      () => MediaRequest.request(tvRequest(44003, [1]), requester),
      NoSeasonsAvailableError
    );
  });

  it('keeps legacy season-only requests as whole-season requests', async () => {
    const requester = await getRepository(User).findOneOrFail({
      where: { email: 'friend@seerr.dev' },
    });

    const request = await MediaRequest.request(tvRequest(44004), requester);

    assert.strictEqual(
      (request.seasons[0] as unknown as { episodeNumbers?: number[] | null })
        .episodeNumbers,
      null
    );
  });
});
