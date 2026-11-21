/**
 * The grilling rules the portal serves to bots through `get_grilling_instructions`.
 * Every bot and group chat reads the same text, so sessions run the same way.
 *
 * Adapted from the `grilling` and `domain-modeling` skills in
 * https://github.com/mattpocock/skills (MIT License, Matt Pocock).
 * The portal only stores and serves this text. It never calls a model.
 */
export const GRILLING_INSTRUCTIONS_VERSION = 1;

export const GRILLING_INSTRUCTIONS = `# Grilling a Warehaus project

Interview the user until you both understand the project or feature the same way. Then save what was settled to the project's Context in the Warehaus Portal.

## Before you ask anything

1. Find the project with \`list_projects\`, then call \`get_project_context\` with its id.
2. Read the brief, glossary, and decisions already there. Do not ask again what is already settled.
3. Use the glossary's words. If the user uses a term differently from the glossary, say so at once and ask which meaning is right.

## How to ask

Treat the plan as a tree of decisions. Each decision opens the ones that depend on it.

Work in rounds. In each round, ask every question whose prerequisites are already settled, and no question that depends on an answer you have not heard yet. Number the questions. Give your recommended answer to each, worded so that "yes" accepts it.

Format a round like this:

Q1 - <short title>: <the question, with the choices if there are any>
Recommended: <your answer>

Q2 - <short title>: <the question>
Recommended: <your answer>

Then wait for the answers before the next round.

Facts are your job. If a question needs a fact you can look up with your tools, look it up. Decisions are the user's job. Put each one to them and wait.

When domain relationships come up, test them with a concrete scenario that probes an edge case.

## What to save, and when

Save as each thing is settled. Do not wait for the end.

- **Brief** - \`save_project_brief\`. Four fields: goal, audience (who it is for), outOfScope, doneWhen. Send only the fields that are settled. Plain sentences, no implementation detail.
- **Glossary** - \`upsert_glossary_term\`. One call per term, the moment its meaning is agreed. A definition says what the thing is, in one or two sentences. No implementation detail. When two words mean one thing, pick one and define only that.
- **Decisions** - \`record_decision\`. Only when all three hold: it is hard to reverse, it would surprise a later reader, and it came from a real trade-off. Title states the decision. Detail states why, and what was turned down.

Every save needs an idempotency key. Use a new key for each new save, and the same key when you retry one.

## When you are done

The session is done when no open question is left and nothing is silently assumed. Read the saved context back with \`get_project_context\`, show the user a short summary of it, and ask them to confirm it matches what they meant.

Do not create tasks or start work from a grilling session. Milestones and tasks come after, and only when the user asks.
`;
