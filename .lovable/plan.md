## Add Grid/List view toggle to Contacts page

### What
Add a toggle on the `/contacts` page so users can switch between the existing card grid and a compact list layout.

### How
1. **State**: Add `viewMode: 'grid' | 'list'` state (default `'grid'`).
2. **Toggle UI**: Place an icon toggle (LayoutGrid / List) next to the search bar, styled with existing Button/Toggle components.
3. **Grid view**: Keep the current 3-column responsive card grid unchanged.
4. **List view**: Render contacts as compact rows: avatar, name + method, transfer count, last sent date, and action buttons (Send, Edit, Delete) in a single horizontal line. Use the existing `Card`/`div` structure for consistency.
5. **Persistence**: Save the chosen view mode to `localStorage` so it persists across visits.

### Files changed
- `src/pages/ContactsPage.tsx` — add state, toggle UI, and list layout markup.

No database or backend changes required.