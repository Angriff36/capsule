// The 27 columns of TPP's event export (Query Generator), word for word from
// the data map (work/tpp-capsule-data-map.md section 1), and where each one
// goes when the file is read (AC-274). A column with a field fills that
// documented field (src/lib/tppFieldDisposition.ts says which Capsule record
// field it lands in); a "kept" column stays with the whole row on the event's
// import link, word for word, for the side-by-side check.

export type EventListColumnHome =
  { readonly field: string } | { readonly kept: string };

export const TPP_EVENT_LIST_COLUMNS: Readonly<
  Record<string, EventListColumnHome>
> = {
  "Balance Due": {
    kept: "Money owed is worked out from Capsule invoices and payments; the old balance may miss QuickBooks and Nowsta payments.",
  },
  "Contact Company Name": { field: "ClientCompanyName" },
  "Contact First Name": { field: "ClientFirstName" },
  "Contact Last Name": { field: "ClientLastName" },
  "Event Date": { field: "EventDate" },
  "Event Total": { field: "TotalRevenue" },
  "Guest Count": { field: "ExpectedCount" },
  "Invoice No": { field: "EventID" },
  Occasion: { field: "Occasion" },
  "Sales Person": { field: "SalesPersonName" },
  "Service Style": { field: "ServiceStyle" },
  "BEO #": {
    kept: "Almost always empty in the export; the event number is the Invoice No.",
  },
  "Created Date": { field: "CreatedDate" },
  "Event Gratuity": {
    kept: "Part of the event total; Capsule works out gratuity on its own invoice.",
  },
  "Event Service Charge": {
    kept: "Part of the event total; Capsule works out the service charge on its own invoice.",
  },
  "Event Status": { field: "EventStatus" },
  "Event Status Name": {
    kept: "The words for the Event Status code, which is read instead.",
  },
  "Event SubTotal": {
    kept: "The event total less gratuity and service charge; Capsule works it out on its own invoice.",
  },
  "Event Title": { field: "EventName" },
  "Event Type": { field: "EventType" },
  "Referred From": { field: "ReferredFrom" },
  "Sales Person First Name": {
    kept: "Half of Sales Person, which is read instead.",
  },
  "Sales Person Last Name": {
    kept: "Half of Sales Person, which is read instead.",
  },
  "Service Style Name": {
    kept: "The same words as Service Style, which is read instead.",
  },
  "Venue Name": { field: "VenueName" },
  "Venue State": { field: "LocationState" },
  "Service Style Category": {
    kept: "Full Service or Drop Off; the service style already says which.",
  },
};
