export type StageId = 'ideation' | 'research' | 'draft' | 'produce' | 'publish';

export type Stage = {
  id: StageId;
  day: string;
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
  links?: string[];
  content?: string;
};

export const stages: Stage[] = [
  {
    id: 'ideation',
    day: 'Monday',
    title: 'Ideation',
    description: 'Generate and explore content ideas, angles, and creative directions.'
  },
  {
    id: 'research',
    day: 'Tuesday',
    title: 'Outlining',
    description: 'Break down the main ideas into a clear structure and content flow.'
  },
  {
    id: 'draft',
    day: 'Wednesday',
    title: 'Production',
    description: 'Produce the core content—write, record, or build the main material.'
  },
  {
    id: 'produce',
    day: 'Thursday',
    title: 'Editing',
    description: 'Edit videos, refine visuals, and finalize graphic design assets.'
  },
  {
    id: 'publish',
    day: 'Friday',
    title: 'Publishing',
    description: 'Publish the content and distribute it to the intended audience.'
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
