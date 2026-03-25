export type FrameworkOption = {
  value: string;
  label: string;
  content: string;
};

type CaptionTone = 'Insightful' | 'Reflective' | 'Slightly punchy' | 'Funny';

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
  extraGroundingRules?: string[];
  extraRetentionRules?: string[];
};

const joinLines = (lines: string[]) => lines.filter(Boolean).join('\n');

const buildBulletSection = (title: string, items: string[]) =>
  joinLines([title, ...items.map((item) => `- ${item}`)]);

const QUOTABLE_CLOSING_STEP = 'Closing Line';

const addClosingStep = (steps: string[]) => [...steps, QUOTABLE_CLOSING_STEP];

const DEFAULT_VERSION_PRESETS: VersionPreset[] = [
  {
    code: 'V1',
    label: 'Closest to original -> paling faithful ke cerita asli dengan reshaping minimal'
  },
  {
    code: 'V2',
    label: 'Cleaner flow -> cerita yang sama, lebih rapi, lebih enak diucapkan, lebih padat'
  },
  {
    code: 'V3',
    label: 'Stronger emphasis -> cerita yang sama, penekanan emosi/meaning lebih terasa tanpa mengubah isi'
  }
];

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

const COMMON_SPOKEN_LANGUAGE_RULES = [
  'Write for the ear, not for the eye',
  'Do not write the script like a blog post, essay, or formal writing',
  'Write as if you are speaking to one person, like a friend',
  'Use simple, conversational language that is easy to understand in one listen',
  'Prioritize how it sounds when spoken, not how it looks when written',
  'If it sounds stiff when read out loud, rewrite it to feel more natural',
  'Use short to medium-length sentences that are comfortable to say on camera',
  'Make sure the wording feels human, warm, clear, and not like an article'
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

const COMMON_CLOSING_RULES = [
  'For every non-engagement framework, include an additional final subheading called Closing Line',
  'Closing Line must contain 1 short quotable closing statement',
  'Closing Line should feel punchy, memorable, and easy to quote',
  'Closing Line must come from the original meaning of the source, not from a new invented moral',
  'Closing Line should be the sharpest distillation of the story’s real takeaway',
  'Keep the Closing Line concise and spoken, not poetic for the sake of sounding deep',
  'Do not make the Closing Line sound like a fake motivational poster'
];

const ENGAGEMENT_SPECIFIC_RULES = [
  'This framework should be noticeably funnier than the others',
  'Humor should come from pematahan asumsi, reversal, overconfidence collapsing, awkward honesty, or exaggerated everyday logic that is still rooted in the source',
  'Make the comedic turn feel surprising, recognizably human, and conversational',
  'The funny part should not feel like stand-up comedy setup that ignores the original story',
  'Do not add random characters, unrelated jokes, or detached meme humor',
  'Do not become slapstick, surreal nonsense, or pure joke-writing',
  'The humor must sharpen the original point by exposing a mistaken assumption in a funny way',
  'The Twist should strongly signal expectation vs reality',
  'The Punchline should land as the funniest and clearest pematahan asumsi in the script',
  'The script may be more playful, but must still preserve the source meaning'
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

const buildAdditionalOutputFormattingPrompt = (definition: FrameworkDefinition) =>
  [
    'Additional Output Formatting Prompt (Markdown Block Style)',
    '',
    'Format the entire output into copy-paste ready Markdown element blocks with the following rules:',
    '',
    'Use only bold (**text**) and horizontal lines (---)',
    'Do NOT use any Markdown headings such as #, ##, or ###',
    'Each version (V1, V2, V3) must be placed in a separate Markdown code block',
    'Inside each block:',
    'Display the Title (Angle) in bold on the first line',
    'Follow this exact structure and order:',
    'Script (Ready to Read)',
    ...definition.structureSteps,
    '---',
    'Caption',
    'Version A',
    'Version B',
    '---',
    definition.closingLabel.replace(' (2 options)', ''),
    `All section labels (${definition.structureSteps.join(', ')}, etc.) must be in bold`,
    'Maintain clean spacing so it is easy to read and fully ready to use without editing',
    'Do not include any explanations outside the Markdown code blocks',
    'Keep the output minimal, clean, and consistent across all versions'
  ];

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
    ...buildAdditionalOutputFormattingPrompt(definition),
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
    buildBulletSection('Writing for the Ear, Not the Eye', COMMON_SPOKEN_LANGUAGE_RULES),
    '',
    buildBulletSection('Source Fidelity Rules', [
      ...COMMON_CORE_CONSTRAINTS,
      ...(definition.extraCoreConstraints ?? [])
    ]),
    '',
    buildBulletSection('Grounding Rules', [
      ...COMMON_GROUNDING_RULES,
      ...(definition.extraGroundingRules ?? [])
    ]),
    '',
    buildBulletSection('Hook and Retention Rules', [
      ...COMMON_RETENTION_RULES,
      ...(definition.extraRetentionRules ?? [])
    ]),
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
    frameworkName: 'Claim-Reason-Example-Closing Line',
    frameworkFullName: 'Argumentative Structure (Enhanced for Reels)',
    objective:
      'Turn the original story into a clear, structured insight by presenting a core idea, explaining the reasoning, grounding it with a real example from the source, then ending with a sharp quotable closing line.',
    tone:
      'Clear, grounded, conversational, and source-faithful. It should feel like the same person explaining their thinking more clearly, not like a lecture.',
    structureSteps: addClosingStep(['Claim', 'Reason', 'Example']),
    structureGuidance: [
      'State the main idea clearly from the source',
      'Explain why that idea is true using the source logic',
      'Support it with a concrete example from the source',
      'End with a Closing Line that distills the original meaning into one sharp, quotable sentence',
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
      ...COMMON_CLOSING_RULES,
      'Do not split one subtle reflection into multiple claims unless the source clearly supports that structure',
      'If the source contains multiple examples, choose the most central one or combine them carefully without changing meaning'
    ],
    extraOutputRules: [
      'Claim must express the source’s actual main point',
      'Reason must come from the source’s actual logic',
      'Example must stay grounded in the source material',
      'Closing Line must feel quotable, concise, and consistent with the source message'
    ]
  },
  {
    value: 'story',
    label: 'Story - Lived experience & transformation',
    frameworkName: 'Setup-Conflict-Resolution-Closing Line',
    frameworkFullName: 'Narrative Arc (Enhanced for Reels)',
    objective:
      'Restructure the story into a clear narrative flow that preserves the original experience, tension, and resolution, then land it with a short quotable closing line.',
    tone:
      'Natural, human, grounded, and personal. It should feel like a real story being told more clearly, not like a dramatized rewrite.',
    structureSteps: addClosingStep(['Setup', 'Conflict', 'Resolution']),
    structureGuidance: [
      'Anchor the real situation from the source',
      'Highlight the tension, shift, or realization already present in the story',
      'End the narrative with the original resolution, takeaway, or perspective change',
      'Then add a Closing Line that crystallizes the lived meaning into one memorable sentence',
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
      ...COMMON_CLOSING_RULES,
      'Do not manufacture conflict if the source is subtle or reflective',
      'Do not add extra plot points to make the story feel more cinematic'
    ],
    extraOutputRules: [
      'Setup must anchor the source context clearly',
      'Conflict must reflect the source tension or shift, not a newly dramatized version',
      'Resolution may be a realization, not necessarily a neat ending',
      'Closing Line must sound like the earned aftertaste of the story'
    ]
  },
  {
    value: 'reflection',
    label: 'Reflection - Meaning & personal insight',
    frameworkName: 'Assertion-Illustration-Reflection-Closing Line',
    frameworkFullName: 'Reflective Structure (Enhanced for Reels)',
    objective:
      'Reshape the story into a reflective script that preserves the original meaning and emotional insight, then close it with a short quotable sentence.',
    tone:
      'Reflective, slightly vulnerable, personal, natural, and grounded in the source material.',
    structureSteps: addClosingStep(['Assertion', 'Illustration', 'Reflection']),
    structureGuidance: [
      'Identify the core belief, realization, or emotional truth',
      'Support it with the original lived moment, scene, or detail',
      'End with a grounded reflection, not a newly invented moral',
      'Then add a Closing Line that compresses the reflection into one quotable sentence',
      'If the source is subtle, keep the reflection subtle'
    ],
    captionA: 'Insightful',
    captionB: 'Slightly punchy',
    closingLabel: 'Reflection / Closing Line Alternatives (2 options)',
    closingHint: [
      'Stay subtle and grounded',
      'Do not overstate the message'
    ],
    extraCoreConstraints: [
      ...COMMON_CLOSING_RULES,
      'Do not fabricate a more dramatic illustration than what the source supports',
      'Reflection must deepen the original meaning, not replace it'
    ],
    extraOutputRules: [
      'Assertion must come from the source’s real stance',
      'Illustration should come from the source material, not a new hypothetical scenario',
      'Reflection should sound earned by the source material',
      'Closing Line must feel like the cleanest verbal form of the reflection'
    ]
  },
  {
    value: 'structured',
    label: 'Structured - Clear & decisive communication',
    frameworkName: 'Answer-Support-Detail-Closing Line',
    frameworkFullName: 'Pyramid Principle (Simplified, Enhanced for Reels)',
    objective:
      'Restructure the story into a clear, top-down explanation that delivers the main idea first, followed by supporting points and brief details from the source, then ends with a punchy quotable closing line.',
    tone:
      'Direct, efficient, clear, and source-faithful without becoming cold or corporate.',
    structureSteps: addClosingStep(['Answer', 'Support', 'Detail']),
    structureGuidance: [
      'Start with the main conclusion from the source',
      'Support it with 2–3 key ideas already present in the source',
      'Add brief supporting details only when they improve clarity',
      'End with a Closing Line that sounds decisive and quotable',
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
      ...COMMON_CLOSING_RULES,
      'Do not flatten a deeply personal story into cold corporate language',
      'Do not add support points that are not already implied by the source'
    ],
    extraOutputRules: [
      'Answer must present the source conclusion upfront',
      'Support must organize the source logic into clear, non-overlapping points',
      'Detail must stay brief and serve clarity, not expand the story',
      'Closing Line must sound clean, final, and easy to remember'
    ]
  },
  {
    value: 'engagement',
    label: 'Engagement - Funny twist',
    frameworkName: 'Setup-Twist-Punchline',
    frameworkFullName: 'Comedic Reversal Structure',
    objective:
      'Restructure the original story into a much funnier and more engaging script by highlighting expectation versus reality, using strong and funny assumption-breaking, while still preserving the original meaning and source logic.',
    tone:
      'Very funny, playful, conversational, observant, and naturally comedic. The humor should feel like sharp everyday wit, awkward honesty, and funny because it is relatable — not random jokes or detached meme talk.',
    structureSteps: ['Setup', 'Twist', 'Punchline'],
    structureGuidance: [
      'Setup should establish the original expectation, assumption, confidence, or neat belief from the source',
      'Twist should break that assumption in a funny, human, recognizable way',
      'Punchline should be the funniest and sharpest assumption-break in the whole script',
      'Humor should come from contrast, reversal, misplaced confidence, inconvenient reality, or brutally honest observation already supported by the source',
      'The script should still preserve the story meaning even while making it much more entertaining'
    ],
    captionA: 'Funny',
    captionB: 'Slightly punchy',
    closingLabel: 'Punchline Alternatives (2 options)',
    closingHint: [
      'Both options should feel funny and surprising',
      'They must still stay rooted in the original message'
    ],
    versionPresets: [
      {
        code: 'V1',
        label: 'Funny but closest -> still the most faithful, but the humor is already felt through the reversal'
      },
      {
        code: 'V2',
        label: 'Harder assumption-break -> sharper assumption-breaking, funnier, slightly more cheeky'
      },
      {
        code: 'V3',
        label: 'Most entertaining -> liveliest rhythm, clearest contrast, hardest-hitting punchline'
      }
    ],
    versionDifferentiator:
      'All versions must stay rooted in the same original source material, but the comedic handling should vary in sharpness, boldness, and surprise. The funny effect should mainly come from stronger assumption-breaking, not from inventing unrelated jokes.',
    extraCoreConstraints: [
      ...ENGAGEMENT_SPECIFIC_RULES,
      'Do not add new events that change the source chronology',
      'Do not add humor that humiliates the speaker unless the source itself supports self-deprecating honesty',
      'Do not turn the whole thing into pure parody if the source is still meant to carry a real point'
    ],
    extraGroundingRules: [
      'Identify the assumption inside the source first: what was expected, believed, imagined, or socially assumed?',
      'Then identify what actually happened, what contradicted it, or what makes the original belief look naive, incomplete, or funny in hindsight'
    ],
    extraRetentionRules: [
      'The first line should quickly trigger expectation so the Twist can break it harder',
      'Tension and curiosity should build toward the Punchline, not flatten too early'
    ],
    extraOutputRules: [
      'Setup must clearly establish the source-based expectation or assumption',
      'Twist must perform a real assumption-break that is funny, recognizable, and supported by the source',
      'Punchline must feel like the clearest and funniest articulation of the source truth',
      'The funny part should be embedded in the spoken rhythm, not tacked on at the end',
      'Do not include an additional Closing Line subheading for engagement; Punchline itself is the closing payoff'
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
