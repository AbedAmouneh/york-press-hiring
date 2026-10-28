# UI redesign brief (Oct 2026)

Goal: Asana-level polish for York Press Hiring. Designs are generated and reviewed in Google Stitch
(project "York Press Hiring Portal"), approved by Abed, then built screen by screen.

## Decisions (from Abed)
- Fresh look inspired by Asana; York yellow only as a small brand accent.
- All screen groups: navigation and lists, role page, request form and detail, settings, outreach and LinkedIn queue.
- Priorities: calm layout and typography, fast inline editing, dashboards and progress at a glance, delightful details.
- Build after approval, one pull request per screen group, with tests.
- Approved on 28 Oct 2026 with one rule: keep the process and the visuals simple, with little text.
  Short labels, no explanatory paragraphs, one main action per screen, details on demand (drawers, tooltips).
- Only show data the app really has. Stitch's invented content is dropped: open rates, InMail quota,
  HRIS sync, audit IDs, position codes, budgets, "Approve all" for LinkedIn notes.

Screens approved: `screens/01-home.png` to `screens/09-notifications.png`.

## Design system
| Token | Value | Use |
|---|---|---|
| App background | #F6F7F9 | Behind cards |
| Surface | #FFFFFF | Cards, panels, tables |
| Ink | #1E1F21 | Text, left sidebar |
| Muted text | #6D6E6F | Secondary text |
| Border | #E8E8EA | 1px borders, dividers |
| Primary (coral) | #F06A6A | The one action color: primary buttons, focus, active nav |
| Accents | purple #8D84E8, teal #4ECBC4, blue #4573D2, amber #F1BD6C, pink #F26FB2 | Department chips, avatars, charts only |
| Brand | York yellow #F5C518 | Logo mark only |
| Success / warning / danger | #5DA283 / #F1BD6C / #E8384F | Status chips, score bands |

Inter; type scale 24 / 18 / 14 / 12; 12px card radius, pill chips, 8px spacing grid; subtle shadow only on
popovers and side panels.

## App shell
Dark ink left sidebar: logo, Home, My tasks, Roles, Requests, Approvals (count), Outreach, LinkedIn queue,
Settings, Users (by role), user avatar and role at the bottom. Top bar: global search (roles, candidates),
coral "+ New request", notifications bell.

## Screens
1. **Home** per role. Recruiter: greeting, 4 metrics (open roles, screened this week, Top 10 waiting for the hiring
   manager, emails sent today vs cap), My tasks, roles in progress with stage bar (Approved, Sourcing, Top 10 ready,
   Interviews, Hired), activity feed. CEO: approvals waiting first. Manager: my requests and their stage.
2. **Roles list**: cards or rows with code, title, department chip, location, stage bar, screened, Top 10 average,
   contacted, hiring manager Yes count, last run.
3. **Role page**: header (code, title, department, location, status, actions: Refresh, CSV, Close role); metric strip;
   tabs Top 10, All screened, CVs received, Runs and cost, Scorecard and brief. Candidate table: rank, avatar initials,
   name, sample badge, current title and company, source, score with colored bar, status chip, inline Yes / Maybe / No,
   outreach chip. Clicking a row opens a right side panel: score breakdown (7 weighted criteria), why recommended,
   gaps, red flags, experience timeline, education, contact (only if allowed), outreach history, HM comment box.
4. **Request form**: sectioned, two-column, sticky summary on the right (position, location, level, budget,
   completeness), saved-position picker, location picker, inline validation, Submit to Khalil / Save draft.
5. **Request detail**: status header, approval timeline (submitted, changes requested, approved), CEO actions
   (Approve, Request changes, Reject with comment), all request details read-only.
6. **Approvals** (CEO): queue of cards with key facts (title, department, budget, headcount, justification) and
   one-click Approve / Request changes.
7. **Outreach**: email queue (queued, sent, failed) with daily cap progress and kill switch; LinkedIn queue as
   approval cards (edit note, Approve, Mark as sent); sent emails log.
8. **Settings**: left sub-navigation (Sending and scoring, Positions, Locations, Templates, Do-not-contact,
   Usage and cost); Users table with role chips and invites.
9. **Notifications**: inbox style, unread dots, grouped by day.

## States to cover
Empty states with a friendly illustration and one clear action, loading skeletons, error toasts, success toasts,
hover rows, keyboard focus rings, mobile collapse of the sidebar.
