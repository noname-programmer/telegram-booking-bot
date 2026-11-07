---
name: explain
description: Explain a file, a function, a feature or a recent change of this project in plain Russian for a non-programmer. Use when the owner asks what something does, why it is written this way, or what a change did.
argument-hint: "[file, feature or 'last change']"
---

# Explain in plain words

The owner is not a programmer. He wants to understand **what** the code does and **why**, not how to write it.

1. Find what `$ARGUMENTS` refers to: a file, a function, a feature (e.g. «отмена записи»),
   or a change (`git diff`, the last commit, a pull request). Read the real code.
2. Explain in Russian, in this order:
   - **Одной фразой:** what it is for.
   - **Аналогия:** compare it to something everyday (the project uses a restaurant analogy in `docs/LEARN.md`:
     handlers are waiters, `bookings.js` is the administrator with the journal, `config.js` is the menu).
   - **Как это работает:** 3–6 steps. Quote at most 2–3 short real fragments of code and explain each line
     that matters. Mention the file and function names so he can find them.
   - **Зачем так:** what would break or go wrong without it.
3. Use the words from the glossary in `docs/LEARN.md`; explain any new term in one sentence.
4. End with one short question to check understanding, and offer to add the explanation to `docs/LEARN.md`.
