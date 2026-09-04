import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { AxiosInstance } from 'axios';

import SonarrAPI, { type SonarrSeries } from '@server/api/servarr/sonarr';

function buildSonarr(): SonarrAPI {
  return new SonarrAPI({ url: 'http://localhost:8989/api/v3', apiKey: 'test' });
}

function getAxios(sonarr: SonarrAPI): AxiosInstance {
  return (sonarr as unknown as { axios: AxiosInstance }).axios;
}

describe('SonarrAPI removeSeries', () => {
  afterEach(() => mock.restoreAll());

  it('removes the series when it exists in the library', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await sonarr.removeSeries(1234);

    assert.strictEqual(del.mock.callCount(), 1);
    assert.strictEqual(del.mock.calls[0].arguments[0], '/series/9');
  });

  it('does nothing when the series is not in the library', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({
      data: [{ id: 0, title: 'Breaking Bad' }],
    }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.doesNotReject(() => sonarr.removeSeries(1234));
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('rejects when the tvdbId is unknown to the lookup', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({ data: [] }));
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.rejects(() => sonarr.removeSeries(1234), /Series not found/);
    assert.strictEqual(del.mock.callCount(), 0);
  });

  it('ignores a 404 when the series was already removed in Sonarr', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    mock.method(getAxios(sonarr), 'delete', async () => {
      throw { response: { status: 404 } };
    });

    await assert.doesNotReject(() => sonarr.removeSeries(1234));
  });

  it('rethrows errors other than 404', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      id: 9,
      title: 'Test Series',
    }));
    mock.method(getAxios(sonarr), 'delete', async () => {
      throw { response: { status: 500 } };
    });

    await assert.rejects(() => sonarr.removeSeries(1234));
  });

  it('rethrows a 404 from the lookup instead of treating it as removed', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => {
      throw { response: { status: 404 } };
    });
    const del = mock.method(getAxios(sonarr), 'delete', async () => ({}));

    await assert.rejects(
      () => sonarr.removeSeries(1234),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 404
    );
    assert.strictEqual(del.mock.callCount(), 0);
  });
});

describe('SonarrAPI getSeriesByTvdbId', () => {
  afterEach(() => mock.restoreAll());

  it('rethrows a 401 from the lookup with the status intact', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => {
      throw { response: { status: 401 } };
    });

    await assert.rejects(
      () => sonarr.getSeriesByTvdbId(1234),
      (e: unknown) =>
        (e as { response?: { status?: number } }).response?.status === 401
    );
  });

  it('throws "Series not found" when the lookup returns no results', async () => {
    const sonarr = buildSonarr();
    mock.method(getAxios(sonarr), 'get', async () => ({ data: [] }));

    await assert.rejects(() => sonarr.getSeriesByTvdbId(1234), {
      message: 'Series not found',
    });
  });
});

describe('SonarrAPI addSeries episode selection', () => {
  afterEach(() => mock.restoreAll());

  it('monitors only the selected episodes for an existing series', async () => {
    const sonarr = buildSonarr();
    const series = {
      id: 9,
      seasons: [{ seasonNumber: 1, monitored: true }],
    } as unknown as SonarrSeries;
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => series);
    mock.method(getAxios(sonarr), 'get', async () => ({
      data: [
        { id: 101, seasonNumber: 1, episodeNumber: 1, monitored: false },
        { id: 102, seasonNumber: 1, episodeNumber: 2, monitored: false },
        { id: 103, seasonNumber: 1, episodeNumber: 3, monitored: false },
      ],
    }));
    const put = mock.method(getAxios(sonarr), 'put', async () => ({
      data: series,
    }));

    await sonarr.addSeries({
      tvdbid: 1234,
      title: 'Test Series',
      profileId: 1,
      seasons: [1],
      seasonEpisodes: [{ seasonNumber: 1, episodeNumbers: [1, 3] }],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
    } as Parameters<SonarrAPI['addSeries']>[0]);

    const seriesUpdate = put.mock.calls.find(
      (call) => call.arguments[0] === '/series'
    );
    assert.strictEqual(
      (seriesUpdate?.arguments[1] as SonarrSeries).seasons[0].monitored,
      false
    );
    assert.strictEqual(
      (seriesUpdate?.arguments[1] as SonarrSeries).monitorNewItems,
      'none'
    );

    const episodeMonitor = put.mock.calls.find(
      (call) => call.arguments[0] === '/episode/monitor'
    );
    assert.deepStrictEqual(
      (episodeMonitor?.arguments[1] as { episodeIds: number[] }).episodeIds,
      [101, 103]
    );
  });

  it('waits for episodes to be available before monitoring a new series', async () => {
    const sonarr = buildSonarr();
    mock.method(SonarrAPI.prototype, 'getSeriesByTvdbId', async () => ({
      seasons: [{ seasonNumber: 1, monitored: false }],
    }));
    let episodeRequestCount = 0;
    mock.method(getAxios(sonarr), 'get', async (path: string) => {
      if (path === '/episode') {
        episodeRequestCount += 1;
        return {
          data:
            episodeRequestCount === 1
              ? []
              : [
                  {
                    id: 101,
                    seasonNumber: 1,
                    episodeNumber: 1,
                    monitored: false,
                  },
                ],
        };
      }
      throw new Error(`Unexpected GET ${path}`);
    });
    const post = mock.method(getAxios(sonarr), 'post', async (path: string) => {
      if (path === '/series') {
        return { data: { id: 10 } };
      }
      throw new Error(`Unexpected POST ${path}`);
    });
    const put = mock.method(getAxios(sonarr), 'put', async () => ({
      data: { id: 101 },
    }));

    await sonarr.addSeries({
      tvdbid: 1234,
      title: 'Test Series',
      profileId: 1,
      seasons: [1],
      seasonEpisodes: [{ seasonNumber: 1, episodeNumbers: [1] }],
      seasonFolder: true,
      rootFolderPath: '/tv',
      seriesType: 'standard',
      searchNow: false,
    });

    assert.strictEqual(post.mock.callCount(), 1);
    const episodeMonitor = put.mock.calls.find(
      (call) => call.arguments[0] === '/episode/monitor'
    );
    assert.deepStrictEqual(
      (episodeMonitor?.arguments[1] as { episodeIds: number[] }).episodeIds,
      [101]
    );
    assert.strictEqual(episodeRequestCount, 2);
  });
});
