import type { DownloadingItem } from '@server/lib/downloadtracker';
import type { Episode } from '@server/models/Tv';

export type SeasonEpisodeSelection = {
  seasonNumber: number;
  episodeNumbers: number[];
};

export const isEpisodeSelected = ({
  episodeNumber,
  selectedEpisodeNumbers,
  allSelected,
  requested,
  available = false,
  downloading = false,
}: {
  episodeNumber: number;
  selectedEpisodeNumbers: number[];
  allSelected: boolean;
  requested: boolean;
  available?: boolean;
  downloading?: boolean;
}): boolean =>
  allSelected ||
  requested ||
  available ||
  downloading ||
  selectedEpisodeNumbers.includes(episodeNumber);

export const findEpisodeDownload = (
  downloads: DownloadingItem[],
  seasonNumber: number,
  episodeNumber: number
): DownloadingItem | undefined =>
  downloads.find(
    (download) =>
      download.episode?.seasonNumber === seasonNumber &&
      download.episode?.episodeNumber === episodeNumber
  );

export const getDownloadProgress = (
  download?: Partial<Pick<DownloadingItem, 'size' | 'sizeLeft'>> | null
): number => {
  const size = download?.size;
  const sizeLeft = download?.sizeLeft;

  if (
    typeof size !== 'number' ||
    typeof sizeLeft !== 'number' ||
    !Number.isFinite(size) ||
    !Number.isFinite(sizeLeft) ||
    size <= 0
  ) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, Math.round(((size - sizeLeft) / size) * 100))
  );
};

export const isRecentEpisode = (
  airDate: string | null,
  now = new Date()
): boolean => {
  if (!airDate) {
    return false;
  }

  const episodeDate = Date.parse(`${airDate}T00:00:00Z`);
  const cutoff = now.getTime() - 90 * 24 * 60 * 60 * 1000;

  return Number.isFinite(episodeDate) && episodeDate >= cutoff;
};

export const getRecentEpisodeNumbers = (
  episodes: Pick<Episode, 'episodeNumber' | 'airDate'>[],
  now = new Date()
): number[] =>
  episodes
    .filter((episode) => isRecentEpisode(episode.airDate, now))
    .map((episode) => episode.episodeNumber);

export const serializeSeasonEpisodes = (
  selectedEpisodes: Record<number, number[]>
): SeasonEpisodeSelection[] =>
  Object.entries(selectedEpisodes)
    .filter(([, episodeNumbers]) => episodeNumbers.length > 0)
    .map(([seasonNumber, episodeNumbers]) => ({
      seasonNumber: Number(seasonNumber),
      episodeNumbers: [...episodeNumbers].sort((a, b) => a - b),
    }));
