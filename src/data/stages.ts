export type StageId = 'ideation' | 'research' | 'draft' | 'produce' | 'publish';

export type Stage = {
  id: StageId;
  title: string;
  description: string;
};

export type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  dueAt?: number;
  clientTag?: string;
  link?: string;
};

export const stages: Stage[] = [
  {
    id: 'ideation',
    title: 'Ideation',
    description: 'Capture angles, hooks, and content themes worth testing.'
  },
  {
    id: 'research',
    title: 'Research & Outline',
    description: 'Validate ideas, gather references, and define your structure.'
  },
  {
    id: 'draft',
    title: 'Draft / Script',
    description: 'Write the first version of your post, script, or talking points.'
  },
  {
    id: 'produce',
    title: 'Design / Produce',
    description: 'Create visuals, record clips, and assemble final creative assets.'
  },
  {
    id: 'publish',
    title: 'Publish & Optimize',
    description: 'Ship, monitor results, and log improvements for next time.'
  }
];

const now = Date.now();

const makeSeed = (text: string, offset: number): Todo => ({
  id: `seed-${offset}`,
  text,
  done: false,
  createdAt: now + offset
});

export const seedTodosByStage: Record<StageId, Todo[]> = {
  ideation: [
    makeSeed('List 10 audience pain points', 1),
    makeSeed('Pick 3 hook ideas for this week', 2),
    makeSeed('Choose one high-priority topic', 3)
  ],
  research: [
    makeSeed('Collect 5 supporting references', 4),
    makeSeed('Define post goal and CTA', 5),
    makeSeed('Create bullet outline', 6)
  ],
  draft: [
    makeSeed('Write first draft headline', 7),
    makeSeed('Draft opening in first 2 lines', 8),
    makeSeed('Finalize script with CTA', 9)
  ],
  produce: [
    makeSeed('Prepare shot list or design frames', 10),
    makeSeed('Record or design core assets', 11),
    makeSeed('Export mobile-friendly format', 12)
  ],
  publish: [
    makeSeed('Schedule post with caption + tags', 13),
    makeSeed('Reply to first comments within 30 min', 14),
    makeSeed('Review metrics and note one improvement', 15)
  ]
};

