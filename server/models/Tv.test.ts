import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapEpisodeStatuses } from './Tv';

describe('mapEpisodeStatuses', () => {
  const episodes = [
    { seasonNumber: 1, episodeNumber: 1 },
    { seasonNumber: 1, episodeNumber: 2 },
  ] as Parameters<typeof mapEpisodeStatuses>[0];

  it('maps exact requested, available, and monitored state', () => {
    const result = mapEpisodeStatuses(
      episodes,
      [
        {
          seasonNumber: 1,
          episodeNumber: 1,
          hasFile: true,
          monitored: true,
          finaleType: 'midSeason',
        },
        {
          seasonNumber: 1,
          episodeNumber: 2,
          hasFile: false,
          monitored: false,
        },
      ],
      [{ seasonNumber: 1, episodeNumbers: [2] }]
    );

    assert.deepStrictEqual(result[0].status, {
      requested: false,
      available: true,
      monitored: true,
    });
    assert.equal(result[0].finaleType, 'midSeason');
    assert.deepStrictEqual(result[1].status, {
      requested: true,
      available: false,
      monitored: false,
    });
  });

  it('treats a null episode selection as the whole season', () => {
    const result = mapEpisodeStatuses(
      episodes,
      [],
      [{ seasonNumber: 1, episodeNumbers: null }]
    );

    assert.ok(result.every((episode) => episode.status?.requested));
  });

  it('combines disjoint partial selections for the same season', () => {
    const result = mapEpisodeStatuses(
      episodes,
      [],
      [
        { seasonNumber: 1, episodeNumbers: [1] },
        { seasonNumber: 1, episodeNumbers: [2] },
      ]
    );

    assert.ok(result.every((episode) => episode.status?.requested));
  });

  it('treats an episode file id as available', () => {
    const result = mapEpisodeStatuses(
      episodes,
      [
        {
          seasonNumber: 1,
          episodeNumber: 1,
          episodeFileId: 842,
          hasFile: false,
          monitored: false,
        },
      ],
      []
    );

    assert.strictEqual(result[0].status?.available, true);
  });
});
