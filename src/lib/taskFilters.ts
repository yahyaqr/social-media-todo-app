import type { StageId } from '../data/stages';

export const ALL_CLIENT_TAGS = '__all_client_tags__';
export const UNTAGGED_CLIENT_TAG = '__untagged_client_tag__';
export const FILTER_STORAGE_KEY_PREFIX = 'social-todo:filters:';

type FilterMode = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';

type PersistedFilters = {
  filter: FilterMode;
  clientTagFilter: string;
};

const FILTER_MODES: FilterMode[] = ['all', 'today', 'upcoming', 'overdue', 'completed'];

export const getFilterStorageKey = (stageId: StageId): string => `${FILTER_STORAGE_KEY_PREFIX}${stageId}`;

export const loadPersistedFilters = (stageId: StageId): PersistedFilters => {
  const fallback: PersistedFilters = { filter: 'all', clientTagFilter: ALL_CLIENT_TAGS };
  const raw = window.localStorage.getItem(getFilterStorageKey(stageId));
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as { filter?: unknown; clientTagFilter?: unknown };
    const persistedFilter =
      typeof parsed.filter === 'string' && FILTER_MODES.includes(parsed.filter as FilterMode)
        ? (parsed.filter as FilterMode)
        : fallback.filter;
    const persistedClientTag =
      typeof parsed.clientTagFilter === 'string' ? parsed.clientTagFilter : fallback.clientTagFilter;

    return {
      filter: persistedFilter,
      clientTagFilter: persistedClientTag
    };
  } catch {
    return fallback;
  }
};

export const getDefaultClientTagFromFilter = (clientTagFilter: string): string => {
  if (clientTagFilter === ALL_CLIENT_TAGS || clientTagFilter === UNTAGGED_CLIENT_TAG) {
    return '';
  }

  return clientTagFilter;
};
