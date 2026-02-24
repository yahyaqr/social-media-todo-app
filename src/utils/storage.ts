import type { StageId, Todo } from '../data/stages';

export const STORAGE_KEY = 'sm_todo_v1';

export type TodosByStage = Record<StageId, Todo[]>;

export type PersistedState = {
  todosByStage: TodosByStage;
  clientTags?: string[];
};

export const loadState = (): PersistedState | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
};

export const saveState = (state: PersistedState): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const debounce = <T extends (...args: any[]) => void>(
  fn: T,
  delay = 200
): ((...args: Parameters<T>) => void) => {
  let timeout: number | undefined;

  return (...args: Parameters<T>) => {
    if (timeout) {
      window.clearTimeout(timeout);
    }

    timeout = window.setTimeout(() => {
      fn(...args);
    }, delay);
  };
};
