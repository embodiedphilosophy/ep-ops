// The General Teaching Agreement: EP's standard agreement for teachers, merged from the 2025–26 contracts
// (Wisdom School 2026 Independent Contractor Agreement, the Guest Faculty Workshop Agreement and the Course
// Agreement). It is built in so it works before anyone adds it to the sheet. To change the wording, add a row
// named exactly "General Teaching Agreement" in Settings → Contracts: that row then replaces this text everywhere.
// Placeholders: see PLACEHOLDERS in faculty.js.
export const GENERAL_NAME = 'General Teaching Agreement';

export const GENERAL_BODY = `GENERAL TEACHING AGREEMENT

This Teaching Agreement ("Agreement") is made and entered into as of {{today}}, by and between Embodied Philosophy, LLC ("EP") and {{teacher_name}} ("Contractor", {{teacher_email}}).

1. TERM
This Agreement remains in effect for a minimum term of two (2) years from the date above. After the initial term, either party may end it with 30 days' written notice. EP may remove an offering from the Course Library at any time, including during the initial term, with notice to the Contractor.

2. SERVICES
Contractor will prepare, teach and facilitate the following live offering(s), as scheduled:
{{offerings_list}}

This Agreement also covers any further offering that EP and the Contractor agree in writing (email is enough), on the same terms unless that offering's own terms say otherwise.

For each offering, Contractor will provide:
  • a short bio and colour headshot, and the course details EP needs for its landing page;
  • readings and resources for students before the offering begins (all at once, or a week before each session);
  • slides as a PDF the day after each session;
  • for an offering the Contractor leads on their own, short blurbs for up to three promotional emails.
EP will list each of these, with due dates, on the Contractor's teacher dashboard.

3. INTELLECTUAL PROPERTY
Contractor keeps all ownership of their intellectual property, including all course content, teaching materials, slides, video and audio recordings, and curriculum.

Contractor grants EP a non-exclusive licence to publish, display and sell the offering(s) and their recordings through EP's learning platforms and any EP products derived from them, for the duration of this Agreement.

After the minimum term, Contractor may revoke this licence with 30 days' written notice. Once revoked, EP will no longer promote or sell the offering to new participants, but students who already enrolled keep their access.

4. RECORDINGS AND EDITING
EP records live sessions to make them available on demand. EP may trim or edit recordings to improve the flow of modules, adjust sound and lighting, remove Q&A or integration segments, leave out identifying student interaction, and leave out references to third-party platforms.

5. PROMOTION AND PUBLICITY
EP will feature each offering on its learning platform and keep it in the Course Library throughout the term, send promotional emails to its list, and may, at its discretion, run paid advertising.

Contractor grants EP the right to use their name, image and likeness in connection with the offering(s), including in promotional materials, advertising and on the course platform itself.

6. COMPENSATION
Fee: {{fee}}.
Any revenue share, profit share or affiliate commission is set out under "Offering-specific terms" below. Where none is set out, none applies.

7. PAYMENT
Fees are paid monthly, for the sessions taught that month (a fee for a whole offering is paid at the end of the month its last session is taught). Any affiliate or revenue-share payments are calculated and paid quarterly, if due, on January 31, April 30, July 31 and October 31.

Payments are made through Gusto, EP's payroll platform. Contractor will receive an invitation from Gusto to add their payment details; EP never sees their bank details.

Contractor is an independent contractor, not an employee. EP does not withhold any local, state or federal taxes. EP will issue IRS Form 1099 to Contractor at the end of each applicable calendar year.

8. OFFERING-SPECIFIC TERMS
{{terms_or_none}}

9. CONSENT
By signing below, both parties acknowledge and agree to the terms above. Contractor signs online by typing their full name and ticking the consent box. {{director}} countersigns for Embodied Philosophy, LLC.`;

export const GENERAL_TEMPLATE = { name: GENERAL_NAME, kind: 'General', body: GENERAL_BODY, active: 'TRUE', builtin: true };
