export type FrameworkOption = {
  value: string;
  label: string;
  content: string;
};

type CaptionTone = 'Insightful' | 'Reflective' | 'Slightly punchy';

type VersionPreset = {
  code: string;
  label: string;
};

type FrameworkDefinition = {
  value: string;
  label: string;
  frameworkName: string;
  frameworkFullName: string;
  objective: string;
  tone: string;
  structureSteps: string[];
  structureGuidance: string[];
  captionA: CaptionTone;
  captionB: CaptionTone;
  closingLabel: string;
  closingHint: string[];
  versionPresets?: VersionPreset[];
  versionDifferentiator?: string;
  extraCoreConstraints?: string[];
  extraOutputRules?: string[];
};

const joinLines = (lines: string[]) => lines.join('\n');

const buildBulletSection = (title: string, items: string[]) =>
  joinLines([title, ...items.map((item) => `- ${item}`)]);

const COMMON_CORE_CONSTRAINTS = [
  'Treat the Information section at the end as the primary source material and the source of truth',
  'Base the script closely on the user’s original story, sequence, message, and emotional direction',
  'This task is primarily paraphrasing, outlining, restructuring, and tightening — not inventing a new story',
  'Do not add new events, new examples, new backstory, new emotional turns, or new conclusions unless they are already clearly implied by the source material',
  'Do not replace the original story with a more generic or more viral-sounding version',
  'Preserve the original meaning, perspective, and intent',
  'If the source contains specific examples, keep those examples central instead of swapping them out for different ones',
  'If the source contains a specific belief, tension, realization, or conclusion, preserve it',
  'Use simple, spoken Bahasa Indonesia that sounds natural when read aloud',
  'The script must sound spoken, not written',
  'Use natural spoken rhythm: vary sentence length, allow slight imperfection, and avoid overly polished phrasing',
  'Avoid generic motivational, preachy, or cliché language',
  'Do not make the script sound like a quote template, inspirational poster, or AI-generated wisdom content',
  'Prioritize fidelity to the original material over cleverness',
  'Tighten repetition, improve clarity, and improve flow — but do not distort the original point',
  'Follow the recommended length closely',
  'Every sentence should either preserve a key idea from the source, clarify it, sharpen it, or improve its flow'
];

const COMMON_GROUNDING_RULES = [
  'First, identify the actual core story from the source material before writing',
  'Preserve the original speaker position: if the source feels personal, keep it personal; if it feels reflective, keep it reflective',
  'Preserve the original emotional logic: do not force a sharper twist if the source does not support it',
  'Preserve important causal links and sequence from the source',
  'When compressing, remove redundancy first — not substance',
  'When paraphrasing, keep the meaning intact even if wording changes',
  'Do not over-optimize for virality at the expense of faithfulness'
];

const COMMON_RETENTION_RULES = [
  'The opening should still feel engaging, but it must come from the real tension already present in the source material',
  'Do not fabricate a more dramatic hook that changes the user’s original meaning',
  'You may tighten the first line to make it more scroll-stopping, but it must remain faithful to the source',
  'Build curiosity by controlling revelation and flow, not by inventing new drama'
];

const DEFAULT_VERSION_PRESETS: VersionPreset[] = [
  { code: 'V1', label: 'Closest to original -> most faithful paraphrase with minimal reshaping' },
  { code: 'V2', label: 'Cleaner flow -> same story, tighter structure, better spoken rhythm' },
  { code: 'V3', label: 'More emotionally focused -> same story, stronger emphasis on the original emotional tension' }
];

const buildStructureSection = (definition: FrameworkDefinition) =>
  joinLines([
    `Structure (${definition.frameworkName})`,
    ...definition.structureSteps.map((step, index) => `${index + 1}. ${step}`),
    ...definition.structureGuidance.map((item) => `- ${item}`)
  ]);

const buildVersionSection = (definition: FrameworkDefinition) => {
  const presets = definition.versionPresets ?? DEFAULT_VERSION_PRESETS;

  return joinLines([
    'Versioning Approach',
    ...presets.map((preset) => `- ${preset.code}: ${preset.label}`),
    `- ${
      definition.versionDifferentiator ??
      'All versions must stay rooted in the same original source material. They may differ in tightness, emphasis, pacing, and phrasing, but not in core story, meaning, or conclusion.'
    }`
  ]);
};

const buildScriptSubheadingRules = (steps: string[]) =>
  joinLines([
    '- The script must include explicit subheadings for each framework section',
    '- Write the script under these exact subheadings, in this exact order:',
    ...steps.map((step) => `  - ${step}`),
    '- Each subheading must appear inside the Script (Ready to Read), not outside it',
    '- Content under each subheading must remain natural, spoken, and emotionally coherent',
    '- Even with subheadings, the writing should still feel like a real spoken script, not like lecture notes',
    '- Do not skip any subheading'
  ]);

