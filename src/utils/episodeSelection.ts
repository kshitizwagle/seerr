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
}: {
  episodeNumber: number;
  selectedEpisodeNumbers: number[];
  allSelected: boolean;
  requested: boolean;
}): boolean =>
  allSelected || requested || selectedEpisodeNumbers.includes(episodeNumber);

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
