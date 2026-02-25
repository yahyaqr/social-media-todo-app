import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
  writeBatch
} from 'firebase/firestore';
import { stages, type StageId, type Todo } from '../data/stages';
import { getFirebaseAuth, getFirestoreDb } from '../lib/firebase';

export type TodosByStage = Record<StageId, Todo[]>;

export type CloudSnapshot = {
  todosByStage: TodosByStage;
  clientTags: string[];
};

type TodoDoc = {
  stageId?: string;
  order?: number;
  text?: string;
  done?: boolean;
  createdAt?: number;
  dueAt?: number;
  clientTag?: string;
  links?: string[];
  content?: string;
};

type CloudTodo = Todo & { stageId: StageId; order: number };

const emptyTodosByStage = (): TodosByStage => ({
  ideation: [],
  research: [],
  draft: [],
  produce: [],
  publish: []
});

const emptyCloudTodosByStage = (): Record<StageId, CloudTodo[]> => ({
  ideation: [],
  research: [],
  draft: [],
  produce: [],
  publish: []
});

const stageIdSet = new Set<string>(stages.map((stage) => stage.id));

const asTimestamp = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }

  return undefined;
};

const toTodo = (id: string, data: TodoDoc): CloudTodo | null => {
  const stageId = data.stageId;
  if (!stageId || !stageIdSet.has(stageId)) {
    return null;
  }

  if (typeof data.text !== 'string' || !data.text.trim()) {
    return null;
  }

  return {
    id,
    text: data.text,
    done: Boolean(data.done),
    createdAt: asTimestamp(data.createdAt) ?? Date.now(),
    dueAt: asTimestamp(data.dueAt),
    clientTag: typeof data.clientTag === 'string' ? data.clientTag : undefined,
    links: Array.isArray(data.links)
      ? data.links.filter((link): link is string => typeof link === 'string' && link.trim().length > 0)
      : undefined,
    content: typeof data.content === 'string' ? data.content : undefined,
    stageId: stageId as StageId,
    order: typeof data.order === 'number' && Number.isFinite(data.order) ? data.order : Number.MAX_SAFE_INTEGER
  };
};

const serializeTodo = (todo: Todo, stageId: StageId, order: number) => ({
  text: todo.text,
  done: todo.done,
  createdAt: todo.createdAt,
  dueAt: typeof todo.dueAt === 'number' ? todo.dueAt : deleteField(),
  clientTag: todo.clientTag ?? deleteField(),
  links: todo.links && todo.links.length ? todo.links : deleteField(),
  content: todo.content ?? deleteField(),
  stageId,
  order,
  updatedAt: serverTimestamp()
});

const normalizeClientTags = (clientTags: string[] = []): string[] => {
  return [...new Set(clientTags.map((tag) => tag.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
};

const userTodosCollection = (uid: string) => collection(getFirestoreDb(), 'users', uid, 'todos');

const userProfileRef = (uid: string) => doc(getFirestoreDb(), 'users', uid, 'meta', 'profile');

export const ensureSignedInUid = async (): Promise<string> => {
  const auth = getFirebaseAuth();
  if (auth.currentUser?.uid) {
    return auth.currentUser.uid;
  }

  throw new Error('User is not signed in.');
};

export const subscribeToCloudState = (
  uid: string,
  onState: (state: CloudSnapshot) => void,
  onError: (error: unknown) => void
): Unsubscribe => {
  const todosByStage = emptyTodosByStage();
  let clientTags: string[] = [];

  const emit = () => {
    onState({
      todosByStage: {
        ideation: [...todosByStage.ideation],
        research: [...todosByStage.research],
        draft: [...todosByStage.draft],
        produce: [...todosByStage.produce],
        publish: [...todosByStage.publish]
      },
      clientTags: [...clientTags]
    });
  };

  const todosUnsubscribe = onSnapshot(
    userTodosCollection(uid),
    (snapshot) => {
      const next = emptyCloudTodosByStage();

      for (const docSnap of snapshot.docs) {
        const todo = toTodo(docSnap.id, docSnap.data() as TodoDoc);
        if (!todo) {
          continue;
        }

        next[todo.stageId].push(todo);
      }

      for (const stage of stages) {
        next[stage.id].sort((a, b) => {
          if (a.order !== b.order) {
            return a.order - b.order;
          }

          return b.createdAt - a.createdAt;
        });

        todosByStage[stage.id] = next[stage.id].map((item) => {
          const { stageId: _stageId, order: _order, ...todo } = item;
          return todo;
        });
      }

      emit();
    },
    onError
  );

  const profileUnsubscribe = onSnapshot(
    userProfileRef(uid),
    (snapshot) => {
      const data = snapshot.data();
      clientTags = normalizeClientTags(
        Array.isArray(data?.clientTags)
          ? data.clientTags.filter((tag): tag is string => typeof tag === 'string')
          : []
      );
      emit();
    },
    onError
  );

  return () => {
    todosUnsubscribe();
    profileUnsubscribe();
  };
};

export const upsertCloudTodo = async (
  uid: string,
  stageId: StageId,
  todo: Todo,
  order: number
): Promise<void> => {
  await setDoc(doc(getFirestoreDb(), 'users', uid, 'todos', todo.id), serializeTodo(todo, stageId, order), {
    merge: true
  });
};

export const deleteCloudTodo = async (uid: string, todoId: string): Promise<void> => {
  await deleteDoc(doc(getFirestoreDb(), 'users', uid, 'todos', todoId));
};

export const syncCloudStageOrder = async (
  uid: string,
  stageId: StageId,
  todos: Todo[]
): Promise<void> => {
  await syncCloudStageOrders(uid, [{ stageId, todos }]);
};

export const syncCloudStageOrders = async (
  uid: string,
  updates: Array<{ stageId: StageId; todos: Todo[] }>
): Promise<void> => {
  const db = getFirestoreDb();
  const batch = writeBatch(db);

  for (const update of updates) {
    update.todos.forEach((todo, index) => {
      const todoRef = doc(db, 'users', uid, 'todos', todo.id);
      batch.set(
        todoRef,
        {
          stageId: update.stageId,
          order: index,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    });
  }

  await batch.commit();
};

export const saveCloudClientTags = async (uid: string, clientTags: string[]): Promise<void> => {
  await setDoc(
    userProfileRef(uid),
    {
      clientTags: normalizeClientTags(clientTags),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
};
