# Fix the card checkout form (Send flow, Step 1)

Today the card entry fields are always rendered under the saved-card list, so users with a saved card see a redundant blank form. The new-card form should appear only when the user asks for it, or when they have no saved card at all.

## Behaviour after the fix

- **No saved cards:** the card entry form is shown immediately (as it is today), with no extra click.
- **Has saved cards:** the saved-card list is shown with one selected, plus the "+ Quick add new card" row. No entry form until that row is clicked.
- **Clicking "+ Quick add new card":** reveals the entry form inline, prefilled with the cardholder name from the selected saved card (and its expiry, when available). A "Cancel" link collapses the form and returns to the saved-card selection.
- **Selecting a saved card while the form is open:** collapses the form back to the masked saved-card row.
- The step-1 "Continue" button stays disabled while the new-card form is open and incomplete; when a saved card is selected and the form is closed, the saved card's details satisfy the step.

## Technical notes

- `src/components/send/MethodCheckoutPanel.tsx`: gate the `CardFieldsInputs` block on a new `showCardForm` prop instead of `inlineEntry` alone (`inlineEntry && showCardForm`). Keep the "Quick add new card" row calling `onAddCard`, and add a small "Cancel" text button under the form when saved cards exist.
- `src/pages/SendPage.tsx`: add `showNewCardForm` state. Default it to `true` when `savedCards.length === 0` and the card rail is inline, `false` otherwise (effect keyed on `savedCards.length` / funding source). Change `onAddCard` from opening `AddCardModal` to setting `showNewCardForm` true and prefilling `cardFields.name` / expiry from `activeSavedCard`. Selecting a saved card via `onCardChange` sets `showNewCardForm` false.
- Step-1 validation (`isStep1Valid`): require `isCardFieldsValid(cardFields)` only when `inlineCardEntry && showNewCardForm`; otherwise require a selected saved card.
- Step 3 stays unchanged — it already renders the masked "Paying with …" summary plus the pay button.
- No database or edge-function changes.
