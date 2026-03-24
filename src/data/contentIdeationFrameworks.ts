export type FrameworkOption = {
  value: string;
  label: string;
  content: string;
};

export const contentIdeationFrameworks: FrameworkOption[] = [
  {
    value: 'prep',
    label: 'PREP - Very popular for insight content',
    content:
      'Transform the following information into multiple high-performing Instagram Reels scripts using the PREP framework (Point-Reason-Example-Point).\n\n' +
      'Objective: Create emotionally resonant, highly relatable short-form content that feels authentic, not preachy, and drives saves/shares.\n\n' +
      'Tone: Conversational, introspective, slightly vulnerable, with moments of clarity (like a personal realization being shared).\n\n' +
      'Core Constraints\n' +
      '- Use simple, spoken Bahasa Indonesia (natural, human, not formal)\n' +
      '- Avoid generic motivational or overused phrases\n' +
      '- Each version must contain a clear emotional shift (confusion -> realization -> clarity)\n' +
      '- Avoid repeating the same angles, examples, or wording across versions\n' +
      '- Make the insight feel "earned" (not obvious from the start)\n\n' +
      'Structure (PREP per version)\n' +
      '1. Point (Hook)\n' +
      '- Pattern interrupt / contrarian / honest confession\n' +
      '- Must grab attention in the first sentence\n' +
      '2. Reason (Insight)\n' +
      '- Deeper psychological or behavioral explanation\n' +
      '- Avoid surface-level reasoning\n' +
      '3. Example (Story)\n' +
      '- Specific, vivid, everyday scenario\n' +
      '- Show behavior (not just tell)\n' +
      '4. Point (Reframe)\n' +
      '- Sharper, more mature version of the opening\n' +
      '- Clear takeaway that feels grounded and applicable\n\n' +
      'Generate 5 Distinct Versions\n' +
      '- V1: Soft & reflective\n' +
      '- V2: Deep & introspective\n' +
      '- V3: Punchy & direct\n' +
      '- V4: Story-heavy (example dominates)\n' +
      '- V5: Insight-heavy (reason dominates)\n\n' +
      'Output Format (VERY IMPORTANT)\n\n' +
      'For each version, provide:\n\n' +
      '1. Title (Angle)\n' +
      '- Short phrase describing the core idea\n\n' +
      '2. Hook Options (3 variations)\n' +
      '- Different opening lines for A/B testing\n\n' +
      '3. Script (Ready to Read)\n' +
      '- Natural flow, optimized for spoken delivery\n\n' +
      '4. PREP Breakdown\n\n' +
      '- Point:\n' +
      '- Reason:\n' +
      '- Example:\n' +
      '- Point (Reframe):\n\n' +
      '5. Delivery Direction\n\n' +
      '- Tone (e.g., calm, assertive, reflective)\n' +
      '- Suggested pauses / emphasis\n' +
      '- Facial expression / vibe\n\n' +
      '6. Visual Direction (Simple)\n\n' +
      '- A-roll idea (talking head style)\n' +
      '- Optional B-roll ideas (if any)\n\n' +
      '7. Caption (2 versions)\n\n' +
      '- Version A: Insightful\n' +
      '- Version B: Slightly punchy\n\n' +
      '8. Closing Line Alternatives (2 options)\n' +
      '- For testing different emotional endings\n\n' +
      'Optional Optimization Layer\n\n' +
      'Make each version slightly different in:\n\n' +
      '- Emotional intensity\n' +
      '- Sentence rhythm (some slower, some punchier)\n' +
      '- Level of directness\n\n' +
      'Information:\n' +
      '[insert information]'
  },
  {
    value: 'see',
    label: 'SEE - Very common for teaching/insight',
    content:
      'Transform the following information into multiple high-performing Instagram Reels scripts using the SEE framework (State-Explain-Example).\n\n' +
      'Objective: Deliver simple but powerful insights that feel relatable, easy to understand, and emotionally resonant-without sounding preachy or overly complex.\n\n' +
      'Tone: Conversational, warm, and reflective (like explaining something you just realized to a friend).\n\n' +
      'Core Constraints\n' +
      '- Use simple, spoken Bahasa Indonesia (natural, human, not formal)\n' +
      '- Keep explanations clear and easy to follow (avoid overcomplicated wording)\n' +
      '- Avoid generic motivational phrases\n' +
      '- Each version must include a subtle realization or shift in perspective\n' +
      '- Do not repeat the same phrasing, examples, or angles across versions\n' +
      '- The ending (Example) must feel relatable and grounded (not abstract)\n\n' +
      'Structure (SEE per version)\n' +
      '1. State (Hook)\n' +
      '- Clear, strong opening statement (can be relatable truth / contrarian insight / honest observation)\n' +
      '- Must immediately resonate or trigger curiosity\n' +
      '2. Explain (Clarity)\n' +
      '- Simple explanation of why this happens or what it means\n' +
      '- Focus on clarity over depth (easy to digest in one listen)\n' +
      '3. Example (Relatable Closing)\n' +
      '- Concrete, everyday scenario or personal reflection\n' +
      '- Should make the audience think: "ini gue banget"\n\n' +
      'Generate 5 Distinct Versions\n' +
      '- V1: Soft & relatable\n' +
      '- V2: Deep but simple\n' +
      '- V3: Punchy & direct\n' +
      '- V4: Story-driven (example dominates)\n' +
      '- V5: Insight-driven (state + explain dominate)\n\n' +
      'Output Format (VERY IMPORTANT)\n\n' +
      'For each version, provide:\n\n' +
      '1. Title (Angle)\n' +
      '- Short phrase describing the core idea\n\n' +
      '2. Hook Options (3 variations)\n' +
      '- Different opening lines for A/B testing\n\n' +
      '3. Script (Ready to Read)\n' +
      '- Natural flow, optimized for spoken delivery\n\n' +
      '4. SEE Breakdown\n\n' +
      '- State:\n' +
      '- Explain:\n' +
      '- Example:\n\n' +
      '5. Delivery Direction\n\n' +
      '- Tone (e.g., calm, warm, reflective)\n' +
      '- Suggested pauses / emphasis\n' +
      '- Facial expression / vibe\n\n' +
      '6. Visual Direction (Simple)\n\n' +
      '- A-roll idea (talking head style)\n' +
      '- Optional B-roll ideas\n\n' +
      '7. Caption (2 versions)\n\n' +
      '- Version A: Insightful\n' +
      '- Version B: Slightly punchy\n\n' +
      '8. Closing Reflection Variations (2 options)\n' +
      '- Alternative ways to end the example/reflection\n\n' +
      'Optional Optimization Layer\n\n' +
      'Make each version slightly different in:\n\n' +
      '- Emotional tone (lighter vs deeper)\n' +
      '- Sentence rhythm (slow vs punchy)\n' +
      '- Level of directness\n\n' +
      'Information:\n' +
      '[insert information]'
  },
  {
    value: 'air',
    label: 'AIR - Great for reflective storytelling',
    content:
      'Transform the following information into multiple high-performing Instagram Reels scripts using the AIR framework (Assertion-Illustration-Reflection).\n\n' +
      'Objective: Deliver sharp, memorable personal insights that feel honest, grounded, and emotionally resonant-ending with a reflection that lingers.\n\n' +
      'Tone: Conversational, reflective, slightly vulnerable, with a sense of clarity at the end (like sharing a realization you wish you knew earlier).\n\n' +
      'Core Constraints\n' +
      '- Use simple, spoken Bahasa Indonesia (natural, human, not formal)\n' +
      '- Start with a strong, clear assertion (no warm-up, langsung to the point)\n' +
      '- Avoid generic motivational or cliché phrases\n' +
      '- Each version must include an emotional shift (unaware -> aware / assumption -> realization)\n' +
      '- Illustration must feel real, specific, and relatable (not abstract)\n' +
      '- Reflection must feel earned, grounded, and slightly deeper than the opening\n' +
      '- Avoid repeating the same angles, examples, or wording across versions\n\n' +
      'Structure (AIR per version)\n' +
      '1. Assertion (Hook)\n' +
      '- Strong statement / contrarian insight / honest truth\n' +
      '- Should feel bold, slightly provocative, or deeply relatable\n' +
      '2. Illustration (Story)\n' +
      '- Short, concrete real-life situation\n' +
      '- Show behavior, not just explain\n' +
      '- Keep it tight but vivid\n' +
      '3. Reflection (Meaning)\n' +
      '- Deeper realization or lesson\n' +
      '- Reframe the assertion with more clarity\n' +
      '- Should leave a lasting impression (save-worthy line)\n\n' +
      'Generate 5 Distinct Versions\n' +
      '- V1: Soft & reflective\n' +
      '- V2: Deep & introspective\n' +
      '- V3: Punchy & direct\n' +
      '- V4: Story-heavy (illustration dominates)\n' +
      '- V5: Reflection-heavy (ending is the strongest part)\n\n' +
      'Output Format (VERY IMPORTANT)\n\n' +
      'For each version, provide:\n\n' +
      '1. Title (Angle)\n' +
      '- Short phrase describing the core idea\n\n' +
      '2. Hook Options (3 variations)\n' +
      '- Different assertion lines for A/B testing\n\n' +
      '3. Script (Ready to Read)\n' +
      '- Natural flow, optimized for spoken delivery\n\n' +
      '4. AIR Breakdown\n\n' +
      '- Assertion:\n' +
      '- Illustration:\n' +
      '- Reflection:\n\n' +
      '5. Delivery Direction\n\n' +
      '- Tone (e.g., calm, firm, introspective)\n' +
      '- Suggested pauses / emphasis\n' +
      '- Facial expression / vibe\n\n' +
      '6. Visual Direction (Simple)\n\n' +
      '- A-roll idea (talking head)\n' +
      '- Optional B-roll ideas (cutaways, environment, gestures)\n\n' +
      '7. Caption (2 versions)\n\n' +
      '- Version A: Insightful\n' +
      '- Version B: Slightly punchy\n\n' +
      '8. Reflection Line Alternatives (2 options)\n' +
      '- Alternative closing lines for A/B testing\n\n' +
      'Optional Optimization Layer\n\n' +
      'Make each version slightly different in:\n\n' +
      '- Emotional intensity (light vs deep)\n' +
      '- Rhythm (slow reflective vs punchy cuts)\n' +
      '- Directness (subtle vs bold)\n\n' +
      'Information:\n' +
      '[insert information]'
  },
  {
    value: 'par',
    label: 'PAR - Great for life lessons',
    content:
      'Transform the following information into multiple high-performing Instagram Reels scripts using the PAR framework (Problem-Action-Result).\n\n' +
      'Objective: Create authentic personal stories that feel real, relatable, and meaningful-showing a clear journey from struggle to insight.\n\n' +
      'Tone: Conversational, honest, and grounded (like sharing a real experience, not teaching or lecturing).\n\n' +
      'Core Constraints\n' +
      '- Use simple, spoken Bahasa Indonesia (natural, human, not formal)\n' +
      '- Avoid generic motivational or cliché phrases\n' +
      '- The story must feel personal and specific (not generic storytelling)\n' +
      '- Show emotional progression (struggle -> attempt -> realization)\n' +
      '- Keep the action realistic (not overly dramatic or "perfect")\n' +
      '- Result must feel honest (can be imperfect insight, not always a big win)\n' +
      '- Avoid repeating the same angles, examples, or wording across versions\n\n' +
      'Structure (PAR per version)\n' +
      '1. Problem (Hook + Tension)\n' +
      '- Start with a relatable struggle / internal conflict\n' +
      '- Can be subtle (overthinking, delaying, confusion) or explicit\n' +
      '- Should create curiosity or emotional tension\n' +
      '2. Action (What You Did)\n' +
      '- Realistic response to the problem\n' +
      '- Could be flawed, hesitant, or experimental\n' +
      '- Focus on behavior, not theory\n' +
      '3. Result (Outcome + Insight)\n' +
      '- What happened after\n' +
      '- Include a reflection or lesson learned\n' +
      '- Keep it grounded (not overly idealistic or preachy)\n\n' +
      'Generate 5 Distinct Versions\n' +
      '- V1: Soft & reflective\n' +
      '- V2: Deep & introspective\n' +
      '- V3: Punchy & direct\n' +
      '- V4: Story-heavy (problem & action dominate)\n' +
      '- V5: Insight-heavy (result is the strongest part)\n\n' +
      'Output Format (VERY IMPORTANT)\n\n' +
      'For each version, provide:\n\n' +
      '1. Title (Angle)\n' +
      '- Short phrase describing the core story\n\n' +
      '2. Hook Options (3 variations)\n' +
      '- Different opening lines for A/B testing (Problem-focused)\n\n' +
      '3. Script (Ready to Read)\n' +
      '- Natural flow, optimized for spoken delivery\n\n' +
      '4. PAR Breakdown\n\n' +
      '- Problem:\n' +
      '- Action:\n' +
      '- Result:\n\n' +
      '5. Delivery Direction\n\n' +
      '- Tone (e.g., vulnerable, calm, slightly frustrated, reflective)\n' +
      '- Suggested pauses / emphasis\n' +
      '- Facial expression / vibe\n\n' +
      '6. Visual Direction (Simple)\n\n' +
      '- A-roll idea (talking head / confessional style)\n' +
      '- Optional B-roll ideas (daily activity, environment, gestures)\n\n' +
      '7. Caption (2 versions)\n\n' +
      '- Version A: Reflective\n' +
      '- Version B: Slightly punchy\n\n' +
      '8. Closing Line Alternatives (2 options)\n' +
      '- Different ways to deliver the "Result" insight\n\n' +
      'Optional Optimization Layer\n\n' +
      'Make each version slightly different in:\n\n' +
      '- Emotional intensity (subtle vs strong struggle)\n' +
      '- Story pacing (slow reflection vs faster progression)\n' +
      '- Outcome type (clear lesson vs open-ended realization)\n\n' +
      'Information:\n' +
      '[insert information]'
  },
  {
    value: 'star',
    label: 'STAR - Very strong for experience storytelling',
    content:
      'Transform the following information into multiple high-performing Instagram Reels scripts using the STAR framework (Situation-Task-Action-Result).\n\n' +
      'Objective: Tell a clear, structured personal story that highlights a real situation, what needed to be done, what you actually did, and the insight gained-ending with a meaningful takeaway.\n\n' +
      'Tone: Conversational, grounded, and reflective (like sharing a real experience with clarity, not lecturing).\n\n' +
      'Core Constraints\n' +
      '- Use simple, spoken Bahasa Indonesia (natural, human, not formal)\n' +
      '- Keep the story concise and easy to follow\n' +
      '- Avoid generic motivational or cliché phrases\n' +
      '- Emphasize personal experience (specific, not abstract)\n' +
      '- Show progression clearly (context -> responsibility -> action -> outcome)\n' +
      '- Action must feel realistic (not overly perfect)\n' +
      '- Result must include a grounded insight or realization\n' +
      '- Avoid repeating the same angles, examples, or wording across versions\n\n' +
      'Structure (STAR per version)\n' +
      '1. Situation (Context)\n' +
      '- Brief setup of the situation\n' +
      '- What was happening / what condition you were in\n' +
      '- Should quickly anchor the viewer\n' +
      '2. Task (Challenge / Responsibility)\n' +
      '- What needed to be done or resolved\n' +
      '- Can be internal (e.g., "harus mulai") or external (deadline, expectation)\n' +
      '3. Action (What You Did)\n' +
      '- Specific steps or behavior\n' +
      '- Keep it real (can include hesitation, trial, imperfection)\n' +
      '4. Result (Outcome + Insight)\n' +
      '- What happened afterward\n' +
      '- Include a clear reflection or lesson learned\n' +
      '- Should feel meaningful and applicable\n\n' +
      'Generate 5 Distinct Versions\n' +
      '- V1: Soft & reflective\n' +
      '- V2: Deep & introspective\n' +
      '- V3: Punchy & direct\n' +
      '- V4: Story-heavy (situation & action dominate)\n' +
      '- V5: Insight-heavy (result is the strongest part)\n\n' +
      'Output Format (VERY IMPORTANT)\n\n' +
      'For each version, provide:\n\n' +
      '1. Title (Angle)\n' +
      '- Short phrase describing the story\n\n' +
      '2. Hook Options (3 variations)\n' +
      '- Different opening lines (can start from Situation or tension point)\n\n' +
      '3. Script (Ready to Read)\n' +
      '- Natural flow, optimized for spoken delivery\n\n' +
      '4. STAR Breakdown\n\n' +
      '- Situation:\n' +
      '- Task:\n' +
      '- Action:\n' +
      '- Result:\n\n' +
      '5. Delivery Direction\n\n' +
      '- Tone (e.g., calm, slightly pressured, reflective)\n' +
      '- Suggested pauses / emphasis\n' +
      '- Facial expression / vibe\n\n' +
      '6. Visual Direction (Simple)\n\n' +
      '- A-roll idea (talking head / storytelling style)\n' +
      '- Optional B-roll ideas (daily activity, context visuals)\n\n' +
      '7. Caption (2 versions)\n\n' +
      '- Version A: Reflective\n' +
      '- Version B: Slightly punchy\n\n' +
      '8. Closing Insight Alternatives (2 options)\n' +
      '- Different ways to deliver the "Result" takeaway\n\n' +
      'Optional Optimization Layer\n\n' +
      'Make each version slightly different in:\n\n' +
      '- Emotional tone (light vs heavy)\n' +
      '- Story pacing (fast vs reflective)\n' +
      '- Outcome clarity (clear lesson vs subtle realization)\n\n' +
      'Information:\n' +
      '[insert information]'
  }
];
