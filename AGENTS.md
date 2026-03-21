# AGENTS.md — CopyMe Project

## 1. Project Overview

CopyMe is a **Persona Training Workbench**.

It is NOT:
- a chatbot
- a language learning app
- a generic AI assistant

It IS:
- a system to **capture, model, and reproduce a human's role-specific personality**
- currently focused on: **teacher persona cloning**

Core idea:

> Through repeated interaction between a human teacher and AI students, the system extracts and builds a **decision-driven persona model**, not just language style.

---

## 2. Core Philosophy

### 2.1 Decision > Style

The system prioritizes:
- decision patterns
- teaching strategy
- behavioral consistency

over:
- wording style
- tone imitation

### 2.2 Persona = Function, Not Text

Persona is NOT:
- a paragraph
- a prompt description

Persona IS:
- a function of context → decision → expression

---

## 3. System Architecture (High Level)

The system contains 6 modules:

1. Student Simulator
2. Training Studio
3. Behavior Logger
4. Persona Extractor
5. Persona Model
6. Proxy Review

Do NOT collapse these into a single chat system.

---

## 4. Product Structure

Main pages:

- Dashboard
- Training Studio (CORE)
- Sessions
- Persona Model
- Proxy Review
- Config Lab (optional later)

Training Studio is the **primary focus**.

---

## 5. Development Priorities

### Phase 1 (MVP)

Focus ONLY on:

- UI structure
- mock data
- interaction flow
- basic state handling

DO NOT implement:

- real LLM orchestration
- vector database
- advanced memory
- production backend

---

## 6. Key Concepts

### 6.1 Student Types

Students are NOT fixed scripts.

They are parameterized by:
- level
- attitude
- confidence
- emotion
- error patterns

---

### 6.2 Sessions

A session is:
- one continuous teaching interaction
- composed of multiple turns

---

### 6.3 Persona Rules

Persona rules are extracted patterns such as:

- "encourages low-confidence students"
- "becomes strict on repeated mistakes"
- "prioritizes meaning before grammar"

They must:
- be traceable to sessions
- have confidence scores

---

### 6.4 Persona Model

Persona Model is versioned.

It includes:
- style rules
- decision rules
- value rules
- boundary rules

---

### 6.5 Proxy Review

This is CRITICAL.

It compares:
- human teacher response
vs
- AI proxy response

Goal:
> Identify where the proxy is NOT like the human

---

## 7. UI/UX Principles

- Desktop-first
- Multi-panel layout (like IDE)
- Information-dense but structured
- Minimal decorative UI
- Focus on clarity and control

Training Studio should feel like:
> an AI experiment console

---

## 8. Coding Principles

- Use TypeScript
- Keep components modular
- Avoid over-engineering
- Prefer readability over abstraction
- Use mock data first

---

## 9. What to Avoid

DO NOT:

- turn this into a chat app
- optimize for casual users
- over-focus on animations
- hide system logic behind UI
- generate fake "AI intelligence"

---

## 10. What to Emphasize

ALWAYS prioritize:

- structure clarity
- data traceability
- decision modeling
- inspectability (user can see WHY)

---

## 11. Codex Behavior Instructions

When implementing:

- Do NOT ask for unnecessary confirmations
- Make reasonable design decisions
- Keep consistency across pages
- Prefer working code over partial drafts
- Build complete, runnable components

---

## 12. Definition of Success (MVP)

The system is successful if:

1. Training sessions can be simulated
2. Persona rules can be extracted (even roughly)
3. Persona model page shows structured rules
4. Proxy review can compare responses

---

## 13. Future Direction (Do Not Implement Yet)

- real-time voice interaction
- long-term memory system
- automated persona evolution
- multi-agent orchestration

---

## 14. Final Reminder

CopyMe is NOT about generating responses.

It is about:

> capturing how a human **decides**, and making that reproducible.