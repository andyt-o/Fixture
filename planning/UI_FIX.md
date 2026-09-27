### Expanded palette direction

Your current palette is coherent, but it is too compressed around teal, mint, and blue-gray. That is why the interface feels visually flat even though the colors themselves are pleasant.

The main improvement is not to replace the palette, but to add intermediate neutrals, stronger interactive states, and a few more saturated semantic colors.

I would keep your existing colors as anchors and add the following:

1. `Deep Teal` — `#2F6F68`  
   Use for stronger button borders, selected states, active tabs, and emphasized iconography in light mode.

2. `Teal Hover` — `#4FA398`  
   Use for hover states where `#64b6ac` is currently too soft.

3. `Teal Bright` — `#7DD3C7`  
   Useful for dark-mode hover states and secondary accents.

4. `Mist Aqua` — `#EAFBF7`  
   A softer surface than `#DAFFEF`. This gives you another layer between pure background and strongly selected mint sections.

5. `Cool Gray` — `#8A9AA3`  
   Use for secondary text in light mode when `#5d737e` feels too dark, or in dark mode when `#5d737e` feels too dim.

6. `Steel Gray` — `#3D4D56`  
   Good for dark-mode secondary surfaces, inactive controls, separators, and cards.

7. `Soft White` — `#F4FAF7`  
   Useful for light-mode elevated cards where `#fcfffd` and `#daffef` currently create too much contrast or too little separation depending on context.

8. `Amber` — `#E9A23B`  
   Better for warnings than your current orange because it reads more clearly against both teal and mint.

9. `Success Teal-Green` — `#4FAE7A`  
   Slightly more restrained than `#6bcb77`, which can look too bright beside your muted teal system.

10. `Error Strong` — `#C94A4A`  
    Useful for borders, validation text, and destructive actions. Keep `#e05c5c` as the softer fill or hover state.

11. `Info Blue` — `#5E8FD8`  
    This gives you a non-teal informational color so not every state looks like part of the same hierarchy.

12. `Focus Ring` — `#8CE7DB`  
    Use specifically for keyboard focus outlines. It complements the palette without being confused with a normal border.

### Recommended token structure

Your current variables mix raw palette colors and semantic usage. I would add more semantic tokens so the UI can change without hunting through components.

For example, keep `--color-accent: #64b6ac`, but add concepts such as:

`--color-accent-hover: #4fa398`

`--color-accent-strong: #2f6f68`

`--color-surface-raised`

`--color-surface-selected`

`--color-border-subtle`

`--color-border-strong`

`--color-text-secondary`

`--color-text-disabled`

`--color-focus`

That will help considerably once the interface grows.

For your specific design, one of the biggest problems is that `--color-border` is doing too much work. It currently seems to represent card borders, input borders, dividers, active states, and sometimes decoration. Those should not all have identical visual weight.

### UI fixes

1. Increase border hierarchy.

The sidebar cards currently have almost the same border strength regardless of whether they are active, inactive, nested, or decorative.

Use three levels:

`subtle border` for ordinary cards

`standard border` for controls

`strong/accent border` for selected or active sections

For example, the selected Chat container should have a noticeably stronger outline than Jira, Code Editor, or Email.

2. Darken interactive text in light mode.

The current teal used for Connect buttons is too light against the pale surfaces.

Use `#2F6F68` or something close for button text and borders in light mode. Keep `#64B6AC` for decorative accents.

This alone would make the interface feel substantially sharper.

3. Strengthen button affordance.

The Connect buttons currently look closer to tags or labels than actionable controls.

Give them one or more of the following:

a slightly stronger border

a faint accent background

a more visible hover fill

a stronger font weight

a clearer pressed state

The default state should still be restrained, but the hover state should become visually obvious.

4. Separate selected surfaces from normal surfaces.

Your active Chat panel currently uses a mint background that is visually close to the surrounding cards.

Use the stronger `#DAFFEF` for selected sections, and something closer to `#EAFBF7` or `#FCFFFD` for ordinary cards.

That creates a much clearer active hierarchy.

5. Improve section-header contrast.

The “AI / LLM Providers” header appears structurally important but visually weak.

Use a stronger bottom border or a slightly different surface color. You could also use the stronger teal for the disclosure arrow and icon.

6. Reduce reliance on pale mint borders.

