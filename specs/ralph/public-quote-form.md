# Quote submission → proposal conversion

_Serves JTBD(s):_ Clients — "price their event from a phone"; Sales staff —
"see every open lead and its next action".

## Job Statement

A prospect's public quote submission must land as a reviewable lead with all
their selections, and a salesperson must be able to turn it into a branded
proposal without re-keying the client, date, headcount, or menu choices.

## Acceptance Criteria

- [ ] A submitted quote appears in the sales staff's queue with contact,
      event date, guest count, service style, occasion, venue text, and menu
      selections exactly as the prospect entered them
- [ ] Converting a submission creates (or links to) the client record and
      pre-fills a draft proposal with the prospect's selections in one action
- [ ] The submission is deduplicated: re-submitting the same prospect's form
      does not create a second lead for the same event date + contact
- [ ] Duplicate or junk submissions can be dismissed without deleting the
      raw submission
- [ ] Conversion works when reference catalogs (service style / occasion)
      contain no matching row — the value surfaces as text, never a crash
- [ ] After conversion the salesperson reaches the created proposal in one
      click from the quote queue and from the lead pipeline, and the quote
      queue is reachable from the lead pipeline (the "next action" half of
      the Sales JTBD)
- [ ] A conversion that fails part-way shows which records were already
      created (client, lead, event, proposal), can be retried, and can be
      dismissed — no partial record is unreachable from the queue

## Out of Scope

- Self-service menu browsing/pricing depth beyond what the public quote form
  already collects — the form's scope is fixed
- Social DM ingestion — separate spec, blocked on provider prerequisites

## Open Questions

- Where the conversion queue lives (sales leads page vs quote review page) —
  follow the existing LeadPipelinePage pattern
