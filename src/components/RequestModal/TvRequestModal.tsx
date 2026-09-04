import AirDateBadge from '@app/components/AirDateBadge';
import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Modal from '@app/components/Common/Modal';
import type { RequestOverrides } from '@app/components/RequestModal/AdvancedRequester';
import AdvancedRequester from '@app/components/RequestModal/AdvancedRequester';
import QuotaDisplay from '@app/components/RequestModal/QuotaDisplay';
import SearchByNameModal from '@app/components/RequestModal/SearchByNameModal';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  findEpisodeDownload,
  getDownloadProgress,
  getRecentEpisodeNumbers,
  isEpisodeSelected,
  serializeSeasonEpisodes,
  type SeasonEpisodeSelection,
} from '@app/utils/episodeSelection';
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import type SeasonRequest from '@server/entity/SeasonRequest';
import type { NonFunctionProperties } from '@server/interfaces/api/common';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import type { DownloadingItem } from '@server/lib/downloadtracker';
import { Permission } from '@server/lib/permissions';
import type { SeasonWithEpisodes, TvDetails } from '@server/models/Tv';
import axios from 'axios';
import { Fragment, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';

const messages = defineMessages('components.RequestModal', {
  requestadmin: 'This request will be approved automatically.',
  requestSuccess: '<strong>{title}</strong> requested successfully!',
  requestseriestitle: 'Request Series',
  requestseries4ktitle: 'Request Series in 4K',
  edit: 'Edit Request',
  approve: 'Approve Request',
  cancel: 'Cancel Request',
  pendingrequest: 'Pending Request',
  pending4krequest: 'Pending 4K Request',
  requestfrom: "{username}'s request is pending approval.",
  requestseasons:
    'Request {seasonCount} {seasonCount, plural, one {Season} other {Seasons}}',
  requestseasons4k:
    'Request {seasonCount} {seasonCount, plural, one {Season} other {Seasons}} in 4K',
  alreadyrequested: 'Already Requested',
  selectseason: 'Select Season(s)',
  season: 'Season',
  numberofepisodes: '# of Episodes',
  seasonnumber: 'Season {number}',
  errorediting: 'Something went wrong while editing the request.',
  requestedited: 'Request for <strong>{title}</strong> edited successfully!',
  requestApproved: 'Request for <strong>{title}</strong> approved!',
  requestcancelled: 'Request for <strong>{title}</strong> canceled.',
  autoapproval: 'Automatic Approval',
  requesterror: 'Something went wrong while submitting the request.',
  pendingapproval: 'Your request is pending approval.',
  recentEpisodes: 'Select Recent Episodes',
  recentEpisodesError: 'Unable to retrieve recent episodes.',
  expandSeason: 'Select episodes for {season}',
  midSeasonFinale: 'Mid-Season Finale',
  seasonFinale: 'Season Finale',
  seriesFinale: 'Series Finale',
  downloadProgress: 'Download progress: {progress}%',
});

interface RequestModalProps extends React.HTMLAttributes<HTMLDivElement> {
  tmdbId: number;
  onCancel?: () => void;
  onComplete?: (newStatus: MediaStatus) => void;
  onUpdating?: (isUpdating: boolean) => void;
  is4k?: boolean;
  editRequest?: NonFunctionProperties<MediaRequest>;
  initialSeasonEpisodes?: SeasonEpisodeSelection[];
}

const getEpisodeSelectionMap = (
  selections: {
    seasonNumber: number;
    episodeNumbers?: number[] | null;
  }[]
): Record<number, number[]> =>
  selections.reduce<Record<number, number[]>>((result, selection) => {
    if (selection.episodeNumbers?.length) {
      result[selection.seasonNumber] = [...selection.episodeNumbers];
    }
    return result;
  }, {});

const getFinaleMessage = (finaleType?: string) => {
  switch (finaleType?.replace(/[-_]/g, '').toLowerCase()) {
    case 'midseason':
      return messages.midSeasonFinale;
    case 'season':
      return messages.seasonFinale;
    case 'series':
      return messages.seriesFinale;
    default:
      return undefined;
  }
};

interface EpisodeSelectionProps {
  tmdbId: number;
  seasonNumber: number;
  is4k: boolean;
  selectedEpisodeNumbers: number[];
  allSelected: boolean;
  downloadItems: DownloadingItem[];
  onToggle: (episodeNumber: number, allEpisodeNumbers: number[]) => void;
}

const EpisodeSelection = ({
  tmdbId,
  seasonNumber,
  is4k,
  selectedEpisodeNumbers,
  allSelected,
  downloadItems,
  onToggle,
}: EpisodeSelectionProps) => {
  const intl = useIntl();
  const { data } = useSWR<SeasonWithEpisodes>(
    `/api/v1/tv/${tmdbId}/season/${seasonNumber}?is4k=${is4k}`,
    {
      revalidateOnMount: true,
      refreshInterval: 15000,
    }
  );

  if (!data) {
    return <div className="py-3 text-sm text-gray-400">Loading episodes…</div>;
  }

  const allEpisodeNumbers = data.episodes.map(
    (episode) => episode.episodeNumber
  );

  return (
    <div className="grid grid-cols-1 gap-1 py-1 lg:grid-cols-2">
      {data.episodes.map((episode) => {
        const selectedInRequest =
          allSelected || selectedEpisodeNumbers.includes(episode.episodeNumber);
        const requested = !!episode.status?.requested;
        const available =
          data.status === MediaStatus.AVAILABLE || !!episode.status?.available;
        const downloadItem = findEpisodeDownload(
          downloadItems,
          seasonNumber,
          episode.episodeNumber
        );
        const downloading = !!downloadItem;
        const selected = isEpisodeSelected({
          episodeNumber: episode.episodeNumber,
          selectedEpisodeNumbers,
          allSelected,
          requested,
          available,
          downloading,
        });
        const finaleMessage = getFinaleMessage(episode.finaleType);
        const unavailable =
          available || downloading || (requested && !selectedInRequest);
        const downloadProgress = downloadItem
          ? getDownloadProgress(downloadItem)
          : undefined;

        return (
          <label
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded px-2 py-1.5 hover:bg-gray-700/50"
            key={`episode-selection-${seasonNumber}-${episode.episodeNumber}`}
          >
            <input
              type="checkbox"
              checked={selected}
              disabled={unavailable}
              onChange={() =>
                onToggle(episode.episodeNumber, allEpisodeNumbers)
              }
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
            />
            <span className="min-w-0 flex-1 truncate text-sm text-gray-200">
              {episode.episodeNumber}
              <span className="mx-1 text-gray-500" aria-hidden="true">
                •
              </span>
              {episode.name}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {episode.airDate && <AirDateBadge airDate={episode.airDate} />}
              {finaleMessage && (
                <Badge badgeType="light">
                  {intl.formatMessage(finaleMessage)}
                </Badge>
              )}
              {downloadProgress !== undefined && (
                <div
                  className="flex w-24 items-center gap-1"
                  role="progressbar"
                  aria-label={intl.formatMessage(messages.downloadProgress, {
                    progress: downloadProgress,
                  })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={downloadProgress}
                >
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-700">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-[width] duration-300 ease-out"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">
                    {downloadProgress}%
                  </span>
                </div>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
};

const TvRequestModal = ({
  onCancel,
  onComplete,
  tmdbId,
  onUpdating,
  editRequest,
  is4k = false,
  initialSeasonEpisodes = [],
}: RequestModalProps) => {
  const settings = useSettings();
  const { addToast } = useToasts();
  const editingSeasons: number[] = (editRequest?.seasons ?? []).map(
    (season) => season.seasonNumber
  );
  const { data, error } = useSWR<TvDetails>(`/api/v1/tv/${tmdbId}`, {
    revalidateOnMount: true,
    refreshInterval: 15000,
  });
  const [requestOverrides, setRequestOverrides] =
    useState<RequestOverrides | null>(null);
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>(
    editRequest
      ? editingSeasons
      : initialSeasonEpisodes.map((selection) => selection.seasonNumber)
  );
  const [selectedEpisodes, setSelectedEpisodes] = useState<
    Record<number, number[]>
  >(() =>
    getEpisodeSelectionMap(editRequest?.seasons ?? initialSeasonEpisodes)
  );
  const openSeason = useRef<{
    seasonNumber: number;
    close: (focusableElement?: HTMLElement) => void;
  } | null>(null);
  const toggleSeasonDisclosure = (
    seasonNumber: number,
    isOpen: boolean,
    close: (focusableElement?: HTMLElement) => void,
    focusableElement: HTMLElement
  ) => {
    if (isOpen) {
      openSeason.current = null;
    } else {
      openSeason.current?.close(focusableElement);
      openSeason.current = { seasonNumber, close };
    }
  };
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const [searchModal, setSearchModal] = useState<{
    show: boolean;
  }>({
    show: true,
  });
  const [tvdbId, setTvdbId] = useState<number | undefined>(undefined);
  const { data: quota } = useSWR<QuotaResponse>(
    user &&
      (!requestOverrides?.user?.id || hasPermission(Permission.MANAGE_USERS))
      ? `/api/v1/user/${requestOverrides?.user?.id ?? user.id}/quota`
      : null
  );

  const currentlyRemaining =
    (quota?.tv.remaining ?? 0) -
    selectedSeasons.length +
    (editRequest?.seasons ?? []).length;

  const updateRequest = async (alsoApproveRequest = false) => {
    if (!editRequest) {
      return;
    }

    if (onUpdating) {
      onUpdating(true);
      mutate('/api/v1/request/count');
    }

    try {
      if (selectedSeasons.length > 0) {
        await axios.put(`/api/v1/request/${editRequest.id}`, {
          mediaType: 'tv',
          serverId: requestOverrides?.server,
          profileId: requestOverrides?.profile,
          rootFolder: requestOverrides?.folder,
          languageProfileId: requestOverrides?.language,
          userId: requestOverrides?.user?.id,
          tags: requestOverrides?.tags,
          seasons: selectedSeasons.sort((a, b) => a - b),
          seasonEpisodes: serializeSeasonEpisodes(selectedEpisodes),
        });

        if (alsoApproveRequest) {
          await axios.post(`/api/v1/request/${editRequest.id}/approve`);
        }
      } else {
        await axios.delete(`/api/v1/request/${editRequest.id}`);
      }
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');
      mutate('/api/v1/request/count');

      addToast(
        <span>
          {selectedSeasons.length > 0
            ? intl.formatMessage(
                alsoApproveRequest
                  ? messages.requestApproved
                  : messages.requestedited,
                {
                  title: data?.name,
                  strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
                }
              )
            : intl.formatMessage(messages.requestcancelled, {
                title: data?.name,
                strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
              })}
        </span>,
        {
          appearance: 'success',
          autoDismiss: true,
        }
      );
      if (onComplete) {
        onComplete(MediaStatus.PENDING);
      }
    } catch {
      addToast(<span>{intl.formatMessage(messages.errorediting)}</span>, {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      if (onUpdating) {
        onUpdating(false);
      }
    }
  };

  const sendRequest = async () => {
    if (
      settings.currentSettings.partialRequestsEnabled &&
      selectedSeasons.length === 0
    ) {
      return;
    }

    if (onUpdating) {
      onUpdating(true);
      mutate('/api/v1/request/count');
    }

    try {
      let overrideParams = {};
      if (requestOverrides) {
        overrideParams = {
          serverId: requestOverrides.server,
          profileId: requestOverrides.profile,
          rootFolder: requestOverrides.folder,
          languageProfileId: requestOverrides.language,
          userId: requestOverrides?.user?.id,
          tags: requestOverrides.tags,
        };
      }
      const response = await axios.post<MediaRequest>('/api/v1/request', {
        mediaId: data?.id,
        tvdbId: tvdbId ?? data?.externalIds.tvdbId,
        mediaType: 'tv',
        is4k,
        ignoreQuota: requestOverrides?.ignoreQuota,
        seasons: settings.currentSettings.partialRequestsEnabled
          ? selectedSeasons.sort((a, b) => a - b)
          : getAllSeasons().filter(
              (season) => !getAllRequestedSeasons().includes(season)
            ),
        seasonEpisodes: serializeSeasonEpisodes(selectedEpisodes),
        ...overrideParams,
      });
      mutate('/api/v1/request?filter=all&take=10&sort=modified&skip=0');

      if (response.data) {
        if (onComplete) {
          onComplete(response.data.media.status);
        }
        addToast(
          <span>
            {intl.formatMessage(messages.requestSuccess, {
              title: data?.name,
              strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
            })}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
      }
    } catch {
      addToast(intl.formatMessage(messages.requesterror), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      if (onUpdating) {
        onUpdating(false);
      }
    }
  };

  const getAllSeasons = (): number[] => {
    let allSeasons = (data?.seasons ?? []).filter(
      (season) => season.episodeCount !== 0
    );
    if (!settings.currentSettings.enableSpecialEpisodes) {
      allSeasons = allSeasons.filter((season) => season.seasonNumber > 0);
    }
    return allSeasons.map((season) => season.seasonNumber);
  };

  const getAllRequestedSeasons = (): number[] => {
    const requestedSeasons = (data?.mediaInfo?.requests ?? [])
      .filter(
        (request) =>
          request.is4k === is4k &&
          request.status !== MediaRequestStatus.DECLINED &&
          request.status !== MediaRequestStatus.COMPLETED
      )
      .reduce((requestedSeasons, request) => {
        return [
          ...requestedSeasons,
          ...request.seasons
            .filter(
              (season) =>
                !season.episodeNumbers?.length &&
                !editingSeasons.includes(season.seasonNumber)
            )
            .map((sr) => sr.seasonNumber),
        ];
      }, [] as number[]);

    const availableSeasons = (data?.mediaInfo?.seasons ?? [])
      .filter(
        (season) =>
          (season[is4k ? 'status4k' : 'status'] === MediaStatus.AVAILABLE ||
            season[is4k ? 'status4k' : 'status'] === MediaStatus.PROCESSING) &&
          !requestedSeasons.includes(season.seasonNumber)
      )
      .map((season) => season.seasonNumber);

    return [...requestedSeasons, ...availableSeasons];
  };

  const isSelectedSeason = (seasonNumber: number): boolean =>
    selectedSeasons.includes(seasonNumber);

  const toggleSeason = (seasonNumber: number): void => {
    // If this season already has a pending request, don't allow it to be toggled
    if (getAllRequestedSeasons().includes(seasonNumber)) {
      return;
    }

    const seasonRequest = getSeasonRequest(seasonNumber);
    if (
      seasonRequest?.episodeNumbers?.length &&
      !editingSeasons.includes(seasonNumber)
    ) {
      return;
    }

    // If there are no more remaining requests available, block toggle
    if (
      quota?.tv.limit &&
      currentlyRemaining <= 0 &&
      !isSelectedSeason(seasonNumber)
    ) {
      return;
    }

    if (selectedSeasons.includes(seasonNumber)) {
      setSelectedSeasons((seasons) =>
        seasons.filter((sn) => sn !== seasonNumber)
      );
      setSelectedEpisodes((episodes) => {
        const next = { ...episodes };
        delete next[seasonNumber];
        return next;
      });
    } else {
      setSelectedSeasons((seasons) => [...seasons, seasonNumber]);
    }
  };

  const toggleEpisode = (
    seasonNumber: number,
    episodeNumber: number,
    allEpisodeNumbers: number[]
  ) => {
    if (getAllRequestedSeasons().includes(seasonNumber)) {
      return;
    }

    if (!selectedSeasons.includes(seasonNumber)) {
      if (quota?.tv.limit && currentlyRemaining <= 0) {
        return;
      }
    }

    const current =
      selectedEpisodes[seasonNumber] ??
      (selectedSeasons.includes(seasonNumber) ? allEpisodeNumbers : []);
    const nextNumbers = current.includes(episodeNumber)
      ? current.filter((number) => number !== episodeNumber)
      : [...current, episodeNumber];
    const next = { ...selectedEpisodes };

    if (nextNumbers.length === 0) {
      delete next[seasonNumber];
    } else {
      next[seasonNumber] = nextNumbers.sort((a, b) => a - b);
    }

    setSelectedEpisodes(next);
    setSelectedSeasons((seasons) =>
      nextNumbers.length === 0
        ? seasons.filter((season) => season !== seasonNumber)
        : seasons.includes(seasonNumber)
          ? seasons
          : [...seasons, seasonNumber]
    );
  };

  const selectRecentEpisodes = async () => {
    try {
      const seasons = getAllSeasons().filter(
        (season) => season !== 0 && !getAllRequestedSeasons().includes(season)
      );
      const responses = await Promise.all(
        seasons.map((season) =>
          axios.get<SeasonWithEpisodes>(
            `/api/v1/tv/${tmdbId}/season/${season}?is4k=${is4k}`
          )
        )
      );
      const nextEpisodes = responses.reduce<Record<number, number[]>>(
        (result, response) => {
          const episodeNumbers = getRecentEpisodeNumbers(
            response.data.episodes
          ).filter((episodeNumber) => {
            const episode = response.data.episodes.find(
              (candidate) => candidate.episodeNumber === episodeNumber
            );
            return !episode?.status?.available && !episode?.status?.requested;
          });

          if (episodeNumbers.length > 0) {
            result[response.data.seasonNumber] = episodeNumbers;
          }
          return result;
        },
        {}
      );

      setSelectedEpisodes(nextEpisodes);
      setSelectedSeasons((current) => [
        ...new Set([
          ...current.filter((season) => !seasons.includes(season)),
          ...Object.keys(nextEpisodes).map(Number),
        ]),
      ]);
    } catch {
      addToast(intl.formatMessage(messages.recentEpisodesError), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const unrequestedSeasons = getAllSeasons().filter(
    (season) => !getAllRequestedSeasons().includes(season)
  );

  const toggleAllSeasons = (): void => {
    // If the user has a quota and not enough requests for all seasons, block toggleAllSeasons
    if (
      quota?.tv.limit &&
      (quota?.tv.remaining ?? 0) < unrequestedSeasons.length
    ) {
      return;
    }

    if (
      data &&
      selectedSeasons.length >= 0 &&
      selectedSeasons.length < unrequestedSeasons.length
    ) {
      setSelectedSeasons(unrequestedSeasons);
      setSelectedEpisodes({});
    } else {
      setSelectedSeasons([]);
      setSelectedEpisodes({});
    }
  };

  const isAllSeasons = (): boolean => {
    if (!data) {
      return false;
    }
    return (
      selectedSeasons.filter((season) => season !== 0).length ===
      getAllSeasons().filter(
        (season) => !getAllRequestedSeasons().includes(season) && season !== 0
      ).length
    );
  };

  const getSeasonRequest = (
    seasonNumber: number
  ): SeasonRequest | undefined => {
    let seasonRequest: SeasonRequest | undefined;

    if (
      data?.mediaInfo &&
      (data.mediaInfo.requests || []).filter(
        (request) =>
          request.is4k === is4k &&
          request.status !== MediaRequestStatus.DECLINED &&
          request.status !== MediaRequestStatus.COMPLETED
      ).length > 0
    ) {
      data.mediaInfo.requests
        .filter(
          (request) =>
            request.is4k === is4k &&
            request.status !== MediaRequestStatus.DECLINED &&
            request.status !== MediaRequestStatus.COMPLETED
        )
        .forEach((request) => {
          if (!seasonRequest) {
            seasonRequest = request.seasons.find(
              (season) =>
                season.seasonNumber === seasonNumber &&
                season.status !== MediaRequestStatus.COMPLETED
            );
          }
        });
    }

    return seasonRequest;
  };

  const isOwner = editRequest && editRequest.requestedBy.id === user?.id;

  return data && !error && !data.externalIds.tvdbId && searchModal.show ? (
    <SearchByNameModal
      tvdbId={tvdbId}
      setTvdbId={setTvdbId}
      closeModal={() => setSearchModal({ show: false })}
      onCancel={onCancel}
      modalTitle={intl.formatMessage(
        is4k ? messages.requestseries4ktitle : messages.requestseriestitle
      )}
      modalSubTitle={data.name}
      tmdbId={tmdbId}
      backdrop={`https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${data?.backdropPath}`}
    />
  ) : (
    <Modal
      loading={!data && !error}
      backgroundClickable
      onCancel={tvdbId ? () => setSearchModal({ show: true }) : onCancel}
      onOk={() =>
        editRequest
          ? hasPermission(Permission.MANAGE_REQUESTS)
            ? updateRequest(true)
            : updateRequest()
          : sendRequest()
      }
      title={intl.formatMessage(
        editRequest
          ? is4k
            ? messages.pending4krequest
            : messages.pendingrequest
          : is4k
            ? messages.requestseries4ktitle
            : messages.requestseriestitle
      )}
      subTitle={data?.name}
      dialogClass="sm:max-w-5xl"
      okText={
        editRequest
          ? selectedSeasons.length === 0
            ? intl.formatMessage(messages.cancel)
            : hasPermission(Permission.MANAGE_REQUESTS)
              ? intl.formatMessage(messages.approve)
              : intl.formatMessage(messages.edit)
          : unrequestedSeasons.length === 0
            ? intl.formatMessage(messages.alreadyrequested)
            : !settings.currentSettings.partialRequestsEnabled
              ? intl.formatMessage(
                  is4k ? globalMessages.request4k : globalMessages.request
                )
              : selectedSeasons.length === 0
                ? intl.formatMessage(messages.selectseason)
                : intl.formatMessage(
                    is4k ? messages.requestseasons4k : messages.requestseasons,
                    {
                      seasonCount: selectedSeasons.length,
                    }
                  )
      }
      okDisabled={
        editRequest
          ? false
          : !settings.currentSettings.partialRequestsEnabled &&
              quota?.tv.limit &&
              unrequestedSeasons.length > quota.tv.limit &&
              !requestOverrides?.ignoreQuota
            ? true
            : unrequestedSeasons.length === 0 ||
              (settings.currentSettings.partialRequestsEnabled &&
                selectedSeasons.length === 0)
      }
      okButtonType={
        editRequest
          ? settings.currentSettings.partialRequestsEnabled &&
            selectedSeasons.length === 0
            ? 'danger'
            : hasPermission(Permission.MANAGE_REQUESTS)
              ? 'success'
              : 'primary'
          : 'primary'
      }
      cancelText={
        editRequest
          ? intl.formatMessage(globalMessages.close)
          : tvdbId
            ? intl.formatMessage(globalMessages.back)
            : intl.formatMessage(globalMessages.cancel)
      }
      backdrop={`https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${data?.backdropPath}`}
    >
      {editRequest
        ? isOwner
          ? intl.formatMessage(messages.pendingapproval)
          : intl.formatMessage(messages.requestfrom, {
              username: editRequest?.requestedBy.displayName,
            })
        : null}
      {hasPermission(
        [
          Permission.MANAGE_REQUESTS,
          is4k ? Permission.AUTO_APPROVE_4K : Permission.AUTO_APPROVE,
          is4k ? Permission.AUTO_APPROVE_4K_TV : Permission.AUTO_APPROVE_TV,
        ],
        { type: 'or' }
      ) &&
        !(
          quota?.tv.limit &&
          !settings.currentSettings.partialRequestsEnabled &&
          unrequestedSeasons.length > (quota?.tv.remaining ?? 0)
        ) &&
        getAllRequestedSeasons().length < getAllSeasons().length &&
        !editRequest && (
          <div className="mt-6">
            <Alert
              title={intl.formatMessage(messages.requestadmin)}
              type="info"
            />
          </div>
        )}
      {(quota?.tv.limit ?? 0) > 0 && (
        <QuotaDisplay
          mediaType="tv"
          quota={quota?.tv}
          remaining={
            !settings.currentSettings.partialRequestsEnabled &&
            unrequestedSeasons.length > (quota?.tv.remaining ?? 0)
              ? 0
              : currentlyRemaining
          }
          userOverride={
            requestOverrides?.user && requestOverrides.user.id !== user?.id
              ? requestOverrides?.user?.id
              : undefined
          }
          overLimit={
            !settings.currentSettings.partialRequestsEnabled &&
            unrequestedSeasons.length > (quota?.tv.remaining ?? 0)
              ? unrequestedSeasons.length
              : undefined
          }
        />
      )}
      {settings.currentSettings.partialRequestsEnabled && (
        <button
          type="button"
          className="mb-3 self-start rounded-md bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
          onClick={() => void selectRecentEpisodes()}
        >
          {intl.formatMessage(messages.recentEpisodes)}
        </button>
      )}
      <div className="flex flex-col">
        <div className="-mx-4 sm:mx-0">
          <div className="inline-block min-w-full py-2 align-middle">
            <div className="overflow-hidden border border-gray-700 shadow backdrop-blur sm:rounded-lg">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th
                      className={`w-16 bg-gray-700/80 px-4 py-3 ${
                        !settings.currentSettings.partialRequestsEnabled &&
                        'hidden'
                      }`}
                    >
                      <span
                        role="checkbox"
                        tabIndex={0}
                        aria-checked={isAllSeasons()}
                        onClick={() => toggleAllSeasons()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Space') {
                            toggleAllSeasons();
                          }
                        }}
                        className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none ${
                          quota?.tv.remaining &&
                          quota.tv.limit &&
                          quota.tv.remaining < unrequestedSeasons.length
                            ? 'opacity-50'
                            : ''
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`${
                            isAllSeasons() ? 'bg-indigo-500' : 'bg-gray-800'
                          } absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out`}
                        />
                        <span
                          aria-hidden="true"
                          className={`${
                            isAllSeasons() ? 'translate-x-5' : 'translate-x-0'
                          } absolute left-0 inline-block h-5 w-5 rounded-full border border-gray-200 bg-white shadow transition-transform duration-200 ease-in-out group-focus:border-blue-300 group-focus:ring`}
                        />
                      </span>
                    </th>
                    <th className="bg-gray-700/80 px-1 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200 md:px-6">
                      {intl.formatMessage(messages.season)}
                    </th>
                    <th className="bg-gray-700/80 px-5 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200 md:px-6">
                      {intl.formatMessage(messages.numberofepisodes)}
                    </th>
                    <th className="bg-gray-700/80 px-2 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200 md:px-6">
                      {intl.formatMessage(globalMessages.status)}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {data?.seasons
                    .filter(
                      (season) =>
                        season.episodeCount !== 0 &&
                        (settings.currentSettings.enableSpecialEpisodes ||
                          season.seasonNumber !== 0)
                    )
                    .map((season) => {
                      const seasonRequest = getSeasonRequest(
                        season.seasonNumber
                      );
                      const mediaSeason = data?.mediaInfo?.seasons.find(
                        (sn) =>
                          sn.seasonNumber === season.seasonNumber &&
                          sn[is4k ? 'status4k' : 'status'] !==
                            MediaStatus.UNKNOWN &&
                          sn[is4k ? 'status4k' : 'status'] !==
                            MediaStatus.DELETED
                      );
                      const seasonBlocked = getAllRequestedSeasons().includes(
                        season.seasonNumber
                      );
                      const seasonSelected = isSelectedSeason(
                        season.seasonNumber
                      );
                      const partialRequest =
                        !!seasonRequest?.episodeNumbers?.length &&
                        !editingSeasons.includes(season.seasonNumber);
                      const quotaBlocked =
                        !!quota?.tv.limit &&
                        currentlyRemaining <= 0 &&
                        !seasonSelected;

                      return (
                        <Disclosure as={Fragment} key={`season-${season.id}`}>
                          {({ open, close }) => (
                            <>
                              <tr>
                                <td
                                  className={`whitespace-nowrap px-4 py-4 text-sm font-medium leading-5 text-gray-100 ${
                                    !settings.currentSettings
                                      .partialRequestsEnabled && 'hidden'
                                  }`}
                                >
                                  <span
                                    role="checkbox"
                                    tabIndex={0}
                                    aria-checked={
                                      seasonBlocked || seasonSelected
                                    }
                                    onClick={() =>
                                      toggleSeason(season.seasonNumber)
                                    }
                                    onKeyDown={(e) => {
                                      if (
                                        e.key === 'Enter' ||
                                        e.key === 'Space'
                                      ) {
                                        toggleSeason(season.seasonNumber);
                                      }
                                    }}
                                    className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none ${
                                      seasonBlocked ||
                                      quotaBlocked ||
                                      partialRequest
                                        ? 'opacity-50'
                                        : ''
                                    }`}
                                  >
                                    <span
                                      aria-hidden="true"
                                      className={`${
                                        seasonBlocked || seasonSelected
                                          ? 'bg-indigo-500'
                                          : 'bg-gray-700'
                                      } absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out`}
                                    />
                                    <span
                                      aria-hidden="true"
                                      className={`${
                                        seasonBlocked || seasonSelected
                                          ? 'translate-x-5'
                                          : 'translate-x-0'
                                      } absolute left-0 inline-block h-5 w-5 rounded-full border border-gray-200 bg-white shadow transition-transform duration-200 ease-in-out group-focus:border-blue-300 group-focus:ring`}
                                    />
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-1 py-4 text-sm font-medium leading-5 text-gray-100 md:px-6">
                                  <span>
                                    {season.seasonNumber === 0
                                      ? intl.formatMessage(
                                          globalMessages.specials
                                        )
                                      : intl.formatMessage(
                                          messages.seasonnumber,
                                          { number: season.seasonNumber }
                                        )}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-5 py-4 text-sm leading-5 text-gray-200 md:px-6">
                                  {season.episodeCount}
                                </td>
                                <td className="whitespace-nowrap py-4 pr-2 text-sm leading-5 text-gray-200 md:px-6">
                                  <div className="flex min-w-0 items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1">
                                      {!seasonRequest && !mediaSeason && (
                                        <Badge>
                                          {intl.formatMessage(
                                            globalMessages.notrequested
                                          )}
                                        </Badge>
                                      )}
                                      {!mediaSeason &&
                                        seasonRequest?.status ===
                                          MediaRequestStatus.PENDING && (
                                          <Badge badgeType="warning">
                                            {intl.formatMessage(
                                              globalMessages.pending
                                            )}
                                          </Badge>
                                        )}
                                      {((!mediaSeason &&
                                        seasonRequest?.status ===
                                          MediaRequestStatus.APPROVED) ||
                                        mediaSeason?.[
                                          is4k ? 'status4k' : 'status'
                                        ] === MediaStatus.PROCESSING) && (
                                        <Badge badgeType="primary">
                                          {intl.formatMessage(
                                            globalMessages.requested
                                          )}
                                        </Badge>
                                      )}
                                      {mediaSeason?.[
                                        is4k ? 'status4k' : 'status'
                                      ] === MediaStatus.PARTIALLY_AVAILABLE && (
                                        <Badge badgeType="success">
                                          {intl.formatMessage(
                                            globalMessages.partiallyavailable
                                          )}
                                        </Badge>
                                      )}
                                      {mediaSeason?.[
                                        is4k ? 'status4k' : 'status'
                                      ] === MediaStatus.AVAILABLE && (
                                        <Badge badgeType="success">
                                          {intl.formatMessage(
                                            globalMessages.available
                                          )}
                                        </Badge>
                                      )}
                                    </div>
                                    <DisclosureButton
                                      disabled={
                                        !settings.currentSettings
                                          .partialRequestsEnabled
                                      }
                                      onClick={(event) =>
                                        toggleSeasonDisclosure(
                                          season.seasonNumber,
                                          open,
                                          close,
                                          event.currentTarget
                                        )
                                      }
                                      className="ml-auto flex shrink-0 items-center rounded p-1 text-left text-gray-500 transition-colors hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-default"
                                      aria-label={intl.formatMessage(
                                        messages.expandSeason,
                                        {
                                          season:
                                            season.seasonNumber === 0
                                              ? intl.formatMessage(
                                                  globalMessages.specials
                                                )
                                              : intl.formatMessage(
                                                  messages.seasonnumber,
                                                  {
                                                    number: season.seasonNumber,
                                                  }
                                                ),
                                        }
                                      )}
                                    >
                                      <ChevronDownIcon
                                        className={`h-5 w-5 transition-transform duration-200 ease-in-out motion-reduce:transition-none ${
                                          open ? 'rotate-180' : ''
                                        }`}
                                      />
                                    </DisclosureButton>
                                  </div>
                                </td>
                              </tr>
                              <DisclosurePanel
                                as="tr"
                                transition
                                className="transition duration-200 ease-out data-[closed]:-translate-y-1 data-[closed]:opacity-0 motion-reduce:transition-none"
                              >
                                <td colSpan={4} className="bg-gray-900/40 px-4">
                                  <EpisodeSelection
                                    tmdbId={tmdbId}
                                    seasonNumber={season.seasonNumber}
                                    is4k={is4k}
                                    downloadItems={
                                      data.mediaInfo?.[
                                        is4k
                                          ? 'downloadStatus4k'
                                          : 'downloadStatus'
                                      ] ?? []
                                    }
                                    selectedEpisodeNumbers={
                                      selectedEpisodes[season.seasonNumber] ??
                                      []
                                    }
                                    allSelected={
                                      seasonSelected &&
                                      !selectedEpisodes[season.seasonNumber]
                                    }
                                    onToggle={(
                                      episodeNumber,
                                      allEpisodeNumbers
                                    ) =>
                                      toggleEpisode(
                                        season.seasonNumber,
                                        episodeNumber,
                                        allEpisodeNumbers
                                      )
                                    }
                                  />
                                </td>
                              </DisclosurePanel>
                            </>
                          )}
                        </Disclosure>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {(hasPermission(Permission.REQUEST_ADVANCED) ||
        hasPermission(Permission.MANAGE_REQUESTS)) && (
        <AdvancedRequester
          type="tv"
          is4k={is4k}
          isAnime={data?.keywords.some(
            (keyword) => keyword.id === ANIME_KEYWORD_ID
          )}
          quota={quota}
          onChange={(overrides) => setRequestOverrides(overrides)}
          requestUser={editRequest?.requestedBy}
          defaultOverrides={
            editRequest
              ? {
                  folder: editRequest.rootFolder,
                  profile: editRequest.profileId,
                  server: editRequest.serverId,
                  language: editRequest.languageProfileId,
                  tags: editRequest.tags,
                }
              : undefined
          }
        />
      )}
    </Modal>
  );
};

export default TvRequestModal;
