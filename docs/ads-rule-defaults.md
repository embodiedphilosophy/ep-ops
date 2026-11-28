# Ads rule defaults: Ops' own numbers, and how they differ from Make's Ad Agent

**Decision (Jake, Nov 2026): when Ops' morning rules are switched on, they use Ops' own defaults, not Make's numbers.**
Make's Ad Agent is still on AUTO today (Ad Agent tab, EP Revenue & Metrics sheet) and acts on every ad set in the account. Ops' rules apply only to campaigns built in Ops, and only when all three locks are open: `OPS_LIVE=1`, `META_ADS_LIVE=live`, and Make's Ad Agent mode OFF. Switch Make off before switching Ops' rules on, so two systems never act on the same ad sets.

| | Ops (`RULE_DEFAULTS` in `lib/ops/adsplan.js`, `ensureRules` in `lib/ops/adsdraft.js`) | Make's Ad Agent (as read from the sheet) |
|---|---|---|
| Turn off | below **1.2×** return, after **$40** spent | pause below **1.5×**, after **$40** spent; also a "no sale" cutoff at **$75** |
| Raise | at **1.5×** or better | scale at **2.0×**; "golden" at **3.0×** also widens audiences |
| Step | **+20%**, at most every **48 hours** | +20% steps; days between raises set on the sheet |
| Ceiling | **$60** a day per ad set (editable per campaign) | a "Max daily budget per ad set" cell on the sheet |
| Leads | raise at **$1.50** or less per lead, turn off above **$2.50** | target cost per lead **$2** |
| Traffic campaigns | no automatic rules | judged like the rest |
| Extra guards | real sales (Kit and Circle) can lower the number, never raise it; a raise needs matched real sales; every action is logged and reversible | needs 3 purchases before scaling |

Why Ops' lower turn-off line: the goal is at least $1.50 back for every $1 spent, sustained. The 1.2× line turns off ads that are clearly losing; the 1.5× raise line only scales ads that are already at the goal, so there is a gap where an ad is left to keep learning. Both are editable on each campaign page and in Ads › Settings.
