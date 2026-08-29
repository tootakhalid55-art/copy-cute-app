// Journal posting for documents now happens atomically on the server:
// `post_document` (and `cancel_document`) RPCs transition the document and
// create/reverse the journal entry in one database transaction. The old
// browser-side bridge (doc event -> build lines in the client -> post_journal)
// could leave a posted document with no journal if the tab closed mid-flight,
// so it has been retired. Receipt/payment vouchers post inside the settlement
// RPCs (`create_receipt` / `create_payment`).
export function startAccountingSubscriber() {
  // no-op — kept so existing imports stay valid.
}
