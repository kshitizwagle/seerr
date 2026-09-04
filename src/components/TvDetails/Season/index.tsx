import AirDateBadge from '@app/components/AirDateBadge';
import Badge from '@app/components/Common/Badge';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isEpisodeSelected } from '@app/utils/episodeSelection';
import { MediaStatus } from '@server/constants/media';
import type { SeasonWithEpisodes } from '@server/models/Tv';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.TvDetails.Season', {
  somethingwentwrong: 'Something went wrong while retrieving season data.',
  noepisodes: 'Episode list unavailable.',
  monitored: 'Monitored',
});

type SeasonProps = {
  seasonNumber: number;
  tvId: number;
  is4k?: boolean;
  selectable?: boolean;
  selectedEpisodeNumbers?: number[];
  onToggleEpisode?: (episodeNumber: number) => void;
};

const Season = ({
  seasonNumber,
  tvId,
  is4k = false,
  selectable = false,
  selectedEpisodeNumbers = [],
  onToggleEpisode,
}: SeasonProps) => {
  const intl = useIntl();
  const { data, error } = useSWR<SeasonWithEpisodes>(
    `/api/v1/tv/${tvId}/season/${seasonNumber}${is4k ? '?is4k=true' : ''}`
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <div>{intl.formatMessage(messages.somethingwentwrong)}</div>;
  }

  return (
    <div className="flex flex-col justify-center divide-y divide-gray-700">
      {data.episodes.length === 0 ? (
        <p>{intl.formatMessage(messages.noepisodes)}</p>
      ) : (
        data.episodes
          .slice()
          .reverse()
          .map((episode) => {
            const selectedInRequest = selectedEpisodeNumbers.includes(
              episode.episodeNumber
            );
            const requested = !!episode.status?.requested;
            const selected = isEpisodeSelected({
              episodeNumber: episode.episodeNumber,
              selectedEpisodeNumbers,
              allSelected: false,
              requested,
            });
            const unavailable =
              data.status === MediaStatus.AVAILABLE ||
              !!episode.status?.available ||
              (requested && !selectedInRequest);

            return (
              <div
                className="flex flex-col space-y-4 py-4 xl:flex-row xl:space-x-4 xl:space-y-4"
                key={`season-${seasonNumber}-episode-${episode.episodeNumber}`}
              >
                <div className="flex-1">
                  <div className="flex flex-col space-y-2 xl:flex-row xl:items-center xl:space-x-2 xl:space-y-0">
                    {selectable && onToggleEpisode && (
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={unavailable}
                        onChange={() => onToggleEpisode(episode.episodeNumber)}
                        aria-label={episode.name}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
                      />
                    )}
                    <h3 className="text-lg">
                      {episode.episodeNumber}
                      <span className="mx-1 text-gray-500" aria-hidden="true">
                        •
                      </span>
                      {episode.name}
                    </h3>
                    {episode.airDate && (
                      <AirDateBadge airDate={episode.airDate} />
                    )}
                    {episode.status?.available && (
                      <Badge badgeType="success">
                        {intl.formatMessage(globalMessages.available)}
                      </Badge>
                    )}
                    {episode.status?.requested && !episode.status.available && (
                      <Badge badgeType="warning">
                        {intl.formatMessage(globalMessages.requested)}
                      </Badge>
                    )}
                    {episode.status?.monitored &&
                      !episode.status.available &&
                      !episode.status.requested && (
                        <Badge badgeType="primary">
                          {intl.formatMessage(messages.monitored)}
                        </Badge>
                      )}
                  </div>
                  {episode.overview && <p>{episode.overview}</p>}
                </div>
                {episode.stillPath && (
                  <div className="relative aspect-video xl:h-32">
                    <CachedImage
                      type="tmdb"
                      className="rounded-lg object-contain"
                      src={episode.stillPath}
                      alt=""
                      fill
                    />
                  </div>
                )}
              </div>
            );
          })
      )}
    </div>
  );
};

export default Season;
