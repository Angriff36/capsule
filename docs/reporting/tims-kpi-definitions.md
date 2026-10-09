# Tim's KPI definitions

Source: **Mangia Catering Co — L10 Sales Scorecard** ("Weekly Accountability
Report, Level 10 Meeting Ready", data as of April 17, 2026). It is the owner's
written KPI research for Tim: the file `Mangia_Sales_Report_EOS.html` in the
owner's Downloads/Telegram Desktop folder, next to the Round 4 sales report
(`Mangia_Sales_Report.html`). No other file named a TPP KPI playbook exists on
the owner's PC; this scorecard is the written definition the spec (CF-7.1-04)
asks the KPIs to copy.

Code: `src/features/reports/timsScorecard.ts` (`TIMS_KPIS` holds this same
list; `timsScorecard()` counts it). Record sets are the Mangia sales report's
(`src/features/reports/mangia/salesFigures.ts`):

| Scorecard stage (TPP) | Capsule events                                   |
| --------------------- | ------------------------------------------------ |
| Final (delivered)     | completed or closed out, priced above $0         |
| Confirmed             | approved, sales lock, executing or final, priced |
| Quote                 | quote, planning or waiting for approval          |
| Lost                  | cancelled                                        |

Periods use the event start date on the viewer's device clock. "YTD" is
Jan 1 to today; "last year" is Jan 1 to the same day last year. Win rate and
lost deals count every event dated this calendar year, later dates included:
the scorecard's "59 won" is more than its 40 delivered YTD events, so its won
count holds confirmed events still to come.

## The KPIs

| id                  | Scorecard card    | Scorecard rule                                                       | Capsule rule                                                                    | Figure meaning                  |
| ------------------- | ----------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------- |
| `ytd_revenue`       | YTD Revenue       | Delivered revenue Jan 1 to today, vs last year's same dates          | Sum of quoted prices of delivered events dated YTD; change vs last year YTD     | `dashboard.completed_revenue`   |
| `ytd_events`        | YTD Events        | Delivered events Jan 1 to today, vs last year                        | Count of delivered events dated YTD; change vs last year YTD                    | `dashboard.completed_events`    |
| `ytd_aev`           | AEV (YTD)         | YTD revenue / YTD events, vs last year                               | YTD revenue / YTD events; "Not known yet" with no events                        | `dashboard.completed_average`   |
| `win_rate`          | Win Rate (YTD)    | Won / total decided; 60% or more is "On Track"                       | Confirmed-or-delivered / (that + cancelled), events dated this year; 60% kept   | `dashboard.win_rate`            |
| `pipeline_value`    | Pipeline Value    | Value and count of open deals                                        | Quoted prices of quote, planning and waiting-for-approval events on file today  | `dashboard.pipeline_value`      |
| `weighted_forecast` | Weighted Forecast | Confirmed at 100% + Quote at 50%                                     | Confirmed-not-delivered value + 0.5 x open quote value, on file today           | `dashboard.weighted_forecast`   |
| `confirmed_value`   | Confirmed Value   | Value and count of confirmed events                                  | Quoted prices of confirmed events not delivered yet, on file today              | `dashboard.booked_ahead`        |
| `lost_ytd`          | Lost YTD          | Value and count of deals lost this year                              | Quoted prices of cancelled events dated this year, and how many                 | `dashboard.lost_revenue`        |

## Decisions

- **Win-rate denominator.** The scorecard prints "59 won / 95 total" but does
  not say what the 95 holds. Options: (a) won / (won + lost) — the same rule as
  the Mangia report and every other dashboard; open deals do not pull the rate
  down before the client answers; but it can read high while many quotes sit
  open. (b) won / every deal dated this year, open ones too — closer to a
  "total" of 95, but the rate drops each time a quote is sent and rises when it
  is answered, so it moves for no sales reason. Chose (a).
- **Waiting for approval** counts as a quote (50% in the forecast): the client
  has not said yes yet. Option against: count it as confirmed (100%) — higher
  forecast, but a "no" then removes money already counted.
- **Pipeline vs confirmed.** The scorecard's pipeline card mixes both stages
  without saying how. Capsule keeps them apart: pipeline = open quotes,
  confirmed = booked not delivered, so no event is in both cards.

## Other figures on the page

The food cost, profit, lead conversion, venue, service style, monthly trend
and top events figures below the scorecard are not on Tim's L10 scorecard. They
are Capsule's own figures; their rules are in
`src/features/reports/dashboardMetrics.ts` and show on the page under "How
these numbers are counted".

The scorecard's month and quarter targets ("Month Target $120K", "Q2 Target
$360K") are set by the leader, not counted: they live on the Company
Scorecard page's targets.