const buildOutputFormatSection = (definition: FrameworkDefinition) =>
  joinLines([
    'Output Format (VERY IMPORTANT)',
    '',
    'For each version, provide:',
    '',
    '1. Title (Angle)',
    '- Short phrase that reflects the actual main idea of the source',
    '- Do not create a misleading or overly viral title that shifts the meaning',
    '',
    '2. Script (Ready to Read)',
    '- Natural flow, optimized for spoken delivery',
    '- Keep it faithful to the source material',
    '- This should feel like a clearer, tighter, more speakable version of the original story',
    buildScriptSubheadingRules(definition.structureSteps),
    ...(definition.extraOutputRules ?? []).map((item) => `- ${item}`),
    '',
    '3. Caption (2 versions)',
    `- Version A: ${definition.captionA}`,
    `- Version B: ${definition.captionB}`,
    '- Keep both concise and aligned with the original story’s meaning',
    '- Do not introduce new angles that are absent from the source',
    '',
    `4. ${definition.closingLabel}`,
    ...definition.closingHint.map((item) => `- ${item}`),
    '',
    'Information:',
    '[insert information]'
  ]);

const buildFrameworkPrompt = (definition: FrameworkDefinition): string =>
  joinLines([
    `Restructure and paraphrase the following user-provided story into Instagram Reels scripts using the ${definition.frameworkName} framework (${definition.frameworkFullName}).`,
    '',
    `Objective: ${definition.objective}`,
    '',
    `Tone: ${definition.tone}`,
    '',
    buildBulletSection('Source Fidelity Rules', [
      ...COMMON_CORE_CONSTRAINTS,
      ...(definition.extraCoreConstraints ?? [])
    ]),
    '',
    buildBulletSection('Grounding Rules', COMMON_GROUNDING_RULES),
    '',
    buildBulletSection('Hook and Retention Rules', COMMON_RETENTION_RULES),
    '',
    buildStructureSection(definition),
    '',
    buildVersionSection(definition),
    '',
    buildOutputFormatSection(definition)
  ]);