A large portion of the UI is outlined in very light teal or mint.

This creates a “wireframe” feeling rather than a finished application.

Use pale borders only for low-priority containers. Interactive controls should use darker, more deliberate borders.

7. Fix vertical alignment in the top title bar.

Your title-bar controls should all sit within identical-height containers.

The likely implementation should use a consistent control box size, then center the icon inside that box independently.

Do not rely on the intrinsic SVG dimensions to determine alignment.

Some icons appear vertically offset because their SVG view boxes likely include different amounts of internal whitespace.

8. Normalize icon dimensions.

Give sidebar icons and title-bar icons a fixed visual size rather than merely a fixed CSS width.

For example, all primary sidebar icons should occupy roughly the same perceived 14–16 px visual footprint.

Discord, Slack, Teams, Jira, browser, email, and editor icons currently have different visual weights.

9. Normalize right-side dropdown controls.

The small square selector buttons for Code Editor, Browser, and Email should share:

the same width

the same height

the same border radius

the same icon size

the same internal padding

the same vertical alignment

Right now they look mechanically similar but not optically identical.

10. Increase muted-text contrast slightly.

Some descriptive text is difficult to read at a glance.

Your `#5d737e` works reasonably well on white, but on mint surfaces it can become subdued.

You could use a slightly darker muted token in light mode, something around `#4A626D`, while keeping `#5d737e` as a tertiary text color.

11. Distinguish disabled from secondary.

At the moment, some UI elements look disabled simply because their contrast is low.

You should separate:

secondary text

disabled text

inactive icons

decorative icons

Disabled should be visibly weaker than normal secondary content.

12. Give hover states stronger surface feedback.

Your interface is currently very border-driven.

I would introduce slightly stronger background changes on hover.

For example, a Connect button could shift from transparent to a pale teal fill, and a sidebar card could gain a very subtle aqua background.

That gives the interface more responsiveness without making it colorful.

13. Make active states more obvious than hover states.

This is important because your UI uses expandable sections.

A hover might use `Mist Aqua`.

An active/selected section might use `Frozen Water`.

A pressed state might use a slightly stronger teal tint.

These should not all look almost identical.

14. Add a dedicated focus state.

Keyboard focus should not reuse your normal border.

Use something like `#8CE7DB`, preferably with a 2 px focus ring and a slight offset.

That will improve both accessibility and visual consistency.

15. Strengthen the dashboard button.

The “Go to Dashboard” button has the same understated treatment as secondary controls, but functionally it appears more important.

It should probably be treated as a primary or prominent secondary action.

A filled teal button with darker text, or a stronger outlined button, would give the page a more obvious exit/continue action.

16. Reduce the amount of visually identical teal.

You currently use teal for borders, buttons, highlights, selection, icon decoration, and interactive text.

That weakens semantic meaning.

Reserve your strongest teal for interaction and state.

Use gray-blue for neutral structure.

Use mint for surfaces.

Use bright aqua for focus or highlighted information.

17. Refine dark-mode surfaces.

For dark mode, `#0D1317` and `#1B242A` are good anchors, but you need one intermediate raised surface.

Something around `#263139` would work well for menus, hover surfaces, or elevated cards.

Without it, dark mode may end up with the same flattening problem as light mode.

18. Increase dark-mode border contrast selectively.

`#5D737E` is suitable for important borders, but may be too strong if applied everywhere.

Use something closer to `#34434B` for subtle boundaries, while reserving `#5D737E` for active controls and higher-priority edges.

19. Use semantic colors more selectively.

Your purple, orange, red, green, and violet accents should be associated with clear meanings.

For example:

purple for AI/provider-related features

blue for information

green for success/connected

orange for warning/pending

red for error/disconnected

violet for optional advanced features

If they are used arbitrarily, they will compete with the teal identity.

20. Increase contrast before increasing saturation.

The interface does not primarily need “more colorful” colors. It needs better luminance separation.

Your design can remain restrained and still feel much stronger by making borders, text, buttons, and active states more distinct from their surrounding surfaces.

### Highest-priority changes

If you only change a few things, I would prioritize: darker interactive teal in light mode, a separate subtle-border token, a separate selected-surface token, stronger button hover states, darker secondary text, and normalized icon/button alignment.

Those changes should preserve the current Fixture visual identity while making the UI significantly clearer and more polished.