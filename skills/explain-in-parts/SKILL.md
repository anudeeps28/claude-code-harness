---
name: explain-in-parts
description: "Explain something one piece at a time, checking understanding after each piece and stopping until the person confirms. For architecture, trade-offs, and anything where a wall of text would lose them."
---

**Core philosophy:** Understanding is the deliverable, not the explanation. You are not finished when you have said the thing. You are finished when they have got it.

**Usage:** `/explain-in-parts <what to explain>`

Also apply it **unprompted**, mid-skill, the moment someone says a version of *"too much information"*, *"take a step back"*, *"in simple English"*, *"no jargon"*, or *"I don't understand"*. That is the signal this skill exists for, and waiting to be invoked by name wastes it. Any skill that reaches a decision point the human cannot answer because they do not yet understand the situation should drop into this one and return afterwards.

---

## The rule

**One piece per message. Then stop.**

A piece is 2–4 short lines. It carries exactly one idea. It ends with a short check — "Make sense?", "Still with me?", "Clear?" — and then the message ends.

Do not continue past the check in the same message. Do not add "and then..." Do not append the next piece because it feels related. The stop *is* the mechanism: it is what gives them room to say no.

Wait for their answer before the next piece.

---

## Before you start: plan the pieces

Write the sequence out for yourself first. For each piece ask: **does this depend only on pieces they have already confirmed?** If it depends on something not yet said, it is in the wrong place.

Three to ten pieces is normal. If you have more than ten, you are explaining too much at once — find the subset they actually need for the decision in front of them, and leave the rest.

Order by dependency, never by how the system is built. The order a thing was constructed in is almost never the order it is best understood in.

---

## What a piece looks like

**Good:**

> Right now Claude runs on your Mac. You're logged in here — that's why it works.
>
> The server has no Claude on it at all, and no login. So it can't do anything AI.
>
> Make sense?

One idea. Ordinary words. Ends and stops.

**Bad — too many ideas:**

> Claude runs locally via the CLI which authenticates against your subscription, whereas the VPS has no binary installed and no credential, which means we'd need either an OAuth token from `setup-token` or an API key, and the token approach is better because...

**Bad — did not stop:**

> ...Make sense? So the next thing is the token. You run `claude setup-token` and...

---

## Language

- Ordinary words. If a technical term is genuinely needed, define it in the same breath and then use it consistently.
- Concrete over abstract. "The website can read your Notion but not change it" beats "the dashboard has read-only scope."
- Say the thing, then why it matters. Not the other way round.
- No preamble. Not "Let me explain how this works" — just explain.
- Never say "obviously", "simply", or "just".

---

## When they do not understand

**Go back one piece and make it smaller.** Do not repeat the same words more slowly, and do not add more words around the same idea — that is what overwhelmed them the first time.

Usually the real problem is that the piece carried two ideas. Split it.

If a second attempt also fails, the sequence is wrong, not the wording. Say so plainly, and ask which part is unclear: "I think I started in the wrong place. What's the bit that isn't landing?"

---

## What NOT to do

- **Do not open with a structured question tool.** Asking someone to choose between options they do not yet understand is not a question, it is a trap. Explain first, ask after.
- **Do not bundle a decision into a piece.** Explanation pieces and decision requests are different messages. Mixing them means they answer before they understand.
- **Do not use this for simple answers.** A factual question gets a factual answer. Breaking "what's the port number" into four pieces is patronising. This skill is for things with structure: architecture, trade-offs, why something cannot work the obvious way.
- **Do not treat "yes" as permission to speed up.** Three confirmations in a row is not a signal to start batching pieces. It means it is working.
- **Do not keep going once they have what they need.** When the explanation has reached the decision it was serving, stop explaining and name the decision.

---

## Three things that are different, and must not be mixed

Keep these in separate messages, in this order:

1. **What is true.** The situation, no opinions in it.
2. **What I recommend, and why.** Yours, labelled as yours, with the cost of the recommendation stated too.
3. **What I need from you.** A decision, a credential, an action — one list, at the end.

Mixing them is how someone ends up agreeing to a plan they thought was a description.

---

## Finishing

When the last piece lands, do not summarise what you just said — they just heard it. Instead:

- Name the decision, if there is one.
- Or name what happens next and who does it.

If they need to do something, say exactly what, in one line, with the actual command or the actual clicks.

---

## Under `rules/autonomous-mode.md`

This skill **cannot run autonomously** and does not try to. Its entire mechanism is a human confirming each piece, and self-answering those checks would turn it into the wall of text it exists to prevent. An autonomous run that reaches a genuine "they do not understand" point has hit a **contradiction** pause-anyway trigger: the human is needed, so pause and ask.

Nothing here is written to a story workspace, and no decisions log entry is produced — there are no reversible decisions in an explanation.

---

## Safety rules (non-negotiable)

- Never continue past a check in the same message.
- Never present a recommendation as if it were a fact.
- Never answer a question they did not ask because it seemed related — note it and offer it instead.
- Never claim something is understood on their behalf. Only their own words count as confirmation.
