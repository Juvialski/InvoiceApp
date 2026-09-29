# Excel Simplicity Pass — video reference

This short note records the local design reference used for the Excel Simplicity Pass. The downloaded portrait MP4 in the local Downloads folder is 136 seconds long and was reviewed from beginning to end with timestamped frames at two frames per second. The reel URL from the handoff was used only to identify the clip. The video and temporary extracted frames are not part of the repository.

## What the clip showed

- It begins with a contractor handling paperwork, a receipt, a calculator, and a phone beside a laptop. The spreadsheet is presented as a quick working surface for routine project, expense, and payment entry.

- The workbook occupies nearly the whole screen. Its data sheets use short rows, compact headings, thin gridlines, restrained text, and small tabs along the bottom.

- A selected cell has a clear outline. Clicking a writable cell lets the user type in place; bounded choices such as project, payment type, and payment method use a native dropdown only while editing.

- The workbook keeps its dashboard, readme, and cost calculators on separate tabs, away from the routine entry grid.

## Applied to HydroQualiSense

- Give `/workbook` more of the available viewport and put the worksheet before import/export tools.

- Use a flat canvas, compact cell spacing, subtle gridlines, a clear selected-cell outline, and input controls that sit inside the active cell.

- Keep single-click editing, keyboard navigation, paste, protected fields, validation, and conflict treatment in the shared editor. Keep save/discard state visible in a compact action row.

- Apply the same shared cell treatment to embedded worksheets. Preserve Supplier Invoice source-on-left and extracted-data-on-right review at suitable desktop widths.

## Deliberately not copied

- No Excel ribbon, formula bar, formula engine, new keyboard feature set, or exact spreadsheet structure.

- No yellow fill as the sole editability cue, user-authored formulas, dashboard calculations, or embedded calculators. HydroQualiSense permissions, lifecycle workflows, source evidence, and financial calculations remain authoritative.

- No large readme or tutorial content inside the working grid. Supporting instructions remain secondary to the cells.
