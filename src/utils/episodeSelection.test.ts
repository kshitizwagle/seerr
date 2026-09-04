import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaStatus } from '@server/constants/media';
import type { Episode } from '@server/models/Tv';
import {
  findEpisodeDownload,
  getDownloadProgress,
  getRecentEpisodeNumbers,
  isEpisodeAvailable,
  isEpisodeSelected,
  serializeSeasonEpisodes,
} from './episodeSelection';

describe('episode selection helpers', () => {
  it('includes future and episodes from the last 90 days only', () => {
    const now = new Date('2026-09-04T00:00:00Z');

    assert.deepStrictEqual(
      getRecentEpisodeNumbers(
        [
          { episodeNumber: 1, airDate: '2026-06-06' },
          { episodeNumber: 2, airDate: '2026-06-05' },
          { episodeNumber: 3, airDate: '2026-09-10' },
          { episodeNumber: 4, airDate: null },
        ],
        now
      ),
      [1, 3]
    );
  });

  it('serializes exact episode selections in stable order', () => {
    assert.deepStrictEqual(serializeSeasonEpisodes({ 2: [4, 1], 1: [3] }), [
      { seasonNumber: 1, episodeNumbers: [3] },
      { seasonNumber: 2, episodeNumbers: [1, 4] },
    ]);
  });

  it('prefers explicit episode unavailability over an available season', () => {
    const episode = {
      status: { requested: false, available: false, monitored: false },
    } as Episode;

    assert.strictEqual(
      isEpisodeAvailable(episode, MediaStatus.AVAILABLE),
      false
    );
  });

  it('marks episodes from an existing request as selected', () => {
    assert.strictEqual(
      isEpisodeSelected({
        episodeNumber: 1,
        selectedEpisodeNumbers: [],
        allSelected: false,
        requested: true,
      }),
      true
    );
  });

  it('marks available and downloading episodes as selected', () => {
    assert.strictEqual(
      isEpisodeSelected({
        episodeNumber: 1,
        selectedEpisodeNumbers: [],
        allSelected: false,
        requested: false,
        available: true,
      }),
      true
    );
    assert.strictEqual(
      isEpisodeSelected({
        episodeNumber: 2,
        selectedEpisodeNumbers: [],
        allSelected: false,
        requested: false,
        downloading: true,
      }),
      true
    );
  });

  it('finds a download for an exact season and episode', () => {
    const download = {
      externalId: 47,
      episode: {
        seasonNumber: 1,
        episodeNumber: 2,
        absoluteEpisodeNumber: 2,
        id: 102,
      },
    } as Parameters<typeof findEpisodeDownload>[0][number];

    assert.strictEqual(findEpisodeDownload([download], 1, 2), download);
    assert.strictEqual(findEpisodeDownload([download], 2, 2), undefined);
  });

  it('returns clamped download progress without NaN', () => {
    assert.strictEqual(getDownloadProgress({ size: 100, sizeLeft: 25 }), 75);
    assert.strictEqual(getDownloadProgress({ size: 0, sizeLeft: 0 }), 0);
    assert.strictEqual(getDownloadProgress(undefined), 0);
    assert.strictEqual(getDownloadProgress({ size: 100, sizeLeft: 150 }), 0);
    assert.strictEqual(getDownloadProgress({ size: 100, sizeLeft: -10 }), 100);
  });
});