const FRAMEWORK_DEFINITIONS: FrameworkDefinition[] = [
  {
    value: 'insight',
    label: 'Insight - Clear & structured thinking',
    frameworkName: 'Claim-Reason-Example',
    frameworkFullName: 'Argumentative Structure (Rhetoric)',
    objective:
      'Turn the original story into a clear, structured insight by presenting a core idea, explaining the reasoning, and grounding it with a real example from the source.',
    tone:
      'Clear, grounded, and conversational. It should feel like the same person explaining their thinking more clearly, not like a lecture.',
    structureSteps: ['Claim', 'Reason', 'Example'],
    structureGuidance: [
      'State the main idea clearly from the source',
      'Explain why that idea is true using the source logic',
      'Support it with a concrete example from the source',
      'End with the same core meaning already present in the source',
      'Do not introduce new arguments, lessons, or ideas'
    ],
    captionA: 'Insightful',
    captionB: 'Slightly punchy',
    closingLabel: 'Closing Line Alternatives (2 options)',
    closingHint: [
      'Both must reinforce the same core idea',
      'Keep them grounded in the original message'
    ],
    extraCoreConstraints: [
      'Do not split one subtle reflection into multiple claims unless the source clearly supports that structure',
      'If the source contains multiple examples, choose the most central one or combine them carefully without changing meaning'
    ],
    extraOutputRules: [
      'Claim must express the source’s actual main point',
      'Reason must come from the source’s actual logic',
      'Example must stay grounded in the source material'
    ]
  },
  {
    value: 'story',
    label: 'Story - Lived experience & transformation',
    frameworkName: 'Story Arc',
    frameworkFullName: 'Setup-Conflict-Resolution',
    objective:
      'Restructure the story into a clear narrative flow that preserves the original experience, tension, and resolution.',
    tone:
      'Natural, human, and grounded. It should feel like a real story being told more clearly, not like a dramatized rewrite.',
    structureSteps: ['Setup', 'Conflict', 'Resolution'],
    structureGuidance: [
      'Anchor the real situation from the source',
      'Highlight the tension, shift, or realization already present in the story',
      'End with the original resolution, takeaway, or perspective change',
      'Do not dramatize beyond the source'
    ],
    captionA: 'Reflective',
    captionB: 'Slightly punchy',
    closingLabel: 'Closing Line Alternatives (2 options)',
    closingHint: [
      'Stay faithful to the original ending',
      'Do not exaggerate the resolution'
    ],
    extraCoreConstraints: [
      'Do not manufacture conflict if the source is subtle or reflective',
      'Do not add extra plot points to make the story feel more cinematic'
    ],
    extraOutputRules: [
      'Setup must anchor the source context clearly',
      'Conflict must reflect the source tension or shift, not a newly dramatized version',
      'Resolution may be a realization, not necessarily a neat ending'
    ]
  },
  {
    value: 'reflection',
    label: 'Reflection - Meaning & personal insight',
    frameworkName: 'Assertion-Illustration-Reflection',
    frameworkFullName: 'Reflective Structure',
    objective:
      'Reshape the story into a reflective script that preserves the original meaning and emotional insight.',
    tone:
      'Reflective, slightly vulnerable, personal, and grounded in the source material.',
    structureSteps: ['Assertion', 'Illustration', 'Reflection'],
    structureGuidance: [
      'Identify the core belief, realization, or emotional truth',
      'Support it with the original lived moment, scene, or detail',
      'End with a grounded reflection, not a newly invented moral',
      'If the source is subtle, keep the reflection subtle'
    ],
    captionA: 'Insightful',
    captionB: 'Slightly punchy',
    closingLabel: 'Reflection Line Alternatives (2 options)',
    closingHint: [
      'Stay subtle and grounded',
      'Do not overstate the message'
    ],
    extraCoreConstraints: [
      'Do not fabricate a more dramatic illustration than what the source supports',
      'Reflection must deepen the original meaning, not replace it'
    ],
    extraOutputRules: [
      'Assertion must come from the source’s real stance',
      'Illustration should come from the source material, not a new hypothetical scenario',
      'Reflection should sound earned by the source material'
    ]
  },
  {
    value: 'structured',
    label: 'Structured - Clear & decisive communication',
    frameworkName: 'Answer-Support-Detail',
    frameworkFullName: 'Pyramid Principle (Simplified)',
    objective:
      'Restructure the story into a clear, top-down explanation that delivers the main idea first, followed by supporting points and brief details from the source.',
    tone:
      'Direct, efficient, and clear without losing the original voice or meaning.',
    structureSteps: ['Answer', 'Support', 'Detail'],
    structureGuidance: [
      'Start with the main conclusion from the source',
      'Support it with 2–3 key ideas already present in the source',
      'Add brief supporting details only when they improve clarity',
      'Avoid unnecessary storytelling or repetition'
    ],
    captionA: 'Insightful',
    captionB: 'Slightly punchy',
    closingLabel: 'Closing Line Alternatives (2 options)',
    closingHint: [
      'Reinforce clarity',
      'Keep it concise and grounded'
    ],
    extraCoreConstraints: [
      'Do not flatten a deeply personal story into cold corporate language',
      'Do not add support points that are not already implied by the source'
    ],
    extraOutputRules: [
      'Answer must present the source conclusion upfront',
      'Support must organize the source logic into clear, non-overlapping points',
      'Detail must stay brief and serve clarity, not expand the story'
    ]
  },
  {
    value: 'engagement',
    label: 'Engagement - Punchline & attention',
    frameworkName: 'Setup-Twist-Punchline',
    frameworkFullName: 'Comedic Structure',
    objective:
      'Restructure the story to highlight contrast and surprise using light comedic tension, while preserving the original meaning and voice.',
    tone:
      'Light, conversational, playful, and natural — not forced humor and not pure stand-up.',
    structureSteps: ['Setup', 'Twist', 'Punchline'],
    structureGuidance: [
      'Build expectation from the original story',
      'Introduce a subtle contrast, reversal, or tension already supported by the source',
      'Deliver a punchline or sharp turn without changing the meaning',
      'Keep the humor human and grounded'
    ],
    captionA: 'Slightly punchy',
    captionB: 'Insightful',
    closingLabel: 'Closing Line Alternatives (2 options)',
    closingHint: [
      'Keep it aligned with the original message',
      'Avoid turning it into pure comedy'
    ],
    extraCoreConstraints: [
      'Do not invent new jokes, characters, or events outside the source context',
      'Humor should sharpen the original point, not overshadow it'
    ],
    extraOutputRules: [
      'Setup must come from the source context',
      'Twist must be supported by a real contrast or tension from the source',
      'Punchline should feel like a sharper phrasing of the original meaning, not a random joke'
    ]
  }
];

export const contentIdeationFrameworks: FrameworkOption[] = FRAMEWORK_DEFINITIONS.map(
  ({ value, label, ...definition }) => ({
    value,
    label,
    content: buildFrameworkPrompt({
      value,
      label,
      ...definition
    })
  })
);