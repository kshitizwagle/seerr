import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getRecentEpisodeNumbers,
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
});
